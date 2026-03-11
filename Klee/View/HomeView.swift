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
    // Rename alert state
    @State private var isRenamingConversation = false
    @State private var renamingConversationId: UUID?
    @State private var renameText = ""

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
                    ContentUnavailableView("No Conversation", systemImage: "bubble.left.and.bubble.right", description: Text("Create a new task to get started."))
                }
            }
            .environment(\.openSettings, OpenSettingsAction { showSettings = true })
        }
        .navigationTitle("Klee")
        .task {
            // Auto-load the last used model on launch
            if let lastModelId = modelManager.selectedModelId,
               modelManager.isCached(lastModelId) {
                await llmService.loadModel(id: lastModelId)
            }

            // Clean up empty conversations from previous sessions
            chatStore.removeEmptyConversations()

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
            // Header with new task button
            Button {
                // Remove current empty conversation before creating a new one
                chatStore.removeEmptyConversations()
                chatStore.createConversation()
            } label: {
                HStack {
                    Text("New Task")
                        .font(.headline)

                    Spacer()

                    Image(systemName: "square.and.pencil")
                        .imageScale(.large)
                }
                .contentShape(.rect)
            }
            .sidebarHoverButton()
            .help("New Task")
            .padding(.horizontal, 10)

            Divider()

            // Conversation list
            List(selection: $store.selectedConversationId) {
                ForEach(chatStore.conversations) { conversation in
                    Text(conversation.title)
                        .lineLimit(1)
                        .tag(conversation.id)
                        .contextMenu {
                            Button {
                                renameText = conversation.title
                                renamingConversationId = conversation.id
                                isRenamingConversation = true
                            } label: {
                                Label("Rename", systemImage: "pencil")
                            }

                            Divider()

                            Button(role: .destructive) {
                                chatStore.deleteConversation(id: conversation.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
            .listStyle(.sidebar)
            .onChange(of: chatStore.selectedConversationId) { oldId, newId in
                // When switching conversations, remove the old one if it was empty
                guard let old = oldId, old != newId else { return }
                if let conv = chatStore.conversations.first(where: { $0.id == old }),
                   conv.messages.isEmpty, conv.hasDefaultTitle {
                    chatStore.deleteConversation(id: old)
                }
            }
            .alert("Rename Conversation", isPresented: $isRenamingConversation) {
                TextField("Name", text: $renameText)
                Button("Cancel", role: .cancel) {}
                Button("Rename") {
                    let trimmed = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
                    if let id = renamingConversationId, !trimmed.isEmpty {
                        chatStore.updateTitle(trimmed, for: id)
                    }
                }
            }

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
                .contentShape(.rect)
            }
            .sidebarHoverButton()
            .padding(.horizontal, 10)
            .padding(.bottom)
        }
    }

    // MARK: - Status Badge (minimal: only loading spinner or error dot)

    @ViewBuilder
    private var statusBadge: some View {
        switch llmService.state {
        case .loading:
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.small)
                Text("Loading…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        case .error:
            Circle()
                .fill(.red)
                .frame(width: 8, height: 8)
                .help("Model error — see chat for details")
        default:
            // Ready / Generating / Idle — keep toolbar clean
            EmptyView()
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
