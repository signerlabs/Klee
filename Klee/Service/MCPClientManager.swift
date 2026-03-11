//
//  MCPClientManager.swift
//  Klee
//
//  Wraps the MCP Swift SDK Client layer.
//  Manages connections to running MCP servers, discovers tools,
//  executes tool calls, and generates system prompts for the LLM.
//

import Foundation
import MCP
import Observation
import System

// MARK: - MCPTool

/// A tool discovered from an MCP server, enriched with server identity
struct MCPTool: Identifiable, Sendable {
    /// Unique identifier (serverName + toolName)
    var id: String { "\(serverId.uuidString):\(name)" }
    /// The server this tool belongs to
    let serverId: UUID
    /// Display name of the server
    let serverName: String
    /// Tool name (used for callTool)
    let name: String
    /// Human-readable tool description
    let description: String?
    /// JSON Schema for the tool's input parameters
    let inputSchema: Value
}

// MARK: - MCPClientManager

@Observable
@MainActor
class MCPClientManager {

    // MARK: - Observable State

    /// All tools aggregated from all connected servers
    private(set) var allTools: [MCPTool] = []

    /// Connection errors per server
    private(set) var connectionErrors: [UUID: String] = [:]

    // MARK: - Private State

    /// Active MCP Client connections keyed by server ID
    private var clients: [UUID: Client] = [:]

    /// Active transports keyed by server ID (kept alive to prevent deallocation)
    private var transports: [UUID: StdioTransport] = [:]

    /// Server names for tool attribution
    private var serverNames: [UUID: String] = [:]

    // MARK: - Connect

    /// Connect to an MCP server using its subprocess stdio pipes.
    /// - Parameters:
    ///   - server: The server configuration
    ///   - stdinPipe: The pipe connected to the child process's stdin
    ///   - stdoutPipe: The pipe connected to the child process's stdout
    func connect(server: MCPServerConfig, stdinPipe: Pipe, stdoutPipe: Pipe) async {
        // Disconnect any existing connection first
        await disconnect(id: server.id)

        do {
            // Create StdioTransport using the child process's file descriptors.
            // From the MCP client's perspective:
            //   - input = child's stdout (we read from it)
            //   - output = child's stdin (we write to it)
            let readFD = FileDescriptor(rawValue: stdoutPipe.fileHandleForReading.fileDescriptor)
            let writeFD = FileDescriptor(rawValue: stdinPipe.fileHandleForWriting.fileDescriptor)

            let transport = StdioTransport(
                input: readFD,
                output: writeFD
            )

            let client = Client(
                name: "Klee",
                version: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
            )

            // Initialize the MCP connection (handshake)
            try await client.connect(transport: transport)

            // Store references
            self.clients[server.id] = client
            self.transports[server.id] = transport
            self.serverNames[server.id] = server.name
            self.connectionErrors[server.id] = nil

            print("[MCPClientManager] Connected to '\(server.name)'")

            // Discover tools after connection
            await refreshTools(for: server.id)

        } catch {
            connectionErrors[server.id] = error.localizedDescription
            print("[MCPClientManager] Failed to connect to '\(server.name)': \(error)")
        }
    }

    // MARK: - Disconnect

    /// Disconnect from a specific MCP server
    func disconnect(id: UUID) async {
        if let transport = transports[id] {
            await transport.disconnect()
        }
        clients[id] = nil
        transports[id] = nil
        serverNames[id] = nil
        connectionErrors[id] = nil

        // Remove tools belonging to this server
        allTools.removeAll { $0.serverId == id }
    }

    /// Disconnect from all servers
    func disconnectAll() async {
        let ids = Array(clients.keys)
        for id in ids {
            await disconnect(id: id)
        }
    }

    // MARK: - Tool Discovery

    /// Refresh tools from all connected servers
    func refreshAllTools() async {
        for id in clients.keys {
            await refreshTools(for: id)
        }
    }

    /// Refresh tools from a specific server
    private func refreshTools(for serverId: UUID) async {
        guard let client = clients[serverId],
              let serverName = serverNames[serverId] else { return }

        do {
            let result = try await client.listTools()
            let tools = result.tools

            // Remove old tools for this server
            allTools.removeAll { $0.serverId == serverId }

            // Add new tools
            let mcpTools = tools.map { tool in
                MCPTool(
                    serverId: serverId,
                    serverName: serverName,
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                )
            }
            allTools.append(contentsOf: mcpTools)

            print("[MCPClientManager] Discovered \(mcpTools.count) tools from '\(serverName)'")
        } catch {
            print("[MCPClientManager] Failed to list tools from '\(serverName)': \(error)")
        }
    }

