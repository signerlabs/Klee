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

// MARK: - Tool Call Bubble

/// Renders an MCP tool call block with status indicator and collapsible detail.
private struct ToolCallBubble: View {
    let toolName: String
    let arguments: String
    let result: String
    let status: ToolCallDisplayStatus

    @State private var isExpanded = false

    enum ToolCallDisplayStatus {
        case calling
        case completed
        case failed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header row: icon + tool name + status
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    statusIcon
                    Text(toolName)
                        .fontWeight(.medium)
                        .fontDesign(.monospaced)
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .imageScale(.small)
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)

            // Collapsible detail section
            if isExpanded {
                VStack(alignment: .leading, spacing: 4) {
                    if !arguments.isEmpty {
                        Text("Arguments")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .textCase(.uppercase)
                        Text(arguments)
                            .font(.caption)
                            .fontDesign(.monospaced)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                    if !result.isEmpty {
                        Divider()
                        Text(status == .failed ? "Error" : "Result")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .textCase(.uppercase)
                        Text(result)
                            .font(.caption)
                            .fontDesign(.monospaced)
                            .foregroundStyle(status == .failed ? .red : .secondary)
                            .textSelection(.enabled)
                            .lineLimit(isExpanded ? nil : 3)
                    }
                }
                .padding(.leading, 22)
            }
        }
        .font(.callout)
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch status {
        case .calling:
            ProgressView()
                .controlSize(.small)
                .frame(width: 16, height: 16)
        case .completed:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        case .failed:
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(.red)
        }
    }
}

// MARK: - ChatView

