//
//  ContentView.swift
//  Klee
//
//  Main container view: NavigationSplitView layout.
//  Sidebar: conversation list + settings entry. Detail: chat view.
//

import SwiftUI

struct ContentView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager
    @Environment(ChatStore.self) var chatStore
    @State private var showSettings = false

    var body: some View {
        @Bindable var store = chatStore

        NavigationSplitView {
            sidebarContent
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 360)
        } detail: {
            if chatStore.selectedConversationId != nil {
                ChatView()
            } else {
                ContentUnavailableView("No Conversation", systemImage: "bubble.left.and.bubble.right", description: Text("Create a new chat to get started."))
            }
        }
        .navigationTitle("")
        .task {
            // Auto-load the last used model on launch
            if let lastModelId = modelManager.selectedModelId,
               modelManager.isCached(lastModelId) {
                await llmService.loadModel(id: lastModelId)
            }

            // Ensure at least one conversation exists
            if chatStore.conversations.isEmpty {
                chatStore.createConversation()
            }
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                statusBadge
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
    }

    // MARK: - Sidebar

    private var sidebarContent: some View {
        @Bindable var store = chatStore

        return VStack(spacing: 0) {
            // Header with new chat button
            HStack {
                Text("Chats")
                    .font(.headline)
                Spacer()
                Button {
                    chatStore.createConversation()
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .buttonStyle(.borderless)
                .help("New Chat")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            // Conversation list
            List(selection: $store.selectedConversationId) {
                ForEach(chatStore.conversations) { conversation in
                    conversationRow(conversation)
                        .tag(conversation.id)
                        .contextMenu {
                            Button(role: .destructive) {
                                chatStore.deleteConversation(id: conversation.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
            .listStyle(.sidebar)

            Divider()

            // Settings entry at bottom
            Button {
                showSettings = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "gearshape")
                        .foregroundStyle(.secondary)
                    Text("Settings")
                        .foregroundStyle(.primary)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Conversation Row

    private func conversationRow(_ conversation: Conversation) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(conversation.title)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)

            Text(conversation.updatedAt, style: .relative)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
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
        .environment(ChatStore())
}
