//
//  ChatView.swift
//  Klee
//
//  Chat interface: message list + input bar.
//  All business logic is handled by ChatViewModel.
//

import SwiftUI

// MARK: - ChatView

struct ChatView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager
    @Environment(ChatStore.self) var chatStore
    @Environment(MCPClientManager.self) var mcpClientManager
    @Environment(\.openSettings) private var openSettings
    @State private var viewModel: ChatViewModel?
    @State private var showInspector = false

    /// Throttle state for scroll-to-bottom
    @State private var lastScrollTime: Date = .distantPast
    @State private var trailingScrollTask: Task<Void, Never>?

    /// Whether the user has no downloaded models at all
    private var needsModelDownload: Bool {
        !modelManager.availableModels.isEmpty
            && modelManager.cachedModelIds.isEmpty
            && llmService.state == .idle
    }

    /// Extract error message from LLMState if in error state
    private var errorMessage: String? {
        if case .error(let msg) = llmService.state { return msg }
        return nil
    }

    /// Whether to show the welcome page (no messages yet).
    /// Uses chatStore directly (available immediately via @Environment)
    /// instead of viewModel.messages (which requires onAppear to set chatStore).
    private var showWelcome: Bool {
        let msgs = chatStore.currentConversation?.messages ?? []
        return msgs.isEmpty && !(viewModel?.isStreaming ?? false)
    }

    var body: some View {
        Group {
            if let viewModel {
                chatContent(viewModel: viewModel)
            } else {
                Color.clear
            }
        }
        .onAppear {
            if viewModel == nil {
                viewModel = ChatViewModel(
                    llmService: llmService,
                    chatStore: chatStore,
                    mcpClientManager: mcpClientManager
                )
            }
        }
        .onChange(of: chatStore.selectedConversationId) {
            trailingScrollTask?.cancel()
            trailingScrollTask = nil
            viewModel?.resetForNewConversation()
        }
        .onChange(of: showWelcome) { _, isWelcome in
            showInspector = !isWelcome
        }
    }

    // MARK: - Main Content

    @ViewBuilder
    private func chatContent(viewModel: ChatViewModel) -> some View {
        Group {
            if showWelcome {
                WelcomeView(
                    needsModelDownload: needsModelDownload,
                    onOpenSettings: { openSettings() }
                ) {
                    inputBar(viewModel: viewModel)
                }
            } else {
                VStack(spacing: 0) {
                    if let errorMessage {
                        errorBanner(message: errorMessage)
                    }
                    messageList(viewModel: viewModel)
                    Divider()
                    inputBar(viewModel: viewModel)
                }
            }
        }
        .frame(minWidth: 400, minHeight: 300)
        .inspector(isPresented: $showInspector) {
            InspectorView(items: viewModel.inspectorItems)
                .inspectorColumnWidth(min: 250, ideal: 300, max: 400)
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    withAnimation {
                        showInspector.toggle()
                    }
                } label: {
                    Image(systemName: "sidebar.right")
                }
                .help("Toggle Inspector")
            }
        }
    }

    // MARK: - Message List

    private func messageList(viewModel: ChatViewModel) -> some View {
        ZStack {
            ScrollViewReader { proxy in
                List {
                    ForEach(viewModel.messages) { message in
                        if !(message.role == .assistant && message.content.isEmpty && viewModel.isStreaming) {
                            MessageBubbleView(message: message)
                                .id(message.id)
                                .listRowSeparator(.hidden)
                                .listRowBackground(Color.clear)
                                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        }
                    }

                    if viewModel.isStreaming,
                       let last = viewModel.messages.last,
                       last.role == .assistant,
                       last.content.isEmpty {
                        ThinkingBubbleView()
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                            .id("chat-thinking")
                    }

                    // Invisible bottom anchor
                    Color.clear
                        .frame(height: 1)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                        .id("chat-bottom")
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .onChange(of: viewModel.messages.last?.content) {
                    throttleScroll(proxy: proxy)
                }
                .onChange(of: viewModel.messages.count) {
                    throttleScroll(proxy: proxy)
                }
                .onChange(of: viewModel.isStreaming) {
                    throttleScroll(proxy: proxy)
                }
            }
        }
    }

    // MARK: - Input Bar

    private func inputBar(viewModel: ChatViewModel) -> some View {
        InputBarView(
            inputText: Binding(
                get: { viewModel.inputText },
                set: { viewModel.inputText = $0 }
            ),
            pendingImageURLs: Binding(
                get: { viewModel.pendingImageURLs },
                set: { viewModel.pendingImageURLs = $0 }
            ),
            isStreaming: viewModel.isStreaming,
            hasContent: viewModel.hasContent,
            llmState: llmService.state,
            currentModelSupportsVision: viewModel.currentModelSupportsVision,
            onSend: { viewModel.sendMessage() },
            onStop: { viewModel.stopGeneration() },
            onPickImages: { viewModel.pickImages() },
            onRemoveImage: { viewModel.removePendingImage(at: $0) }
        )
    }

    // MARK: - Error Banner

    /// Inline error banner displayed at the top of the chat area
    private func errorBanner(message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.white)
            Text(message)
                .font(.callout)
                .foregroundStyle(.white)
                .lineLimit(2)
            Spacer()
            Button("Open Settings") {
                openSettings()
            }
            .buttonStyle(.bordered)
            .tint(.white)
            .controlSize(.small)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.red.opacity(0.85))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    // MARK: - Scroll Throttle

    /// Throttled scroll-to-bottom: at most once every 400ms, with a trailing scroll to catch the final update.
    private func throttleScroll(proxy: ScrollViewProxy) {
        let now = Date()
        if now.timeIntervalSince(lastScrollTime) >= 0.4 {
            lastScrollTime = now
            proxy.scrollTo("chat-bottom", anchor: .bottom)
        }
        trailingScrollTask?.cancel()
        trailingScrollTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            lastScrollTime = Date()
            proxy.scrollTo("chat-bottom", anchor: .bottom)
        }
    }
}
