//
//  ProcessManager.swift
//  Klee
//
//  Manages Ollama and OpenClaw subprocess lifecycle.
//  Handles start, stop, watchdog, and stale process cleanup.
//

import Foundation
import Combine

@MainActor
final class ProcessManager: ObservableObject {

    // MARK: - Published State

    @Published private(set) var ollamaState: ProcessState = .stopped
    @Published private(set) var openclawState: ProcessState = .stopped
    @Published private(set) var logs: [String] = []

    // MARK: - Configuration

    /// Dedicated Ollama port to avoid conflict with user's existing Ollama on 11434.
    let ollamaPort: Int = 11435
    let openclawPort: Int = 18789

    /// Bearer token for WebSocket authentication with OpenClaw Gateway.
    let gatewayToken: String = UUID().uuidString

    /// Whether the app is reusing user's existing Ollama instance on 11434.
    @Published private(set) var reusingUserOllama: Bool = false

    /// WebSocket manager owned by ProcessManager (K2 simplification).
    /// Created lazily since it depends on port and token.
    lazy var wsManager: WebSocketManager = WebSocketManager(port: openclawPort, token: gatewayToken)

    // MARK: - Private

    private var ollamaProcess: Process?
    private var openclawProcess: Process?
    private var watchdogProcess: Process?

