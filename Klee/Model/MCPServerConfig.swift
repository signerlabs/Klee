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

    init(
        id: UUID = UUID(),
        name: String = "",
        command: String = "",
        args: [String] = [],
        env: [String: String] = [:],
        isEnabled: Bool = true
    ) {
        self.id = id
        self.name = name
        self.command = command
        self.args = args
        self.env = env
        self.isEnabled = isEnabled
    }
}
