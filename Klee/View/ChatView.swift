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
    @State private var viewModel = ChatViewModel()
    @State private var showInspector = false
    @FocusState private var isInputFocused: Bool

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
        return msgs.isEmpty && !viewModel.isStreaming
    }

    var body: some View {
        Group {
            if showWelcome {
                welcomeView
            } else {
                VStack(spacing: 0) {
                    if let errorMessage {
                        errorBanner(message: errorMessage)
                    }
                    messageList
                    Divider()
                    inputBar
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
        .onAppear {
            viewModel.llmService = llmService
            viewModel.chatStore = chatStore
            viewModel.mcpClientManager = mcpClientManager
        }
        .onChange(of: chatStore.selectedConversationId) {
            trailingScrollTask?.cancel()
            trailingScrollTask = nil
            viewModel.resetForNewConversation()
        }
        .onChange(of: showWelcome) { _, isWelcome in
            showInspector = !isWelcome
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        ZStack {
            ScrollViewReader { proxy in
                List {
                    ForEach(viewModel.messages) { message in
                        if !(message.role == .assistant && message.content.isEmpty && viewModel.isStreaming) {
                            messageBubble(for: message)
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
                        thinkingBubble
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

    // MARK: - Welcome View

    /// Time-based greeting text
    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good Morning"
        case 12..<17: return "Good Afternoon"
        case 17..<22: return "Good Evening"
        default: return "Good Night"
        }
    }

    private var welcomeView: some View {
        VStack(spacing: 0) {
            Spacer()

            // Greeting
            VStack(spacing: 16) {
                HStack(spacing: 20) {
                    Image(.kleeLogo)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 50)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Text(greeting)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(.primary)
                }
                
                Text("How can Klee help you today?")
                    .foregroundStyle(.secondary)

                if needsModelDownload {
                    // Onboarding: prompt to download a model
                    Text("Download a model to start chatting locally.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button {
                        openSettings()
                    } label: {
                        Label("Download a Model", systemImage: "arrow.down.to.line")
                    }
                    .controlSize(.large)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
                }
            }

            Spacer()

            // Centered input bar
            inputBar
                .frame(maxWidth: 600)
                .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Thinking Bubble

    private var thinkingBubble: some View {
        HStack {
            HStack(spacing: 6) {
                ThinkingIndicator()
                Text("Implementing...")
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            Spacer(minLength: 60)
        }
    }

    // MARK: - Message Bubble

    @ViewBuilder
    private func messageBubble(for message: ChatMessage) -> some View {
        switch message.role {
        case .user:
            HStack {
                Spacer(minLength: 60)
                Text(message.content)
                    .textSelection(.enabled)
                    .padding(8)
                    .foregroundStyle(.white)
                    .background(.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

        case .assistant:
            assistantBubbleContent(message.content)
                .padding(8)

        case .system:
            HStack {
                Spacer()
                Text(message.content)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 4)
                Spacer()
            }
        }
    }

    // MARK: - Assistant Bubble (clean text only; thinking/tool details are in Inspector)

    @ViewBuilder
    private func assistantBubbleContent(_ content: String) -> some View {
        if !content.isEmpty {
            MarkdownTextView(text: content)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        VStack(spacing: 8) {
            TextField("Type a message...", text: $viewModel.inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...8)
                .focused($isInputFocused)
                .disabled(viewModel.isStreaming)
                .onKeyPress(.return, phases: .down) { event in
                    if event.modifiers.contains(.shift) { return .ignored }
                    viewModel.sendMessage()
                    return .handled
                }

            HStack(spacing: 12) {
                if llmService.state == .loading {
                    Text("Loading model...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if llmService.state == .idle {
                    Text("Select a model to start")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                if viewModel.isStreaming {
                    Button {
                        viewModel.stopGeneration()
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.red.opacity(0.8))
                    }
                    .buttonStyle(.plain)
                    .help("Stop generating")
                } else {
                    Button(action: viewModel.sendMessage) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 24))
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.hasText || llmService.state != .ready)
                }
            }
        }
        .padding(12)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(.tertiary, lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