    /// Path where Ollama stores downloaded models.
    private var modelsPath: String {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = support.appendingPathComponent("Klee/OllamaModels", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.path
    }

    /// The effective Ollama port (user's 11434 or our 11435).
    var effectiveOllamaPort: Int {
        reusingUserOllama ? 11434 : ollamaPort
    }

    // MARK: - Start All

    func startAll() async {
        guard ollamaState != .starting, openclawState != .starting else { return }

        do {
            // 0. Clean up stale processes from previous crash
            await cleanupStaleProcesses()

            // 1. Check if user already has Ollama running on default port
            let userOllamaRunning = await checkPort(11434)
            reusingUserOllama = userOllamaRunning

            // 2. Start Ollama (or reuse user's)
            try await startOllama(reuseExisting: userOllamaRunning)

            // 3. Wait for Ollama to be ready
            try await waitForReady(
                port: effectiveOllamaPort,
                path: "/",
                label: "Ollama",
                timeoutSeconds: 30
            )
            ollamaState = .running
            appendLog("Ollama is ready on port \(effectiveOllamaPort).")

            // 4. Start OpenClaw Gateway
            try await startOpenClaw()

            // 5. Wait for Gateway to be ready
            try await waitForReady(
                port: openclawPort,
                path: "/health",
                label: "OpenClaw",
                timeoutSeconds: 20
            )
            openclawState = .running
            appendLog("OpenClaw Gateway is ready on port \(openclawPort).")

            // 6. Launch watchdog
            startWatchdog()

        } catch {
            appendLog("Startup failed: \(error.localizedDescription)")
            if ollamaState == .starting { ollamaState = .error(error.localizedDescription) }
            if openclawState == .starting { openclawState = .error(error.localizedDescription) }
        }
    }

    // MARK: - Start Ollama

    private func startOllama(reuseExisting: Bool) async throws {
        if reuseExisting {
            appendLog("Detected user Ollama on port 11434, reusing it.")
            ollamaState = .running
            return
        }

        ollamaState = .starting
        appendLog("Starting Ollama on port \(ollamaPort)...")

        // Check if our port is already occupied
        if await checkPort(ollamaPort) {
            throw AppError.portInUse(ollamaPort)
        }

        guard let binaryURL = Bundle.main.url(forResource: "ollama", withExtension: nil) else {
            throw AppError.processLaunchFailed("Ollama binary not found in app bundle.")
        }

        let process = Process()
        process.executableURL = binaryURL
        process.arguments = ["serve"]

        // Inherit system environment, then override Ollama-specific vars
        var env = ProcessInfo.processInfo.environment
        env["OLLAMA_HOST"] = "127.0.0.1:\(ollamaPort)"
        env["OLLAMA_MODELS"] = modelsPath
        env["OLLAMA_KEEP_ALIVE"] = "10m"
        env["OLLAMA_FLASH_ATTENTION"] = "1"
        env["OLLAMA_MAX_LOADED_MODELS"] = "1"
        process.environment = env

        // Capture stdout/stderr for logging
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        pipeToLog(pipe, prefix: "[ollama]")

        process.terminationHandler = { [weak self] proc in
            let code = proc.terminationStatus
            Task { @MainActor [weak self] in
                guard let self else { return }
                if self.ollamaState == .running {
                    self.ollamaState = .error("Ollama exited with code \(code)")
                    self.appendLog("Ollama process terminated unexpectedly (code \(code)).")
                }
            }
        }

        do {
            try process.run()
            ollamaProcess = process
            appendLog("Ollama process launched (PID \(process.processIdentifier)).")
        } catch {
            throw AppError.processLaunchFailed("Ollama: \(error.localizedDescription)")
        }
    }

    // MARK: - Start OpenClaw

    private func startOpenClaw() async throws {
        openclawState = .starting
        appendLog("Starting OpenClaw Gateway on port \(openclawPort)...")

        if await checkPort(openclawPort) {
            throw AppError.portInUse(openclawPort)
        }

        guard let nodeURL = Bundle.main.url(forResource: "node", withExtension: nil) else {
            throw AppError.processLaunchFailed("Node.js binary not found in app bundle.")
        }

        guard let openclawDir = Bundle.main.url(forResource: "openclaw", withExtension: nil) else {
            throw AppError.processLaunchFailed("OpenClaw directory not found in app bundle.")
        }

        let process = Process()
        process.executableURL = nodeURL

        // Find the openclaw gateway entry point
        let gatewayBin = openclawDir
            .appendingPathComponent("node_modules/.bin/openclaw")
        process.arguments = [gatewayBin.path, "gateway"]
        process.currentDirectoryURL = openclawDir

        var env = ProcessInfo.processInfo.environment
        env["OLLAMA_HOST"] = "http://127.0.0.1:\(effectiveOllamaPort)"
        env["HOME"] = NSHomeDirectory()
        env["OPENCLAW_GATEWAY_PORT"] = "\(openclawPort)"
        env["OPENCLAW_GATEWAY_TOKEN"] = gatewayToken
        // Ensure node can find modules
        env["NODE_PATH"] = openclawDir.appendingPathComponent("node_modules").path
        process.environment = env

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        pipeToLog(pipe, prefix: "[openclaw]")

        process.terminationHandler = { [weak self] proc in
            let code = proc.terminationStatus
            Task { @MainActor [weak self] in
                guard let self else { return }
                if self.openclawState == .running {
                    self.openclawState = .error("OpenClaw exited with code \(code)")
                    self.appendLog("OpenClaw process terminated unexpectedly (code \(code)).")
                }
            }
        }

        do {
            try process.run()
            openclawProcess = process
            appendLog("OpenClaw process launched (PID \(process.processIdentifier)).")
        } catch {
            throw AppError.processLaunchFailed("OpenClaw: \(error.localizedDescription)")
        }
    }

    // MARK: - Shutdown

    /// Graceful shutdown: SIGTERM -> 3s -> SIGINT -> 2s -> SIGKILL
    func shutdownAll() async {
        appendLog("Shutting down all processes...")

        // Set states to .stopped first so terminationHandlers don't misreport errors (P5 fix)
        if !reusingUserOllama {
            ollamaState = .stopped
        }
        openclawState = .stopped

        // Unload model to release VRAM before killing Ollama
        await unloadOllamaModel()

        // Shutdown in reverse order: OpenClaw first, then Ollama
        for (process, name) in [(openclawProcess, "OpenClaw"), (ollamaProcess, "Ollama")] {
            guard let process, process.isRunning else { continue }
            appendLog("Stopping \(name) (PID \(process.processIdentifier))...")

            process.terminate() // SIGTERM
            try? await Task.sleep(for: .seconds(3))

            if process.isRunning {
                process.interrupt() // SIGINT
                try? await Task.sleep(for: .seconds(2))
            }

            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
                appendLog("\(name) required SIGKILL.")
            }
        }

        // Stop watchdog
        watchdogProcess?.terminate()
        watchdogProcess = nil

        ollamaProcess = nil
        openclawProcess = nil

        appendLog("All processes stopped.")
    }