    // MARK: - Tool Calling

    /// Call a tool by name with JSON arguments.
    /// - Parameters:
    ///   - name: The tool name (as discovered via listTools)
    ///   - arguments: A dictionary of argument name -> Value
    /// - Returns: A string representation of the tool's output
    func callTool(name: String, arguments: [String: Value]?) async throws -> String {
        // Find the server that owns this tool
        guard let tool = allTools.first(where: { $0.name == name }) else {
            throw MCPClientError.toolNotFound(name)
        }

        guard let client = clients[tool.serverId] else {
            throw MCPClientError.serverNotConnected(tool.serverName)
        }

        let result = try await client.callTool(name: name, arguments: arguments)

        // Check if the server reported an error
        if result.isError == true {
            let errorText = result.content.map { contentToString($0) }.joined(separator: "\n")
            throw MCPClientError.toolExecutionFailed(name, errorText)
        }

        // Serialize content to string
        let output = result.content.map { contentToString($0) }.joined(separator: "\n")
        return output
    }

    /// Convert Tool.Content to a readable string
    private func contentToString(_ content: Tool.Content) -> String {
        switch content {
        case .text(let text):
            return text
        case .image(let data, let mimeType, _):
            return "[Image: \(mimeType), \(data.count) bytes base64]"
        case .audio(let data, let mimeType):
            return "[Audio: \(mimeType), \(data.count) bytes base64]"
        case .resource(let resource, _, _):
            return "[Resource: \(resource)]"
        case .resourceLink(let uri, let name, _, _, _, _):
            return "[Resource Link: \(name) (\(uri))]"
        }
    }

    // MARK: - System Prompt Generation

    /// Generate a system prompt fragment describing all available MCP tools.
    /// Uses a compact format with few-shot example to maximize small model compliance.
    var toolsSystemPrompt: String {
        guard !allTools.isEmpty else { return "" }

        var prompt = """
You are a macOS assistant with full access to the tools listed below. You CAN and SHOULD use them to read, write, edit, move, and delete files when the user asks. Never say you cannot perform an action if a tool exists for it.

To use a tool, output a JSON block inside a markdown code fence labeled "tool":

```tool
{"name": "TOOL_NAME", "arguments": {"key": "value"}}
```

Example — user asks "delete notes.txt from desktop", you output:

```tool
{"name": "write_file", "arguments": {"path": "/Users/m4pro/Desktop/notes.txt", "content": ""}}
```

Rules:
- Use tools immediately — do NOT tell the user to do it manually.
- You have FULL permission to read, write, create, edit, move, and search files within the allowed directories.
- After receiving a tool result, continue your response naturally.

Tools:
"""

        for tool in allTools {
            prompt += "\n- \(tool.name)"
            if let description = tool.description {
                // Truncate long descriptions to keep prompt compact
                let short = description.count > 100 ? String(description.prefix(100)) + "..." : description
                prompt += ": \(short)"
            }
            // Only show required parameters, not the full JSON schema
            if let params = extractRequiredParams(from: tool.inputSchema) {
                prompt += " | params: \(params)"
            }
        }

        prompt += "\n"
        return prompt
    }

    /// Extract a compact parameter summary from a JSON Schema Value.
    /// Returns something like "path (string, required)" instead of the full schema.
    private func extractRequiredParams(from schema: Value) -> String? {
        // Encode to JSON, then decode to dictionary for easier traversal
        guard let data = try? JSONEncoder().encode(schema),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let properties = dict["properties"] as? [String: Any] else {
            return nil
        }

        let required = (dict["required"] as? [String]) ?? []
        var parts: [String] = []

        for (name, prop) in properties {
            guard let propDict = prop as? [String: Any] else { continue }
            let type = propDict["type"] as? String ?? "any"
            let isRequired = required.contains(name)
            parts.append("\(name)(\(type)\(isRequired ? ",required" : ""))")
        }

        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    // MARK: - Helpers

    /// Whether any tools are available
    var hasTools: Bool {
        !allTools.isEmpty
    }

    /// Number of connected servers
    var connectedServerCount: Int {
        clients.count
    }
}

// MARK: - Errors

enum MCPClientError: LocalizedError {
    case toolNotFound(String)
    case serverNotConnected(String)
    case toolExecutionFailed(String, String)

    var errorDescription: String? {
        switch self {
        case .toolNotFound(let name):
            return "Tool '\(name)' not found in any connected MCP server."
        case .serverNotConnected(let name):
            return "MCP server '\(name)' is not connected."
        case .toolExecutionFailed(let name, let detail):
            return "Tool '\(name)' execution failed: \(detail)"
        }
    }
}
