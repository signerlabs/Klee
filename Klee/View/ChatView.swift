//
//  ChatView.swift
//  Klee
//
//  Chat interface: message list + input bar.
//  All business logic is handled by ChatViewModel.
//  Uses flip technique for bottom-anchored message list.
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

// MARK: - Thinking Block

/// Renders <think> content in a distinct styled block with secondary styling.
private struct ThinkingBlock: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "brain")
                Text("Thinking")
            }
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
    @Environment(ChatStore.self) var chatStore
    @State private var viewModel = ChatViewModel()
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            messageList
            Divider()
            inputBar
        }
        .frame(minWidth: 400, minHeight: 300)
        .onAppear {
            viewModel.llmService = llmService
            viewModel.chatStore = chatStore
        }
        .onChange(of: chatStore.selectedConversationId) {
            viewModel.resetForNewConversation()
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        List {
            if viewModel.messages.isEmpty {
                emptyState
                    .flipped()
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }

            if viewModel.isStreaming,
               let last = viewModel.messages.last,
               last.role == .assistant,
               last.content.isEmpty {
                thinkingBubble
                    .flipped()
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }

            ForEach(viewModel.messages.reversed()) { message in
                if !(message.role == .assistant && message.content.isEmpty && viewModel.isStreaming) {
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

    // MARK: - Assistant Bubble (with <think> block rendering)

    @ViewBuilder
    private func assistantBubbleContent(_ content: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(parseThinkSegments(content).enumerated()), id: \.offset) { _, segment in
                switch segment {
                case .text(let text):
                    MarkdownTextView(text: text)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                case .think(let text):
                    ThinkingBlock(text: text)
                }
            }
        }
    }

    private enum ContentSegment { case text(String); case think(String) }

    private func parseThinkSegments(_ content: String) -> [ContentSegment] {
        var segments: [ContentSegment] = []
        var remaining = content
        while !remaining.isEmpty {
            if let startRange = remaining.range(of: "<think>") {
                let before = String(remaining[..<startRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !before.isEmpty { segments.append(.text(before)) }
                let afterStart = String(remaining[startRange.upperBound...])
                if let endRange = afterStart.range(of: "</think>") {
                    let thinkContent = String(afterStart[..<endRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                    if !thinkContent.isEmpty { segments.append(.think(thinkContent)) }
                    remaining = String(afterStart[endRange.upperBound...])
                } else {
                    let thinkContent = afterStart.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !thinkContent.isEmpty { segments.append(.think(thinkContent)) }
                    remaining = ""
                }
            } else {
                let text = remaining.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { segments.append(.text(text)) }
                remaining = ""
            }
        }
        return segments
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
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.3))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color(nsColor: .separatorColor).opacity(0.4), lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
