//
//  HomeView.swift
//  Klee
//
//  Main container view: NavigationSplitView layout.
//  Sidebar: conversation list + settings entry. Detail: chat view.
//

import SwiftUI

struct HomeView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager
    @Environment(ChatStore.self) var chatStore
    @State private var showSettings = false
    @State private var isNewChatHovering = false

    var body: some View {
        @Bindable var store = chatStore

        NavigationSplitView {
            sidebarContent
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 360)
        } detail: {
            Group {
                if chatStore.selectedConversationId != nil {
                    ChatView()
                } else {
                    ContentUnavailableView("No Conversation", systemImage: "bubble.left.and.bubble.right", description: Text("Create a new chat to get started."))
                }
            }
            .frame(minWidth: 400, idealWidth: 600, maxWidth: 800)
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
        return VStack {
            // Header with new chat button
            HStack {
                Text("Chats")
                    .font(.headline)
                Spacer()
                Button {
                    chatStore.createConversation()
                } label: {
                    Image(systemName: "square.and.pencil")
                        .imageScale(.large)
                        .padding(4)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Color.primary.opacity(isNewChatHovering ? 0.1 : 0))
                        )
                }
                .buttonStyle(.plain)
                .help("New Chat")
                .onHover { isNewChatHovering = $0 }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            // Conversation list
            List(selection: $store.selectedConversationId) {
                ForEach(chatStore.conversations) { conversation in
                    Text(conversation.title)
                        .lineLimit(1)
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
    HomeView()
        .environment(LLMService())
        .environment(ModelManager())
        .environment(DownloadManager())
        .environment(ChatStore())
}
