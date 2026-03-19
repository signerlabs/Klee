//
//  IntentRouter.swift
//  Klee
//
//  Executes tool calls from mlx-swift-lm's native ToolCall API.
//  Supports file I/O, web search/fetch (via Jina), and shell execution.
//
//  Design: The LLM outputs structured ToolCall objects when it needs to interact
//  with the system. IntentRouter receives the tool name and arguments directly,
//  executes the corresponding operation, and returns results that are fed back
//  to the LLM for the next reasoning round.
//
//  Security: shell_exec and file_delete run without user confirmation — Klee is a
//  power-user local tool (no App Sandbox), similar to a terminal. The 30-second
//  shell timeout prevents runaway processes from freezing the app.
//

import Foundation

/// Result of executing a tool call
struct ActionResult: Sendable {
    let success: Bool
    let output: String
}

/// Thread-safe mutable box for sharing a value between detached tasks.
/// Used by shell_exec to communicate timeout state from the timeout task
/// to the main execution flow. Marked @unchecked Sendable because the
/// value is only written once (by the timeout task) and read after
/// the process has exited (happens-before relationship via waitUntilExit).
import Synchronization

// MARK: - Intent Router

@MainActor
class IntentRouter {

    /// Maximum output length returned to LLM to avoid filling context window
    private nonisolated static let maxOutputLength = 4000

    /// Shell command timeout in seconds (prevents runaway processes from freezing the app)
    private static let shellTimeoutSeconds: Double = 30

    /// Web request timeout in seconds
    private static let webTimeoutSeconds: Double = 15

    // MARK: - Execution

    /// Execute a tool call by name with structured arguments.
    /// Called when mlx-swift-lm detects a native ToolCall.
    /// - Parameters:
    ///   - name: Tool function name (e.g. "file_write", "web_search")
    ///   - arguments: Parsed arguments dictionary from the ToolCall
    /// - Returns: ActionResult indicating success/failure and output text
    /// - Parameters:
    ///   - name: Tool name from ToolCall
    ///   - arguments: Parsed arguments dictionary
    ///   - apiKeys: Module API keys (e.g., ["web_search": "jina_xxx"])
    static func execute(name: String, arguments: [String: Any], apiKeys: [String: String] = [:]) async -> ActionResult {
        switch name {
        case "file_write":
            let path = arguments["path"] as? String
            let content = arguments["content"] as? String
            return await Task.detached { fileWrite(path: path, content: content) }.value
        case "file_read":
            let path = arguments["path"] as? String
            return await Task.detached { fileRead(path: path) }.value
        case "file_list":
            let path = arguments["path"] as? String
            return await Task.detached { fileList(path: path) }.value
        case "file_delete":
            let path = arguments["path"] as? String
            return await Task.detached { fileDelete(path: path) }.value
        case "web_fetch":
            let url = arguments["url"] as? String
            return await webFetch(url: url, apiKey: apiKeys["web_search"])
        case "web_search":
            let query = arguments["query"] as? String
            return await webSearch(query: query, apiKey: apiKeys["web_search"])
        case "shell_exec":
            let command = arguments["command"] as? String
            return await shellExec(command: command)
        default:
            return ActionResult(success: false, output: "Unknown tool: \(name)")
        }
    }

    // MARK: - Path Utilities

    /// Expand ~ to the user's home directory and resolve to canonical path.
    /// Returns nil if input is nil.
    private nonisolated static func expandPath(_ path: String?) -> String? {
        guard let path else { return nil }
        if path.hasPrefix("~") {
            let expanded = path.replacingOccurrences(
                of: "~",
                with: FileManager.default.homeDirectoryForCurrentUser.path,
                range: path.range(of: "~")
            )
            return expanded
        }
        return path
    }

    /// Truncate output string if it exceeds maxOutputLength
    private nonisolated static func truncate(_ text: String) -> String {
        if text.count > maxOutputLength {
            return String(text.prefix(maxOutputLength)) + "\n... (truncated)"
        }
        return text
    }

    // MARK: - File Operations

    private nonisolated static func fileWrite(path: String?, content: String?) -> ActionResult {
        guard let expanded = expandPath(path) else {
            return ActionResult(success: false, output: "Missing path parameter")
        }
        guard let content else {
            return ActionResult(success: false, output: "Missing content parameter")
        }
        do {
            let url = URL(fileURLWithPath: expanded)
            // Create parent directories if needed
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try content.write(to: url, atomically: true, encoding: .utf8)
            return ActionResult(success: true, output: "File written: \(expanded)")
        } catch {
            return ActionResult(success: false, output: "Failed to write file: \(error.localizedDescription)")
        }
    }

    private nonisolated static func fileRead(path: String?) -> ActionResult {
        guard let expanded = expandPath(path) else {
            return ActionResult(success: false, output: "Missing path parameter")
        }
        do {
            let content = try String(contentsOfFile: expanded, encoding: .utf8)
            return ActionResult(success: true, output: truncate(content))
        } catch {
            return ActionResult(success: false, output: "Failed to read file: \(error.localizedDescription)")
        }
    }

