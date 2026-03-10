//
//  ChatView.swift
//  Klee
//
//  Chat interface: streaming AI conversation powered by MLX local inference.
//  Uses flip technique (inspired by ShipSwift SWMessageList) for the message list,
//  MarkdownTextView for AI reply rendering, and ThinkingIndicator for waiting state.
//

import SwiftUI

// MARK: - Flip Modifier

/// Flips a view to achieve a bottom-anchored chat list effect.
///
/// How it works:
/// 1. Flip the entire List -> top becomes bottom
/// 2. Flip each child item -> content direction restored to normal
/// 3. Reverse the message array -> newest messages appear at the bottom
///
/// Reference: https://www.swiftwithvincent.com/blog/building-the-inverted-scroll-of-a-messaging-app
private extension View {
    func flipped() -> some View {
        rotationEffect(.radians(.pi))
            .scaleEffect(x: -1, y: 1, anchor: .center)
    }
}

// MARK: - ChatView

struct ChatView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager
    @State private var inputText = ""
    @State private var messages: [ChatMessage] = []
    @State private var isStreaming = false
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Message list (flip technique)
            messageList

            Divider()

            // Input bar
            inputBar
        }
        .frame(minWidth: 400, minHeight: 300)
    }

    // MARK: - Message List (flip technique)

    /// Uses List + flip technique to solve the CPU 100% issue with ScrollView + LazyVStack during streaming updates.
    /// Flip principle: flip the entire List to start from bottom, then flip each child to restore content direction.
    private var messageList: some View {
        List {
            // Show empty state when no messages (needs flip to restore direction)
            if messages.isEmpty {
                emptyState
                    .flipped()
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
            }

            // Show ThinkingIndicator when streaming and the latest assistant message is empty
            if isStreaming, let last = messages.last, last.role == .assistant, last.content.isEmpty {
                thinkingBubble
                    .flipped()
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }

            // Reverse array so newest messages appear at bottom after flip
            ForEach(messages.reversed()) { message in
                // Skip empty assistant placeholder messages (displayed by ThinkingIndicator instead)
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
            // User message: right-aligned, accent color background
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
            // AI message: left-aligned, light gray background, Markdown rendering
            HStack {
                MarkdownTextView(text: message.content)
                    .textSelection(.enabled)
                    .padding(10)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                Spacer(minLength: 60)
            }

        case .system:
            // System message: centered, small font
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

    // MARK: - Input Bar

    /// Whether the input field contains valid text
    private var hasText: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var inputBar: some View {
        VStack(spacing: 8) {
            // Text input area
            TextField("Type a message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...8)
                .focused($isInputFocused)
                .disabled(isStreaming)
                .onKeyPress(.return, phases: .down) { event in
                    if event.modifiers.contains(.shift) {
                        return .ignored // Shift+Return for newline
                    }
                    sendCurrentMessage()
                    return .handled
                }

            // Bottom toolbar: hint text + buttons
            HStack(spacing: 12) {
                // Hint text
                if isStreaming {
                    HStack(spacing: 4) {
                        ThinkingIndicator(dotSize: 4, dotColor: .secondary)
                        Text("Generating...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else if llmService.state == .loading {
                    Text("Loading model...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if llmService.state == .idle {
                    Text("Select a model to start")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                // Action buttons
                if isStreaming {
                    // Stop generation
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
                    // Send button
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
        inputText = ""

        // Add user message
        messages.append(ChatMessage(role: .user, content: text))

        // Create empty assistant message placeholder (for streaming fill)
        let assistantMsg = ChatMessage(role: .assistant, content: "")
        messages.append(assistantMsg)
        let assistantID = assistantMsg.id

        isStreaming = true

        Task {
            // Pass full conversation history (excluding empty assistant placeholder)
            let historyForAPI = messages
                .filter { $0.role != .system }
                .dropLast() // Remove empty assistant placeholder
                .map { $0 }

            let stream = llmService.chat(messages: Array(historyForAPI))

            // State for filtering <think>...</think> tags
            var insideThink = false
            var buffer = ""

            for await token in stream {
                buffer += token

                // Process <think> tags: incrementally consume displayable content from buffer
                while !buffer.isEmpty {
                    if insideThink {
                        // Inside think block, looking for </think>
                        if let endRange = buffer.range(of: "</think>") {
                            // Discard thinking content, skip past </think>
                            buffer = String(buffer[endRange.upperBound...])
                            insideThink = false
                        } else {
                            // Haven't received complete </think> yet, keep buffer and wait for more tokens
                            break
                        }
                    } else {
                        // Not inside think block, looking for <think>
                        if let startRange = buffer.range(of: "<think>") {
                            // Output content before <think>
                            let before = String(buffer[..<startRange.lowerBound])
                            if !before.isEmpty,
                               let idx = messages.firstIndex(where: { $0.id == assistantID }) {
                                messages[idx].content += before
                            }
                            buffer = String(buffer[startRange.upperBound...])
                            insideThink = true
                        } else if buffer.contains("<") {
                            // Possibly incomplete <think> tag, output the safe part before <
                            if let ltIndex = buffer.firstIndex(of: "<") {
                                let safe = String(buffer[..<ltIndex])
                                if !safe.isEmpty,
                                   let idx = messages.firstIndex(where: { $0.id == assistantID }) {
                                    messages[idx].content += safe
                                }
                                buffer = String(buffer[ltIndex...])
                            }
                            break
                        } else {
                            // No tags found, output everything
                            if let idx = messages.firstIndex(where: { $0.id == assistantID }) {
                                messages[idx].content += buffer
                            }
                            buffer = ""
                        }
                    }
                }
            }

            // After stream ends, output remaining non-thinking content in buffer
            if !insideThink && !buffer.isEmpty {
                if let idx = messages.firstIndex(where: { $0.id == assistantID }) {
                    messages[idx].content += buffer
                }
            }

            // Trim leading whitespace (may remain after think tag filtering)
            if let idx = messages.firstIndex(where: { $0.id == assistantID }) {
                messages[idx].content = messages[idx].content
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }

            // If assistant message is still empty (generation failed), remove placeholder
            if let idx = messages.firstIndex(where: { $0.id == assistantID }),
               messages[idx].content.isEmpty {
                messages.remove(at: idx)

                // If there's an error message, display it as a system message
                if let error = llmService.error {
                    messages.append(ChatMessage(role: .system, content: "Error: \(error)"))
                }
            }

            isStreaming = false
        }
    }
}

// MARK: - Preview

#Preview {
    ChatView()
        .environment(LLMService())
        .environment(ModelManager())
}
