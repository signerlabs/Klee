//
//  ChatView.swift
//  Klee
//
//  Chat interface with message list, streaming AI responses, and agent activity indicator.
//

import SwiftUI

struct ChatView: View {
    @ObservedObject var wsManager: WebSocketManager
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Message list
            messageList

            Divider()

            // Agent activity indicator
            if wsManager.agentActivity != .idle {
                agentActivityBar
            }

            // Input bar
            inputBar
        }
        .frame(minWidth: 400, minHeight: 300)
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(wsManager.messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }
                }
                .padding()
            }
            .onChange(of: wsManager.messages.count) {
                // Auto-scroll to latest message
                if let last = wsManager.messages.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .onChange(of: wsManager.messages.last?.content) {
                // Also scroll when streaming content updates
                if let last = wsManager.messages.last {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }

    // MARK: - Agent Activity Bar

    private var agentActivityBar: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)

            Text(activityLabel)
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
    }

    private var activityLabel: String {
        switch wsManager.agentActivity {
        case .idle: return ""
        case .thinking: return "Thinking..."
        case .executing(let tool): return "Executing: \(tool)"
        case .done: return "Done"
        }
    }

    // MARK: - Input Bar

    /// Whether the send action should be disabled.
    private var isSendDisabled: Bool {
        inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || wsManager.connectionState != .connected  // C3 fix: block send when not connected
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            TextField("Send a message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...5)
                .focused($isInputFocused)
                // C2 fix: use onKeyPress for reliable modifier detection (macOS 14+)
                .onKeyPress(.return, phases: .down) { event in
                    if event.modifiers.contains(.shift) {
                        return .ignored  // Let system insert newline
                    }
                    sendCurrentMessage()
                    return .handled
                }

            Button(action: sendCurrentMessage) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(isSendDisabled ? .gray : .accentColor)
            }
            .buttonStyle(.plain)
            .disabled(isSendDisabled)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: - Actions

    private func sendCurrentMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""

        Task {
            await wsManager.sendMessage(text)
        }
    }
}

// MARK: - Message Bubble

private struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 60) }

            if message.role == .system {
                // System messages: caption style only, no bubble (C1 fix)
                Text(message.content)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 4)
            } else {
                VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                    Text(message.content)
                        .textSelection(.enabled)
                        .padding(10)
                        .background(bubbleBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }

            if message.role == .assistant || message.role == .system { Spacer(minLength: 60) }
        }
    }

    private var bubbleBackground: some ShapeStyle {
        switch message.role {
        case .user:
            return AnyShapeStyle(Color.accentColor.opacity(0.15))
        case .assistant:
            return AnyShapeStyle(Color(nsColor: .controlBackgroundColor))
        case .system:
            return AnyShapeStyle(Color.orange.opacity(0.1))
        }
    }
}

// MARK: - Preview

#Preview {
    ChatView(wsManager: WebSocketManager(port: 18789, token: "preview"))
}
