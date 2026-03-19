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
    @Environment(ModuleManager.self) var moduleManager
    @Environment(\.openSettings) private var openSettings
    @State private var viewModel: ChatViewModel?
    @State private var showConfig = false
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
                    moduleManager: moduleManager
                )
            }
        }
        .onChange(of: chatStore.selectedConversationId) {
            trailingScrollTask?.cancel()
            trailingScrollTask = nil
            viewModel?.resetForNewConversation()
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
        .inspector(isPresented: $showConfig) {
            ChatConfigView()
                .inspectorColumnWidth(min: 220, ideal: 260, max: 320)
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    withAnimation {
                        showConfig.toggle()
                    }
                } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .help("Toggle Config")
            }
        }
    }

    // MARK: - Message List

    private func messageList(viewModel: ChatViewModel) -> some View {
        ZStack {
            ScrollViewReader { proxy in
                List {
                    ForEach(viewModel.messages) { message in
                        // Insert thinking block BEFORE the last assistant message
                        if message.role == .assistant,
                           message.id == viewModel.messages.last?.id {
                            // Thinking block above the assistant reply
                            if let thinking = viewModel.currentThinkingContent {
                                ThinkingBlockView(content: thinking, isStreaming: viewModel.isStreaming)
                                    .listRowSeparator(.hidden)
                                    .listRowBackground(Color.clear)
                                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                                    .id("chat-thinking")
                            } else if viewModel.isStreaming && message.content.isEmpty {
                                ThinkingBubbleView()
                                    .listRowSeparator(.hidden)
                                    .listRowBackground(Color.clear)
                                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                                    .id("chat-thinking")
                            }
                        }

                        // The message itself (skip empty assistant placeholder during streaming)
                        if !(message.role == .assistant && message.content.isEmpty && viewModel.isStreaming) {
                            MessageBubbleView(message: message)
                                .id(message.id)
                                .listRowSeparator(.hidden)
                                .listRowBackground(Color.clear)
                                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        }
                    }

                    // Performance metrics row: shown after the last assistant reply finishes
                    if !viewModel.isStreaming,
                       let last = viewModel.messages.last,
                       last.role == .assistant,
                       llmService.tokensPerSecond > 0 {
                        performanceMetricsRow
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

    // MARK: - Performance Metrics

    /// Compact performance stats shown below the latest assistant reply.
    /// Uses detailed metrics from LLMService when available,
    /// falls back to the aggregate tokensPerSecond otherwise.
    private var performanceMetricsRow: some View {
        HStack {
            Text(performanceMetricsText)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            Spacer()
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
        .id("perf-metrics")
    }

    /// Build the metrics display string.
    /// Full format:   ⚡ {TTFT}s · {decode_speed} tok/s · {total_tokens} tokens
    /// Fallback:      ⚡ {overall_speed} tok/s
    private var performanceMetricsText: String {
        let prefillMs   = llmService.lastPrefillTimeMs
        let decodeTps   = llmService.lastDecodeTokensPerSec
        let totalTokens = llmService.lastTotalTokens

        if totalTokens > 0, decodeTps > 0 {
            // Detailed metrics available from LLMService
            let ttftSec = String(format: "%.1f", prefillMs / 1000)
            let speed   = String(format: "%.1f", decodeTps)
            return "\u{26A1} \(ttftSec)s \u{00B7} \(speed) tok/s \u{00B7} \(totalTokens) tokens"
        } else {
            // Fallback: only aggregate speed
            let speed = String(format: "%.1f", llmService.tokensPerSecond)
            return "\u{26A1} \(speed) tok/s"
        }
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
