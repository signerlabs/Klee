//
//  StatusView.swift
//  Klee
//
//  Displays Ollama and OpenClaw status, logs, and start/stop controls.
//

import SwiftUI

struct StatusView: View {
    @ObservedObject var processManager: ProcessManager
    @ObservedObject var wsManager: WebSocketManager

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Service status cards
            serviceStatusSection

            Divider()

            // Log output
            logSection
        }
        .frame(minWidth: 280)
    }

    // MARK: - Service Status

    private var serviceStatusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Services")
                .font(.headline)

            ServiceRow(
                name: "Ollama",
                state: processManager.ollamaState,
                detail: processManager.reusingUserOllama
                    ? "Reusing user instance (port 11434)"
                    : "Port \(processManager.ollamaPort)"
            )

            ServiceRow(
                name: "OpenClaw Gateway",
                state: processManager.openclawState,
                detail: "Port \(processManager.openclawPort)"
            )

            ServiceRow(
                name: "WebSocket",
                state: wsConnectionToProcessState(wsManager.connectionState),
                detail: wsManager.connectionState.label
            )

            Divider()

            // Control buttons
            HStack {
                Button(action: {
                    Task { await processManager.startAll() }
                }) {
                    Label("Start All", systemImage: "play.fill")
                }
                .disabled(processManager.ollamaState == .starting || processManager.openclawState == .starting)

                Button(action: {
                    Task {
                        wsManager.disconnect()
                        await processManager.shutdownAll()
                    }
                }) {
                    Label("Stop All", systemImage: "stop.fill")
                }
                .disabled(processManager.ollamaState == .stopped && processManager.openclawState == .stopped)

                Spacer()
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }

    // MARK: - Log Section

    private var logSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Logs")
                    .font(.headline)
                Spacer()
                Button("Clear") {
                    // ProcessManager logs is read-only; in a future iteration
                    // we could add a clearLogs() method
                }
                .buttonStyle(.borderless)
                .font(.caption)
            }
            .padding(.horizontal)
            .padding(.top, 8)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(processManager.logs.enumerated()), id: \.offset) { index, log in
                            Text(log)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                                .id(index)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 4)
                }
                .onChange(of: processManager.logs.count) {
                    if let last = processManager.logs.indices.last {
                        proxy.scrollTo(last, anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    /// Map WSConnectionState to ProcessState for uniform display.
    private func wsConnectionToProcessState(_ state: WSConnectionState) -> ProcessState {
        switch state {
        case .disconnected: return .stopped
        case .connecting, .reconnecting(_): return .starting
        case .connected: return .running
        case .failed(let msg): return .error(msg)
        }
    }
}

// MARK: - Service Row

private struct ServiceRow: View {
    let name: String
    let state: ProcessState
    let detail: String

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.subheadline.weight(.medium))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(state.label)
                .font(.caption)
                .foregroundStyle(statusColor)
        }
        .padding(.vertical, 2)
    }

    private var statusColor: Color {
        switch state {
        case .stopped: return .gray
        case .starting: return .orange
        case .running: return .green
        case .error: return .red
        }
    }
}

// MARK: - WSConnectionState label

extension WSConnectionState {
    var label: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .reconnecting(let n): return "Reconnecting (\(n))..."
        case .failed(let msg): return "Failed: \(msg)"
        }
    }
}

// MARK: - Preview

#Preview {
    StatusView(
        processManager: ProcessManager(),
        wsManager: WebSocketManager(port: 18789, token: "preview")
    )
    .frame(width: 320, height: 500)
}