    /// Tell Ollama to unload all currently loaded models (release VRAM).
    /// First queries /api/ps for loaded model names, then sends keep_alive:0 for each.
    private func unloadOllamaModel() async {
        let baseURL = "http://127.0.0.1:\(effectiveOllamaPort)"

        // 1. Query loaded models via /api/ps
        guard let psURL = URL(string: "\(baseURL)/api/ps"),
              let (psData, _) = try? await URLSession.shared.data(from: psURL),
              let psJSON = try? JSONSerialization.jsonObject(with: psData) as? [String: Any],
              let models = psJSON["models"] as? [[String: Any]] else {
            appendLog("No loaded models to unload (or /api/ps unavailable).")
            return
        }

        // 2. Send keep_alive:0 for each loaded model
        for model in models {
            guard let name = model["name"] as? String, !name.isEmpty else { continue }
            appendLog("Unloading model: \(name)")

            guard let generateURL = URL(string: "\(baseURL)/api/generate") else { continue }
            var request = URLRequest(url: generateURL)
            request.httpMethod = "POST"
            request.httpBody = try? JSONSerialization.data(withJSONObject: [
                "model": name,
                "keep_alive": 0
            ])
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            _ = try? await URLSession.shared.data(for: request)
        }
    }

    // MARK: - Watchdog

    /// Launches a shell script that monitors the parent PID.
    /// If Klee is force-quit or crashes, the watchdog kills orphan subprocesses.
    private func startWatchdog() {
        guard let ollamaPID = ollamaProcess?.processIdentifier,
              let openclawPID = openclawProcess?.processIdentifier else { return }

        let parentPID = ProcessInfo.processInfo.processIdentifier

        let script = """
        while kill -0 \(parentPID) 2>/dev/null; do sleep 2; done
        kill \(openclawPID) 2>/dev/null
        kill \(ollamaPID) 2>/dev/null
        """

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", script]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            watchdogProcess = process
            appendLog("Watchdog launched (PID \(process.processIdentifier)).")
        } catch {
            appendLog("Failed to start watchdog: \(error.localizedDescription)")
        }
    }

    // MARK: - Stale Process Cleanup

    /// Kill any leftover processes from a previous crash by checking our ports.
    private func cleanupStaleProcesses() async {
        for port in [ollamaPort, openclawPort] {
            if let pid = pidUsingPort(port) {
                appendLog("Found stale process (PID \(pid)) on port \(port), killing it.")
                kill(pid, SIGKILL)
                // Brief wait for OS to release the port
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    /// Returns the PID of the process listening on the given port, or nil.
    private func pidUsingPort(_ port: Int) -> pid_t? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        process.arguments = ["-ti", "tcp:\(port)"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               let pid = Int32(output.components(separatedBy: "\n").first ?? "") {
                return pid
            }
        } catch {}
        return nil
    }

    // MARK: - Port Check

    /// Check if a TCP port is in use by attempting an HTTP connection.
    private func checkPort(_ port: Int) async -> Bool {
        let url = URL(string: "http://127.0.0.1:\(port)/")!
        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, http.statusCode > 0 {
                return true
            }
        } catch {}
        return false
    }

    /// Poll until a service is reachable on the given port/path.
    private func waitForReady(port: Int, path: String, label: String, timeoutSeconds: Int) async throws {
        let url = URL(string: "http://127.0.0.1:\(port)\(path)")!
        for i in 0..<timeoutSeconds {
            if let (_, response) = try? await URLSession.shared.data(from: url),
               let http = response as? HTTPURLResponse, http.statusCode > 0 {
                return
            }
            if i % 5 == 4 {
                appendLog("Waiting for \(label)... (\(i + 1)s)")
            }
            try await Task.sleep(for: .seconds(1))
        }
        if label == "Ollama" {
            throw AppError.ollamaStartTimeout
        } else {
            throw AppError.openclawStartTimeout
        }
    }

    // MARK: - Logging

    private func pipeToLog(_ pipe: Pipe, prefix: String) {
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty,
                  let line = String(data: data, encoding: .utf8) else { return }
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            Task { @MainActor [weak self] in
                self?.appendLog("\(prefix) \(trimmed)")
            }
        }
    }

    private func appendLog(_ message: String) {
        let ts = Self.logFormatter.string(from: Date())
        logs.append("[\(ts)] \(message)")
        // Keep log buffer bounded
        if logs.count > 500 {
            logs.removeFirst(logs.count - 500)
        }
    }

    private static let logFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f
    }()
}