    private nonisolated static func fileList(path: String?) -> ActionResult {
        guard let expanded = expandPath(path) else {
            return ActionResult(success: false, output: "Missing path parameter")
        }
        do {
            let items = try FileManager.default.contentsOfDirectory(atPath: expanded)
            let listing = items.sorted().joined(separator: "\n")
            return ActionResult(success: true, output: truncate(listing))
        } catch {
            return ActionResult(success: false, output: "Failed to list directory: \(error.localizedDescription)")
        }
    }

    private nonisolated static func fileDelete(path: String?) -> ActionResult {
        guard let expanded = expandPath(path) else {
            return ActionResult(success: false, output: "Missing path parameter")
        }
        do {
            try FileManager.default.removeItem(atPath: expanded)
            return ActionResult(success: true, output: "Deleted: \(expanded)")
        } catch {
            return ActionResult(success: false, output: "Failed to delete: \(error.localizedDescription)")
        }
    }

    // MARK: - Web Search (Jina s.jina.ai)

    /// Search the web using Jina AI search API.
    /// Returns top results as markdown with titles, URLs, and content snippets.
    /// Free tier: 20 RPM. Set JINA_API_KEY environment variable for higher limits.
    private static func webSearch(query: String?, apiKey: String? = nil) async -> ActionResult {
        guard let query, !query.isEmpty else {
            return ActionResult(success: false, output: "Missing query parameter")
        }
        guard let apiKey, !apiKey.isEmpty else {
            return ActionResult(success: false, output: "Web Search requires a Jina API key. Enable the Web Search module in the sidebar and enter your key (free at jina.ai).")
        }

        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let url = URL(string: "https://s.jina.ai/\(encoded)") else {
            return ActionResult(success: false, output: "Invalid search query")
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = webTimeoutSeconds
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let text = String(data: data, encoding: .utf8) else {
                return ActionResult(success: false, output: "Failed to decode search results")
            }
            return ActionResult(success: true, output: truncate(text))
        } catch {
            return ActionResult(success: false, output: "Search failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Web Fetch (Jina r.jina.ai)

    /// Fetch a webpage's content using Jina Reader for clean markdown extraction.
    /// Free tier: 20 RPM, no API key needed.
    private static func webFetch(url urlString: String?, apiKey: String? = nil) async -> ActionResult {
        guard let urlString, !urlString.isEmpty else {
            return ActionResult(success: false, output: "Missing URL parameter")
        }

        // Use Jina Reader for clean markdown extraction (works without API key at 20 RPM)
        guard let url = URL(string: "https://r.jina.ai/\(urlString)") else {
            return ActionResult(success: false, output: "Invalid URL")
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = webTimeoutSeconds
        request.setValue("text/plain", forHTTPHeaderField: "Accept")
        if let apiKey, !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let text = String(data: data, encoding: .utf8) else {
                return ActionResult(success: false, output: "Failed to decode page content")
            }
            return ActionResult(success: true, output: truncate(text))
        } catch {
            return ActionResult(success: false, output: "Failed to fetch: \(error.localizedDescription)")
        }
    }

    // MARK: - Shell Execution

    /// Execute a shell command with timeout protection.
    /// Runs on a detached task to avoid blocking the MainActor.
    /// The process is terminated if it exceeds shellTimeoutSeconds.
    private static func shellExec(command: String?) async -> ActionResult {
        guard let command else {
            return ActionResult(success: false, output: "Missing command parameter")
        }

        let timeout = shellTimeoutSeconds

        return await Task.detached {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.arguments = ["-c", command]

            let outPipe = Pipe()
            let errPipe = Pipe()
            process.standardOutput = outPipe
            process.standardError = errPipe

            do {
                try process.run()
            } catch {
                return ActionResult(
                    success: false,
                    output: "Failed to execute: \(error.localizedDescription)"
                )
            }

            // Read output data before waitUntilExit to avoid deadlock when pipe buffer fills.
            // Read stdout and stderr concurrently using async tasks
            async let stdoutResult: Data = Task.detached {
                outPipe.fileHandleForReading.readDataToEndOfFile()
            }.value
            async let stderrResult: Data = Task.detached {
                errPipe.fileHandleForReading.readDataToEndOfFile()
            }.value

            // Timeout: use a flag to reliably detect timeout termination.
            // process.terminate() sends SIGTERM whose terminationStatus value is platform-dependent,
            // so checking a specific numeric code is unreliable.
            let timedOut = Mutex(false)
            let timeoutTask = Task.detached {
                try? await Task.sleep(for: .seconds(timeout))
                if process.isRunning {
                    timedOut.withLock { $0 = true }
                    process.terminate()
                }
            }

            let stdoutData = await stdoutResult
            let stderrData = await stderrResult

            // Wait for process to fully exit before checking status
            process.waitUntilExit()
            timeoutTask.cancel()

            if timedOut.withLock({ $0 }) {
                return ActionResult(
                    success: false,
                    output: "Command timed out after \(Int(timeout)) seconds and was terminated."
                )
            }

            let output = String(data: stdoutData, encoding: .utf8) ?? ""
            let errOutput = String(data: stderrData, encoding: .utf8) ?? ""

            if process.terminationStatus == 0 {
                return ActionResult(success: true, output: truncate(output))
            } else {
                let combined = errOutput.isEmpty ? output : errOutput
                return ActionResult(
                    success: false,
                    output: "Exit code \(process.terminationStatus): \(combined)"
                )
            }
        }.value
    }
}
