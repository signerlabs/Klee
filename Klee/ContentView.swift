//
//  ContentView.swift
//  Klee
//
//  Main container view: NavigationSplitView layout.
//  Sidebar: model management. Detail: chat view.
//  Phase 1 refactor: removed ProcessManager, now uses LLMService + ModelManager.
//

import SwiftUI

struct ContentView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager

    var body: some View {
        NavigationSplitView {
            sidebarContent
                .navigationSplitViewColumnWidth(min: 260, ideal: 320, max: 420)
        } detail: {
            ChatView()
        }
        .navigationTitle("Klee")
        .task {
            // Auto-load the last used model on launch
            if let lastModelId = modelManager.selectedModelId,
               modelManager.isCached(lastModelId) {
                await llmService.loadModel(id: lastModelId)
            }
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                statusBadge
            }
        }
    }

    // MARK: - Sidebar

    private var sidebarContent: some View {
        VStack(spacing: 0) {
            ModelManagerView()
        }
    }

    // MARK: - Status Badge (model name + state)

    private var statusBadge: some View {
        HStack(spacing: 6) {
            // Model name
            if let modelId = llmService.currentModelId {
                let shortName = modelId.components(separatedBy: "/").last ?? modelId
                Text(shortName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Generation speed
            if llmService.state == .generating, llmService.tokensPerSecond > 0 {
                Text(String(format: "%.1f tok/s", llmService.tokensPerSecond))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }

            // Status dot + label
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(statusLabel)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var statusColor: Color {
        switch llmService.state {
        case .ready:        return .green
        case .generating:   return .green
        case .loading:      return .orange
        case .error:        return .red
        case .idle:         return .gray
        }
    }

    private var statusLabel: String {
        switch llmService.state {
        case .ready:        return "Ready"
        case .generating:   return "Generating"
        case .loading:      return "Loading..."
        case .error:        return "Error"
        case .idle:         return "Not Loaded"
        }
    }
}

#Preview {
    ContentView()
        .environment(LLMService())
        .environment(ModelManager())
        .environment(DownloadManager())
}
