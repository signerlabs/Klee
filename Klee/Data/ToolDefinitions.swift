//
//  ToolDefinitions.swift
//  Klee
//
//  Native tool calling definitions (OpenAI function calling schema).
//  Passed to mlx-swift-lm via UserInput(chat:tools:).
//  Add new tools here as modules are implemented.
//

import Foundation

/// Registry of all available tool definitions for native tool calling.
enum ToolDefinitions {

    // MARK: - Built-in Tools (always available)

    /// File and shell tools — no module required, always enabled.
    static let builtIn: [[String: any Sendable]] = [
        function(
            name: "file_write",
            description: "Create or overwrite a file at the given path. Parent directories are created automatically.",
            parameters: [
                param("path", "Absolute file path (~ expands to home directory)"),
                param("content", "Content to write to the file"),
            ],
            required: ["path", "content"]
        ),
        function(
            name: "file_read",
            description: "Read the contents of a file. Returns the text content, truncated if too large.",
            parameters: [param("path", "Absolute file path (~ expands to home directory)")],
            required: ["path"]
        ),
        function(
            name: "file_list",
            description: "List files and directories at the given path.",
            parameters: [param("path", "Absolute directory path (~ expands to home directory)")],
            required: ["path"]
        ),
        function(
            name: "file_delete",
            description: "Delete a file or directory at the given path.",
            parameters: [param("path", "Absolute file path (~ expands to home directory)")],
            required: ["path"]
        ),
        function(
            name: "shell_exec",
            description: "Execute a shell command via /bin/zsh. Has a 30-second timeout. Use for system operations, running scripts, or checking system state.",
            parameters: [param("command", "Shell command to execute")],
            required: ["command"]
        ),
    ]

    // MARK: - Web Search Tools (requires web_search module)

    static let webSearch: [[String: any Sendable]] = [
        function(
            name: "web_search",
            description: "Search the web for information. Returns top results with titles, URLs, and content snippets.",
            parameters: [param("query", "Search query string")],
            required: ["query"]
        ),
        function(
            name: "web_fetch",
            description: "Fetch a webpage and extract its content as clean text. Uses Jina Reader for markdown extraction.",
            parameters: [param("url", "Full URL to fetch (e.g. https://example.com)")],
            required: ["url"]
        ),
    ]

    // MARK: - Helpers

    /// Build a function tool spec from simple parameters.
    private static func function(
        name: String,
        description: String,
        parameters: [(String, String)],
        required: [String]
    ) -> [String: any Sendable] {
        var properties: [String: any Sendable] = [:]
        for (pName, pDesc) in parameters {
            properties[pName] = ["type": "string", "description": pDesc] as [String: any Sendable]
        }
        return [
            "type": "function",
            "function": [
                "name": name,
                "description": description,
                "parameters": [
                    "type": "object",
                    "properties": properties,
                    "required": required as [any Sendable],
                ] as [String: any Sendable],
            ] as [String: any Sendable],
        ] as [String: any Sendable]
    }

    private static func param(_ name: String, _ description: String) -> (String, String) {
        (name, description)
    }
}
