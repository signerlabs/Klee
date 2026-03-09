//
//  ContentView.swift
//  Klee
//
//  主容器视图：NavigationSplitView 布局。
//  侧边栏：模型管理。详情区：聊天视图。
//  Phase 1 重构：移除 ProcessManager，使用 LLMService + ModelManager。
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
            // 启动时自动加载上次使用的模型
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

    // MARK: - 侧边栏

    private var sidebarContent: some View {
        VStack(spacing: 0) {
            ModelManagerView()
        }
    }

    // MARK: - 状态标识

    private var statusBadge: some View {
        HStack(spacing: 4) {
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
}
