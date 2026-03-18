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
@preconcurrency import MLXLMCommon
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
            throw KleeError.toolNotFound(name)
        }

        guard let client = clients[tool.serverId] else {
            throw KleeError.serverNotConnected(tool.serverName)
        }

        let result = try await client.callTool(name: name, arguments: arguments)

        // Check if the server reported an error
        if result.isError == true {
            let errorText = result.content.map { contentToString($0) }.joined(separator: "\n")
            throw KleeError.toolExecutionFailed(name, errorText)
        }

        // Serialize content to string
        let output = result.content.map { contentToString($0) }.joined(separator: "\n")
        return output
    }

    /// Convert Tool.Content to a readable string
    private func contentToString(_ content: MCP.Tool.Content) -> String {
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

    // MARK: - Native Tool Specs (for MLX Swift tool calling API)

    /// Convert all MCP tools to MLX Swift ToolSpec format for native tool calling.
    /// ToolSpec is [String: any Sendable] matching OpenAI function calling schema.
    var toolSpecs: [[String: any Sendable]]? {
        guard !allTools.isEmpty else { return nil }

        return allTools.map { tool -> [String: any Sendable] in
            // Convert MCP Value inputSchema to [String: Any] dictionary
            var parameters: [String: any Sendable] = ["type": "object"]
            if let data = try? JSONEncoder().encode(tool.inputSchema),
               let dict = try? JSONSerialization.jsonObject(with: data) as? [String: any Sendable] {
                parameters = dict
            }

            return [
                "type": "function",
                "function": [
                    "name": tool.name,
                    "description": tool.description ?? "",
                    "parameters": parameters,
                ] as [String: any Sendable],
            ] as [String: any Sendable]
        }
    }

    /// Behavioral system prompt for tool calling (no tool definitions — those go via native API).
    var toolBehaviorPrompt: String {
        guard !allTools.isEmpty else { return "" }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return """
            You are a macOS assistant with full access to tools. Use tools immediately when they can help — do NOT tell the user to do it manually. You have FULL permission to read, write, create, edit, move, and search files within the allowed directories. After receiving a tool result, continue your response naturally to the user.

            The current user's home directory is: \(home)
            Use absolute paths. For example: Desktop = \(home)/Desktop, Documents = \(home)/Documents.
            """
    }

    /// Call a tool by name with arguments from MLX's JSONValue format.
    /// Used when the native tool calling API returns a ToolCall.
    func callToolFromNative(name: String, arguments: [String: MLXLMCommon.JSONValue]) async throws -> String {
        // Convert JSONValue arguments to MCP Value arguments
        let mcpArgs = try convertJSONValueToMCPValues(arguments)
        return try await callTool(name: name, arguments: mcpArgs)
    }

    /// Convert MLX JSONValue dictionary to MCP Value dictionary
    private func convertJSONValueToMCPValues(_ dict: [String: MLXLMCommon.JSONValue]) throws -> [String: Value] {
        var result: [String: Value] = [:]
        for (key, val) in dict {
            result[key] = convertJSONValueToMCPValue(val)
        }
        return result
    }

    /// Convert a single MLX JSONValue to MCP Value
    private func convertJSONValueToMCPValue(_ val: MLXLMCommon.JSONValue) -> Value {
        switch val {
        case .null: return .null
        case .bool(let b): return .bool(b)
        case .int(let i): return .int(i)
        case .double(let d): return .double(d)
        case .string(let s): return .string(s)
        case .array(let arr): return .array(arr.map { convertJSONValueToMCPValue($0) })
        case .object(let obj):
            var dict: [String: Value] = [:]
            for (k, v) in obj { dict[k] = convertJSONValueToMCPValue(v) }
            return .object(dict)
        }
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

