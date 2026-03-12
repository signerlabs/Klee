//
//  MCPServerConfig.swift
//  Klee
//
//  Configuration for an MCP (Model Context Protocol) server.
//  Persisted via MCPServerStore.
//

import Foundation

/// Represents a single MCP server configuration
struct MCPServerConfig: Identifiable, Codable, Equatable {
    var id: UUID
    var name: String            // Display name, e.g. "Playwright Browser"
    var command: String         // npx command target, e.g. "@playwright/mcp"
    var args: [String]          // Extra CLI arguments
    var env: [String: String]   // Environment variables (API keys, tokens)
    var isEnabled: Bool
    var isBuiltIn: Bool         // true = official built-in connector, immutable by user

    init(
        id: UUID = UUID(),
        name: String = "",
        command: String = "",
        args: [String] = [],
        env: [String: String] = [:],
        isEnabled: Bool = true,
        isBuiltIn: Bool = false
    ) {
        self.id = id
        self.name = name
        self.command = command
        self.args = args
        self.env = env
        self.isEnabled = isEnabled
        self.isBuiltIn = isBuiltIn
    }

    // Handle decoding from older JSON that lacks isBuiltIn field
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        command = try container.decode(String.self, forKey: .command)
        args = try container.decode([String].self, forKey: .args)
        env = try container.decode([String: String].self, forKey: .env)
        isEnabled = try container.decode(Bool.self, forKey: .isEnabled)
        isBuiltIn = try container.decodeIfPresent(Bool.self, forKey: .isBuiltIn) ?? false
    }
}

// MARK: - Built-in Connector Definitions

/// Static definitions for official built-in connectors.
/// These are injected automatically on first launch or app update.
struct BuiltInConnector {
    let stableID: String        // Stable identifier (never changes across versions)
    let name: String
    let description: String
    let command: String
    let args: [String]
    let icon: String            // SF Symbol name

    /// Deterministic UUID derived from stableID so built-in connectors survive re-injection
    var id: UUID {
        UUID(uuidString: stableIDToUUID(stableID)) ?? UUID()
    }

    /// Convert stable string ID to deterministic UUID v5-style (simple hash approach)
    private func stableIDToUUID(_ string: String) -> String {
        // Use a fixed namespace to generate deterministic UUIDs
        let hashable = "com.signerlabs.klee.builtin.\(string)"
        var hash = hashable.utf8.reduce(into: [UInt8](repeating: 0, count: 16)) { result, byte in
            for i in 0..<16 {
                result[i] = result[i] &+ byte &+ UInt8(i)
            }
        }
        // Set UUID version 5 bits
        hash[6] = (hash[6] & 0x0F) | 0x50
        hash[8] = (hash[8] & 0x3F) | 0x80

        let hex = hash.map { String(format: "%02x", $0) }.joined()
        let idx = hex.startIndex
        func sub(_ start: Int, _ len: Int) -> String {
            let s = hex.index(idx, offsetBy: start)
            let e = hex.index(s, offsetBy: len)
            return String(hex[s..<e])
        }
        return "\(sub(0,8))-\(sub(8,4))-\(sub(12,4))-\(sub(16,4))-\(sub(20,12))"
    }

    func toConfig(enabled: Bool = true) -> MCPServerConfig {
        MCPServerConfig(
            id: id,
            name: name,
            command: command,
            args: args,
            env: [:],
            isEnabled: enabled,
            isBuiltIn: true
        )
    }

    /// All official built-in connectors
    static let all: [BuiltInConnector] = [
        BuiltInConnector(
            stableID: "web-browser",
            name: "Web Browser",
            description: "Browse and interact with any website",
            command: "@playwright/mcp",
            args: [
                "--user-data-dir",
                FileManager.default.homeDirectoryForCurrentUser
                    .appendingPathComponent("Library/Caches/Klee/browser-profile").path
            ],
            icon: "globe"
        ),
        BuiltInConnector(
            stableID: "filesystem",
            name: "Filesystem",
            description: "Read and write local files",
            command: "@modelcontextprotocol/server-filesystem",
            args: ["/Users"],
            icon: "folder"
        ),
    ]

    /// Look up a built-in definition by UUID
    static func find(by id: UUID) -> BuiltInConnector? {
        all.first { $0.id == id }
    }
}
