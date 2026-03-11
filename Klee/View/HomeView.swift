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
    @State private var activeSettingsPanel: SettingsPanel?
    // Rename alert state
    @State private var isRenamingConversation = false
    @State private var renamingConversationId: UUID?
    @State private var renameText = ""
    // Delete confirmation state
    @State private var isDeletingConversation = false
    @State private var deletingConversationId: UUID?

    var body: some View {
        @Bindable var store = chatStore

        NavigationSplitView {
            sidebarContent
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 360)
        } detail: {
            ChatView()
            .environment(\.openSettings, OpenSettingsAction { activeSettingsPanel = .models })
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

            // Always start with a fresh empty conversation (shows welcome page)
            chatStore.createConversation()
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                statusBadge
            }
        }
        .sheet(item: $activeSettingsPanel) { panel in
            SettingsView(initialPanel: panel)
        }
    }

    // MARK: - Sidebar

    private var sidebarContent: some View {
        @Bindable var store = chatStore
        return VStack(spacing: 0) {
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
                .padding(8)

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
                                deletingConversationId = conversation.id
                                isDeletingConversation = true
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
            .alert("Delete Conversation", isPresented: $isDeletingConversation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    if let id = deletingConversationId {
                        chatStore.deleteConversation(id: id)
                    }
                }
            } message: {
                Text("This conversation will be permanently deleted.")
            }

            Divider()
                .padding(.horizontal, 8)
                .padding(.top, 8)

            // Settings menu at bottom
            Menu {
                Button {
                    activeSettingsPanel = .connectors
                } label: {
                    Label("Connectors", systemImage: "puzzlepiece.extension")
                }

                Button {
                    activeSettingsPanel = .models
                } label: {
                    Label("Models", systemImage: "cpu")
                }

                Button {
                    activeSettingsPanel = .about
                } label: {
                    Label("About", systemImage: "info.circle")
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "gearshape")
                        .foregroundStyle(.secondary)
                    Text("Settings")
                        .foregroundStyle(.primary)
                    Spacer()
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 10)
                .contentShape(.rect)
            }
            .menuStyle(.button)
            .sidebarHoverButton()
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
