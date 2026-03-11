//
//  MCPServerManager.swift
//  Klee
//
//  Manages the runtime lifecycle of MCP Server subprocesses.
//  Each server runs as a Node.js child process (via bundled Node.js + npx).
//  Lifecycle: KleeApp calls stopAll() on willTerminateNotification.
//  Injected as @Environment(MCPServerManager.self) throughout the app.
//

import Foundation
import Observation

@Observable
@MainActor
class MCPServerManager {

    // MARK: - Server Status

    enum MCPServerStatus: Equatable {
        case stopped
        case starting
        case running
        case error(String)
    }

    // MARK: - Observable State

    /// Maps server UUID to its current runtime status
    var serverStatuses: [UUID: MCPServerStatus] = [:]

    // MARK: - Private State

    /// Active subprocesses keyed by server ID
    private var processes: [UUID: Process] = [:]

    /// Stdout pipes for reading child process output (used by MCPClientManager for StdioTransport)
    private var stdoutPipes: [UUID: Pipe] = [:]

    /// Stdin pipes for writing to child process input (used by MCPClientManager for StdioTransport)
    private var stdinPipes: [UUID: Pipe] = [:]

    // MARK: - Node.js Path

    /// Resolve the bundled Node.js binary path.
    /// Looks for node binary inside the app bundle's Resources/node/ directory.
    private var bundledNodePath: String? {
        if let resourcePath = Bundle.main.resourcePath {
            let nodePath = (resourcePath as NSString).appendingPathComponent("node/bin/node")
            if FileManager.default.isExecutableFile(atPath: nodePath) {
                return nodePath
            }
        }
        // Fallback: check common system paths
        let systemPaths = [
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/bin/node"
        ]
        for path in systemPaths {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        return nil
    }

    /// Resolve npx-cli.js path (avoids symlink dereference issues with cp -L).
    /// Runs as: node /path/to/npx-cli.js -y <package>
    private func npxCliPath(nodePath: String) -> String? {
        let binDir = (nodePath as NSString).deletingLastPathComponent
        let nodeRoot = (binDir as NSString).deletingLastPathComponent
        let candidates = [
            "\(nodeRoot)/lib/node_modules/npm/bin/npx-cli.js",
            "\(nodeRoot)/lib/node_modules/npm/bin/npm-cli.js",  // fallback
        ]
        for path in candidates {
            if FileManager.default.fileExists(atPath: path) {
                return candidates[0]  // always prefer npx-cli.js
            }
        }
        return nil
    }

    // MARK: - Start Server

    /// Launch an MCP Server subprocess
    func start(server: MCPServerConfig) async {
        // Prevent duplicate launches
        if let existing = processes[server.id], existing.isRunning {
            serverStatuses[server.id] = .running
            return
        }

        serverStatuses[server.id] = .starting

        guard let nodePath = bundledNodePath else {
            serverStatuses[server.id] = .error("Node.js not found. Please bundle Node.js in the app.")
            return
        }

        guard let npxCli = npxCliPath(nodePath: nodePath) else {
            serverStatuses[server.id] = .error("npx-cli.js not found in bundled Node.js.")
            return
        }

        do {
            let process = Process()
            // Run: node /path/to/npx-cli.js -y <command> <args...>
            process.executableURL = URL(fileURLWithPath: nodePath)

            var arguments = [npxCli, "-y", server.command]
            arguments.append(contentsOf: server.args)
            process.arguments = arguments

            // Environment: inherit parent PATH + merge server-specific env vars
            var environment = ProcessInfo.processInfo.environment
            for (key, value) in server.env {
                environment[key] = value
            }
            // Ensure the node binary directory is in PATH
            let nodeDir = (nodePath as NSString).deletingLastPathComponent
            if let existingPath = environment["PATH"] {
                environment["PATH"] = "\(nodeDir):\(existingPath)"
            } else {
                environment["PATH"] = nodeDir
            }
            process.environment = environment

            // Stdio pipes for MCP protocol communication
            let stdinPipe = Pipe()
            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            process.standardInput = stdinPipe
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe

            // Store references before launching
            self.stdinPipes[server.id] = stdinPipe
            self.stdoutPipes[server.id] = stdoutPipe
            self.processes[server.id] = process

            // Log stderr output for debugging
            let serverId = server.id
            let serverName = server.name
            stderrPipe.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                if !data.isEmpty, let text = String(data: data, encoding: .utf8) {
                    print("[MCP:\(serverName)] stderr: \(text)")
                }
            }

            // Handle unexpected termination
            process.terminationHandler = { [weak self] proc in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let exitCode = proc.terminationStatus
                    if self.serverStatuses[serverId] == .running ||
                       self.serverStatuses[serverId] == .starting {
                        if exitCode == 0 {
                            self.serverStatuses[serverId] = .stopped
                        } else {
                            self.serverStatuses[serverId] = .error("Exited with code \(exitCode)")
                        }
                    }
                    self.cleanupProcess(id: serverId)
                }
            }

            try process.run()
            serverStatuses[server.id] = .running
            print("[MCPServerManager] Started '\(server.name)' (PID: \(process.processIdentifier))")

        } catch {
            serverStatuses[server.id] = .error(error.localizedDescription)
            cleanupProcess(id: server.id)
        }
    }

    // MARK: - Stop Server

    /// Stop a running MCP server by ID.
    /// Strategy: close stdin (MCP servers exit on stdin EOF) → SIGTERM → SIGKILL after 2s.
    func stop(id: UUID) {
        guard let process = processes[id] else {
            serverStatuses[id] = .stopped
            return
        }

        if process.isRunning {
            // Close stdin pipe to signal MCP server to exit gracefully.
            // Most MCP servers (stdio transport) treat stdin EOF as shutdown signal.
            stdinPipes[id]?.fileHandleForWriting.closeFile()

            // Also send SIGTERM for processes that don't monitor stdin
            process.terminate()

            // Force kill with SIGKILL if still running after 2 seconds
            let pid = process.processIdentifier
            Task.detached {
                try? await Task.sleep(for: .seconds(2))
                if process.isRunning {
                    kill(pid, SIGKILL)
                }
            }
        }

        serverStatuses[id] = .stopped
        cleanupProcess(id: id)
        print("[MCPServerManager] Stopped server \(id)")
    }

    /// Stop all running servers
    func stopAll() {
        for id in processes.keys {
            stop(id: id)
        }
    }

    /// Start all enabled servers from the config list
    func startAll(servers: [MCPServerConfig]) async {
        for server in servers where server.isEnabled {
            await start(server: server)
        }
    }

    // MARK: - Process Access (for MCPClientManager)

    /// Get the stdin pipe for a running server (used by MCPClientManager to create StdioTransport)
    func stdinPipe(for id: UUID) -> Pipe? {
        stdinPipes[id]
    }

    /// Get the stdout pipe for a running server (used by MCPClientManager to create StdioTransport)
    func stdoutPipe(for id: UUID) -> Pipe? {
        stdoutPipes[id]
    }

    /// Get the Process object for a running server
    func process(for id: UUID) -> Process? {
        processes[id]
    }

    // MARK: - Status Accessor

    /// Get the current status for a server (defaults to .stopped)
    func status(for id: UUID) -> MCPServerStatus {
        serverStatuses[id] ?? .stopped
    }

    // MARK: - Cleanup

    /// Remove all references for a server's process
    private func cleanupProcess(id: UUID) {
        // Close stderr readability handler
        if let process = processes[id],
           let stderrPipe = process.standardError as? Pipe {
            stderrPipe.fileHandleForReading.readabilityHandler = nil
        }
        processes[id] = nil
        // Note: Do NOT close stdin/stdout pipes here — MCPClientManager may still use them.
        // They will be cleaned up when MCPClientManager disconnects.
    }

    /// Clean up stdin/stdout pipes after MCPClientManager is done with them
    func cleanupTransportPipes(for id: UUID) {
        stdinPipes[id] = nil
        stdoutPipes[id] = nil
    }

}