struct ChatView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager
    @Environment(ChatStore.self) var chatStore
    @Environment(MCPClientManager.self) var mcpClientManager
    @Environment(\.openSettings) private var openSettings
    @State private var viewModel = ChatViewModel()
    @FocusState private var isInputFocused: Bool

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

    var body: some View {
        VStack(spacing: 0) {
            // Inline error banner when model loading fails
            if let errorMessage {
                errorBanner(message: errorMessage)
            }
            messageList
            // Active tool call status indicator
            if let toolCall = viewModel.currentToolCall {
                activeToolCallBar(toolCall)
            }
            Divider()
            inputBar
        }
        .frame(minWidth: 400, minHeight: 300)
        .onAppear {
            viewModel.llmService = llmService
            viewModel.chatStore = chatStore
            viewModel.mcpClientManager = mcpClientManager
        }
        .onChange(of: chatStore.selectedConversationId) {
            viewModel.resetForNewConversation()
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        ZStack {
            List {
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
            .padding(.vertical)

            // Empty state sits outside the flipped List to preserve gesture hit testing
            if viewModel.messages.isEmpty {
                emptyState
            }
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

    // MARK: - Empty State

    @ViewBuilder
    private var emptyState: some View {
        if needsModelDownload {
            onboardingState
        } else {
            defaultEmptyState
        }
    }

    /// Default empty chat placeholder
    private var defaultEmptyState: some View {
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

    // MARK: - Onboarding State (first launch, no models downloaded)

    private var onboardingState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "arrow.down.circle")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("Welcome to Klee")
                .font(.title3)
                .fontWeight(.semibold)
            Text("Download a model to start chatting locally.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                openSettings()
            } label: {
                Label("Download a Model", systemImage: "arrow.down.to.line")
            }
            .controlSize(.large)
            .buttonStyle(.borderedProminent)
            .padding(.top, 4)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 60)
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

    // MARK: - Assistant Bubble (with <think> block rendering)

    @ViewBuilder
    private func assistantBubbleContent(_ content: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(parseContentSegments(content).enumerated()), id: \.offset) { _, segment in
                switch segment {
                case .text(let text):
                    MarkdownTextView(text: text)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                case .think(let text):
                    ThinkingBlock(text: text)
                case .toolCall(let name, let arguments, let result, let failed):
                    ToolCallBubble(
                        toolName: name,
                        arguments: arguments,
                        result: result,
                        status: failed ? .failed : (result.isEmpty ? .calling : .completed)
                    )
                }
            }
        }
    }

    private enum ContentSegment {
        case text(String)
        case think(String)
        case toolCall(name: String, arguments: String, result: String, failed: Bool)
    }

    /// Parses assistant message content into segments: plain text, <think> blocks, and <tool_call> blocks.
    /// Tool call format: <tool_call>name|arguments|result</tool_call> or <tool_call_error>name|arguments|error</tool_call_error>
    private func parseContentSegments(_ content: String) -> [ContentSegment] {
        var segments: [ContentSegment] = []
        var remaining = content

        while !remaining.isEmpty {
            // Find the nearest special tag
            let thinkRange = remaining.range(of: "<think>")
            let toolCallRange = remaining.range(of: "<tool_call>")
            let toolErrorRange = remaining.range(of: "<tool_call_error>")

            // Determine which tag comes first
            let candidates: [(Range<String.Index>, String)] = [
                thinkRange.map { ($0, "think") },
                toolCallRange.map { ($0, "tool_call") },
                toolErrorRange.map { ($0, "tool_call_error") },
            ].compactMap { $0 }

            guard let nearest = candidates.min(by: { $0.0.lowerBound < $1.0.lowerBound }) else {
                // No more tags -- rest is plain text
                let text = remaining.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { segments.append(.text(text)) }
                break
            }

            // Capture text before the tag
            let before = String(remaining[..<nearest.0.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !before.isEmpty { segments.append(.text(before)) }

            let afterStart = String(remaining[nearest.0.upperBound...])

            switch nearest.1 {
            case "think":
                if let endRange = afterStart.range(of: "</think>") {
                    let inner = String(afterStart[..<endRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                    if !inner.isEmpty { segments.append(.think(inner)) }
                    remaining = String(afterStart[endRange.upperBound...])
                } else {
                    let inner = afterStart.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !inner.isEmpty { segments.append(.think(inner)) }
                    remaining = ""
                }

            case "tool_call":
                if let endRange = afterStart.range(of: "</tool_call>") {
                    let inner = String(afterStart[..<endRange.lowerBound])
                    let parsed = parseToolCallContent(inner, failed: false)
                    segments.append(parsed)
                    remaining = String(afterStart[endRange.upperBound...])
                } else {
                    // Unclosed -- treat as in-progress tool call
                    let parsed = parseToolCallContent(afterStart, failed: false)
                    segments.append(parsed)
                    remaining = ""
                }

            case "tool_call_error":
                if let endRange = afterStart.range(of: "</tool_call_error>") {
                    let inner = String(afterStart[..<endRange.lowerBound])
                    let parsed = parseToolCallContent(inner, failed: true)
                    segments.append(parsed)
                    remaining = String(afterStart[endRange.upperBound...])
                } else {
                    let parsed = parseToolCallContent(afterStart, failed: true)
                    segments.append(parsed)
                    remaining = ""
                }

            default:
                remaining = afterStart
            }
        }

        return segments
    }

    /// Parse tool call inner content. Expected format: "name|arguments|result" (pipe-separated).
    private func parseToolCallContent(_ raw: String, failed: Bool) -> ContentSegment {
        let parts = raw.split(separator: "|", maxSplits: 2).map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        let name = parts.indices.contains(0) ? parts[0] : "Unknown Tool"
        let arguments = parts.indices.contains(1) ? parts[1] : ""
        let result = parts.indices.contains(2) ? parts[2] : ""
        return .toolCall(name: name, arguments: arguments, result: result, failed: failed)
    }

    // MARK: - Active Tool Call Bar

    /// Shows the currently executing tool call above the input bar
    private func activeToolCallBar(_ state: ChatViewModel.ToolCallState) -> some View {
        HStack(spacing: 8) {
            switch state {
            case .calling(let toolName):
                ProgressView()
                    .controlSize(.small)
                Text("Calling \(toolName)...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            case .completed(let toolName, _):
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .imageScale(.small)
                Text("\(toolName) completed")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            case .failed(let toolName, let error):
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.red)
                    .imageScale(.small)
                Text("\(toolName) failed: \(error)")
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
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
