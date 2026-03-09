//
//  ContentView.swift
//  Klee
//
//  Main container view with NavigationSplitView: ChatView + StatusView sidebar.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var processManager: ProcessManager
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        NavigationSplitView {
            StatusView(processManager: processManager, wsManager: wsManager)
                .navigationSplitViewColumnWidth(min: 260, ideal: 300, max: 400)
        } detail: {
            ChatView(wsManager: wsManager)
        }
        .navigationTitle("Klee")
        .task {
            // K3: Auto-start services and connect WebSocket on launch
            await processManager.startAll()
            wsManager.connect()
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                connectionBadge
            }
        }
    }

    // MARK: - Connection Badge

    /// Small badge in the toolbar showing overall health.
    private var connectionBadge: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(overallStatusColor)
                .frame(width: 8, height: 8)
            Text(overallStatusLabel)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var overallStatusColor: Color {
        if processManager.ollamaState.isRunning && processManager.openclawState.isRunning {
            return wsManager.connectionState == .connected ? .green : .orange
        }
        if case .error = processManager.ollamaState { return .red }
        if case .error = processManager.openclawState { return .red }
        if processManager.ollamaState == .starting || processManager.openclawState == .starting {
            return .orange
        }
        return .gray
    }

    private var overallStatusLabel: String {
        if processManager.ollamaState.isRunning && processManager.openclawState.isRunning {
            return wsManager.connectionState == .connected ? "Ready" : "Connecting..."
        }
        if processManager.ollamaState == .starting || processManager.openclawState == .starting {
            return "Starting..."
        }
        if case .error = processManager.ollamaState { return "Error" }
        if case .error = processManager.openclawState { return "Error" }
        return "Stopped"
    }
}

#Preview {
    ContentView()
        .environmentObject(ProcessManager())
        .environmentObject(WebSocketManager(port: 18789, token: "preview"))
}
