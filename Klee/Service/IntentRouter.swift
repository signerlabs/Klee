//
//  IntentRouter.swift
//  Klee
//
//  Parses <action> tags from LLM output and executes corresponding Swift operations.
//  Supports file I/O, web fetching, and shell execution.
//
//  Design: The LLM outputs structured <action> JSON tags when it needs to interact
//  with the system. IntentRouter extracts, validates, and executes these actions,
//  returning results that are fed back to the LLM for the next reasoning round.
//
//  Security: shell_exec and file_delete run without user confirmation — Klee is a
//  power-user local tool (no App Sandbox), similar to a terminal. The 30-second
//  shell timeout prevents runaway processes from freezing the app.
//

import Foundation

// MARK: - Action Model

/// Represents a parsed action from LLM output
struct KleeAction: Codable, Sendable {
    let type: String
    var path: String?
    var content: String?
    var url: String?
    var command: String?
}

/// Result of executing an action
struct ActionResult: Sendable {
    let success: Bool
    let output: String
}

// MARK: - Intent Router

@MainActor
class IntentRouter {

    /// Maximum output length returned to LLM to avoid filling context window
    private nonisolated static let maxOutputLength = 4000

    /// Shell command timeout in seconds (prevents runaway processes from freezing the app)
    private static let shellTimeoutSeconds: Double = 30

    /// Web fetch timeout in seconds
    private static let webFetchTimeoutSeconds: Double = 15

    // MARK: - Parsing

    /// Parse <action>...</action> from accumulated LLM text.
    /// Returns the parsed action along with text segments before and after the tag.
    /// Returns nil if no complete action tag is found or tags are malformed.
    static func parseAction(from text: String) -> (action: KleeAction, preText: String, postText: String)? {
        guard let startRange = text.range(of: "<action>"),
              let endRange = text.range(of: "</action>") else { return nil }

        // Ensure </action> comes after <action> (malformed order = skip)
        guard endRange.lowerBound > startRange.upperBound else { return nil }

        let preText = String(text[..<startRange.lowerBound])
        let jsonStr = String(text[startRange.upperBound..<endRange.lowerBound])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let postText = String(text[endRange.upperBound...])

        guard let data = jsonStr.data(using: .utf8),
              let action = try? JSONDecoder().decode(KleeAction.self, from: data) else { return nil }

        return (action, preText, postText)
    }

    // MARK: - Execution

    /// Execute an action and return the result.
    /// File operations run on a background thread to avoid blocking MainActor.
    /// shell_exec runs with a timeout to prevent hangs.
    static func execute(_ action: KleeAction) async -> ActionResult {
        switch action.type {
        case "file_write":
            return await Task.detached {
                fileWrite(path: action.path, content: action.content)
            }.value
        case "file_read":
            return await Task.detached {
                fileRead(path: action.path)
            }.value
        case "file_list":
            return await Task.detached {
                fileList(path: action.path)
            }.value
        case "file_delete":
            return await Task.detached {
                fileDelete(path: action.path)
            }.value
        case "web_fetch":
            return await webFetch(url: action.url)
        case "shell_exec":
            return await shellExec(command: action.command)
        default:
            return ActionResult(success: false, output: "Unknown action type: \(action.type)")
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

    // MARK: - Web Fetch

    private static func webFetch(url urlString: String?) async -> ActionResult {
        guard let urlString, let url = URL(string: urlString) else {
            return ActionResult(success: false, output: "Invalid URL")
        }
        do {
            // Use a dedicated session with a shorter timeout
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = webFetchTimeoutSeconds
            config.timeoutIntervalForResource = webFetchTimeoutSeconds
            let session = URLSession(configuration: config)
            defer { session.invalidateAndCancel() }

            let (data, _) = try await session.data(from: url)
            guard let html = String(data: data, encoding: .utf8) else {
                return ActionResult(success: false, output: "Failed to decode response as UTF-8")
            }
            // Strip HTML tags for cleaner LLM consumption
            let text = html.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
                .joined(separator: "\n")
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
            // readDataToEndOfFile() blocks until the write end closes (process exits),
            // Read stdout and stderr concurrently using async tasks
            async let stdoutResult: Data = Task.detached {
                outPipe.fileHandleForReading.readDataToEndOfFile()
            }.value
            async let stderrResult: Data = Task.detached {
                errPipe.fileHandleForReading.readDataToEndOfFile()
            }.value

            // Timeout: terminate process if it takes too long
            let timeoutTask = Task.detached {
                try? await Task.sleep(for: .seconds(timeout))
                if process.isRunning { process.terminate() }
            }

            let stdoutData = await stdoutResult
            let stderrData = await stderrResult
            timeoutTask.cancel()

            if !process.isRunning && process.terminationStatus == -1 {
                // Process was terminated by timeout
                return ActionResult(
                    success: false,
                    output: "Command timed out after \(Int(timeout)) seconds and was terminated."
                )
            }

            process.waitUntilExit()

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
