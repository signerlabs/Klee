//
//  ChatView.swift
//  Klee
//
//  聊天界面：流式 AI 对话，对接 MLX 本地推理。
//  保留原有 UI 结构，将 OllamaService 替换为 LLMService。
//

import SwiftUI

struct ChatView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager
    @State private var inputText = ""
    @State private var messages: [ChatMessage] = []
    @State private var isStreaming = false
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // 模型状态栏
            modelBar

            Divider()

            // 消息列表
            messageList

            Divider()

            // 流式生成指示器
            if isStreaming {
                streamingIndicator
            }

            // 输入栏
            inputBar
        }
        .frame(minWidth: 400, minHeight: 300)
    }

    // MARK: - 模型状态栏

    private var modelBar: some View {
        HStack {
            Image(systemName: "cpu")
                .foregroundStyle(.secondary)

            if let modelId = llmService.currentModelId {
                // 显示模型简称（取最后一段）
                let shortName = modelId.components(separatedBy: "/").last ?? modelId
                Text(shortName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("No Model Loaded")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // 生成速度
            if llmService.state == .generating, llmService.tokensPerSecond > 0 {
                Text(String(format: "%.1f tok/s", llmService.tokensPerSecond))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
    }

    // MARK: - 消息列表

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if messages.isEmpty {
                        emptyState
                    }
                    ForEach(messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }
                }
                .padding()
            }
            .onChange(of: messages.count) {
                scrollToBottom(proxy)
            }
            .onChange(of: messages.last?.content) {
                scrollToBottom(proxy)
            }
        }
    }

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

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        if let last = messages.last {
            withAnimation(.easeOut(duration: 0.15)) {
                proxy.scrollTo(last.id, anchor: .bottom)
            }
        }
    }

    // MARK: - 流式生成指示器

    private var streamingIndicator: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
            Text("Generating...")
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer()

            // 停止生成按钮
            Button {
                llmService.stopGeneration()
                isStreaming = false
            } label: {
                Image(systemName: "stop.circle.fill")
                    .foregroundStyle(.red.opacity(0.7))
            }
            .buttonStyle(.plain)
            .help("Stop generating")
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
    }

    // MARK: - 输入栏

    private var isSendDisabled: Bool {
        inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || isStreaming
            || llmService.state != .ready
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            TextField("Type a message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...5)
                .focused($isInputFocused)
                .onKeyPress(.return, phases: .down) { event in
                    if event.modifiers.contains(.shift) {
                        return .ignored // 允许换行
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

    // MARK: - 发送消息

    private func sendCurrentMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming, llmService.state == .ready else { return }
        inputText = ""

        // 添加用户消息
        messages.append(ChatMessage(role: .user, content: text))

        // 创建空的助手消息占位（用于流式填充）
        let assistantMsg = ChatMessage(role: .assistant, content: "")
        messages.append(assistantMsg)
        let assistantID = assistantMsg.id

        isStreaming = true

        Task {
            // 传入完整对话历史（不含空的助手占位消息）
            let historyForAPI = messages
                .filter { $0.role != .system }
                .dropLast() // 移除空的助手占位
                .map { $0 }

            let stream = llmService.chat(messages: Array(historyForAPI))

            for await token in stream {
                if let idx = messages.firstIndex(where: { $0.id == assistantID }) {
                    messages[idx].content += token
                }
            }

            // 如果助手消息仍为空（生成失败），移除占位
            if let idx = messages.firstIndex(where: { $0.id == assistantID }),
               messages[idx].content.isEmpty {
                messages.remove(at: idx)

                // 如果有错误信息，显示为系统消息
                if let error = llmService.error {
                    messages.append(ChatMessage(role: .system, content: "Error: \(error)"))
                }
            }

            isStreaming = false
        }
    }
}

// MARK: - 消息气泡

private struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 60) }

            if message.role == .system {
                // 系统消息：小字体，无气泡
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

// MARK: - 预览

#Preview {
    ChatView()
        .environment(LLMService())
        .environment(ModelManager())
}
