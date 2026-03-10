//
//  ChatView.swift
//  Klee
//
//  Chat interface: streaming AI conversation powered by MLX local inference.
//  Messages are stored in ChatStore (JSON persistence) instead of local @State.
//  Uses flip technique for the message list, MarkdownTextView for AI reply rendering.
//

import SwiftUI

// MARK: - Flip Modifier

/// Flips a view to achieve a bottom-anchored chat list effect.
private extension View {
    func flipped() -> some View {
        rotationEffect(.radians(.pi))
            .scaleEffect(x: -1, y: 1, anchor: .center)
    }
}

// MARK: - Thinking Block (collapsible, default expanded)

/// Renders <think> content in a distinct styled block.
/// Displayed inline with a subtle background and label. Max 3 lines with "show more" via scroll.
/// Note: Interactive gestures (tap/toggle) don't work inside the flipped List,
/// so the block is non-collapsible.
private struct ThinkingBlock: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Header
            HStack(spacing: 4) {
                Image(systemName: "brain")
                Text("Thinking")
            }

            // Content (compact, secondary color)
            Text(text)
        }
        .font(.callout)
        .foregroundStyle(.secondary)
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - ChatView

struct ChatView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager
    @Environment(ChatStore.self) var chatStore
    @State private var inputText = ""
    @State private var isStreaming = false
    @FocusState private var isInputFocused: Bool

    /// Messages for the current conversation (convenience)
    private var messages: [ChatMessage] {
        chatStore.currentConversation?.messages ?? []
    }

    /// The ID of the current conversation
    private var conversationId: UUID? {
        chatStore.selectedConversationId
    }

    var body: some View {
        VStack(spacing: 0) {
            // Message list (flip technique)
            messageList

            Divider()

            // Input bar
            inputBar
        }
        .frame(minWidth: 400, minHeight: 300)
        .onChange(of: chatStore.selectedConversationId) {
            // Reset streaming state when switching conversations
            isStreaming = false
            inputText = ""
        }
    }

    // MARK: - Message List (flip technique)

    private var messageList: some View {
        List {
            // Empty state
            if messages.isEmpty {
                emptyState
                    .flipped()
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
            }

            // Thinking indicator when streaming and assistant message is empty
            if isStreaming, let last = messages.last, last.role == .assistant, last.content.isEmpty {
                thinkingBubble
                    .flipped()
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }

            // Reverse array so newest messages appear at bottom after flip
            ForEach(messages.reversed()) { message in
                if !(message.role == .assistant && message.content.isEmpty && isStreaming) {
                    messageBubble(for: message)
                        .flipped()
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .flipped()
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.largeTitle)
                .foregroundStyle(.quaternary)
            Text("Send a message to start chatting")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 80)
    }

    // MARK: - Thinking Bubble

    private var thinkingBubble: some View {
        HStack {
            HStack(spacing: 6) {
                Text("Thinking")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                ThinkingIndicator()
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
                    .padding(10)
                    .foregroundStyle(.white)
                    .background(Color.accentColor)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }

        case .assistant:
            HStack {
                assistantBubbleContent(message.content)
                    .padding(10)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                Spacer(minLength: 60)
            }

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

    // MARK: - Assistant Bubble Content (with think block support)

    /// Parses <think>...</think> blocks from assistant content and renders them
    /// as collapsible DisclosureGroups with secondary styling.
    @ViewBuilder
    private func assistantBubbleContent(_ content: String) -> some View {
        let segments = parseThinkSegments(content)
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                switch segment {
                case .text(let text):
                    MarkdownTextView(text: text)
                        .textSelection(.enabled)
                case .think(let text):
                    ThinkingBlock(text: text)
                }
            }
        }
    }

    /// Segment type for parsed assistant content
    private enum ContentSegment {
        case text(String)
        case think(String)
    }

    /// Parse content into alternating text and think segments
    private func parseThinkSegments(_ content: String) -> [ContentSegment] {
        var segments: [ContentSegment] = []
        var remaining = content

        while !remaining.isEmpty {
            if let startRange = remaining.range(of: "<think>") {
                // Text before <think>
                let before = String(remaining[..<startRange.lowerBound])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !before.isEmpty {
                    segments.append(.text(before))
                }

                let afterStart = String(remaining[startRange.upperBound...])
                if let endRange = afterStart.range(of: "</think>") {
                    // Complete think block
                    let thinkContent = String(afterStart[..<endRange.lowerBound])
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if !thinkContent.isEmpty {
                        segments.append(.think(thinkContent))
                    }
                    remaining = String(afterStart[endRange.upperBound...])
                } else {
                    // Unclosed think block (still streaming) — show what we have
                    let thinkContent = afterStart.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !thinkContent.isEmpty {
                        segments.append(.think(thinkContent))
                    }
                    remaining = ""
                }
            } else {
                // No more think tags
                let text = remaining.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty {
                    segments.append(.text(text))
                }
                remaining = ""
            }
        }

        return segments
    }

    // MARK: - Input Bar

    private var hasText: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var inputBar: some View {
        VStack(spacing: 8) {
            TextField("Type a message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...8)
                .focused($isInputFocused)
                .disabled(isStreaming)
                .onKeyPress(.return, phases: .down) { event in
                    if event.modifiers.contains(.shift) {
                        return .ignored
                    }
                    sendCurrentMessage()
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

                if isStreaming {
                    Button {
                        llmService.stopGeneration()
                        isStreaming = false
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.red.opacity(0.8))
                    }
                    .buttonStyle(.plain)
                    .help("Stop generating")
                } else {
                    Button(action: sendCurrentMessage) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 24))
                    }
                    .buttonStyle(.plain)
                    .disabled(!hasText || llmService.state != .ready)
                }
            }
        }
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.3))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color(nsColor: .separatorColor).opacity(0.4), lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: - Send Message

    private func sendCurrentMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming, llmService.state == .ready else { return }
        guard let convId = conversationId else { return }
        inputText = ""

        // Check if this is the first user message (for title generation)
        let isFirstMessage = messages.isEmpty

        // Add user message
        let userMsg = ChatMessage(role: .user, content: text)
        chatStore.appendMessage(userMsg, to: convId)

        // Create empty assistant message placeholder
        let assistantMsg = ChatMessage(role: .assistant, content: "")
        chatStore.appendMessage(assistantMsg, to: convId)
        let assistantID = assistantMsg.id

        isStreaming = true

        Task {
            // Build history for API (exclude empty assistant placeholder)
            let historyForAPI = messages
                .filter { $0.role != .system }
                .dropLast()
                .map { $0 }

            let stream = llmService.chat(messages: Array(historyForAPI))

            // Stream tokens directly (keep <think> tags for rendering layer to handle)
            var accumulatedContent = ""

            for await token in stream {
                accumulatedContent += token
                chatStore.updateMessage(id: assistantID, in: convId, content: accumulatedContent)
            }

            // Trim whitespace
            let trimmed = accumulatedContent.trimmingCharacters(in: .whitespacesAndNewlines)
            chatStore.updateMessage(id: assistantID, in: convId, content: trimmed)

            // If assistant message is still empty, remove it
            if trimmed.isEmpty {
                chatStore.removeMessage(id: assistantID, from: convId)

                if let error = llmService.error {
                    let errMsg = ChatMessage(role: .system, content: "Error: \(error)")
                    chatStore.appendMessage(errMsg, to: convId)
                }
            }

            // Save conversation after streaming completes
            chatStore.saveConversation(id: convId)

            isStreaming = false

            // Generate AI title after streaming completes (LLM is now free)
            if isFirstMessage {
                generateTitle(for: convId, basedOn: text)
            }
        }
    }

    // MARK: - AI Title Generation

    /// Generate a short title for the conversation using the LLM.
    /// Runs asynchronously and does not block the chat flow.
    private func generateTitle(for conversationId: UUID, basedOn userMessage: String) {
        Task.detached { @MainActor [llmService, chatStore] in
            // Only generate if the conversation still has the default title
            guard let conv = chatStore.conversations.first(where: { $0.id == conversationId }),
                  conv.hasDefaultTitle else { return }

            // Check if LLM is available
            guard llmService.state.isReady else {
                // Fallback: use first 20 characters of user message
                let fallback = String(userMessage.prefix(20))
                chatStore.updateTitle(fallback, for: conversationId)
                return
            }

            // Build a title-generation prompt (explicit: no thinking, no quotes, short)
            let prompt = "Generate a very short title (max 5 words) for this chat message. Reply with ONLY the title, nothing else. No thinking, no quotes, no explanation.\n\nMessage: \(userMessage)"
            let titleMessages = [ChatMessage(role: .user, content: prompt)]
            let stream = llmService.chat(messages: titleMessages)

            var rawTitle = ""
            for await token in stream {
                rawTitle += token
            }

            // Strip <think>...</think> tags from response
            var title = rawTitle
            while let startRange = title.range(of: "<think>") {
                if let endRange = title.range(of: "</think>") {
                    title.removeSubrange(startRange.lowerBound..<endRange.upperBound)
                } else {
                    // Incomplete think tag, remove from <think> to end
                    title.removeSubrange(startRange.lowerBound..<title.endIndex)
                }
            }

            // Clean up
            title = title.trimmingCharacters(in: .whitespacesAndNewlines)
            // Remove surrounding quotes if present
            if (title.hasPrefix("\"") && title.hasSuffix("\"")) ||
               (title.hasPrefix("'") && title.hasSuffix("'")) {
                title = String(title.dropFirst().dropLast())
            }
            // Take only the first line
            if let firstLine = title.components(separatedBy: .newlines).first(where: { !$0.isEmpty }) {
                title = firstLine.trimmingCharacters(in: .whitespacesAndNewlines)
            }

            // Limit length and apply
            if title.isEmpty {
                title = String(userMessage.prefix(20))
            } else if title.count > 40 {
                title = String(title.prefix(40))
            }

            chatStore.updateTitle(title, for: conversationId)
        }
    }
}

// MARK: - Preview

#Preview {
    ChatView()
        .environment(LLMService())
        .environment(ModelManager())
        .environment(ChatStore())
}
