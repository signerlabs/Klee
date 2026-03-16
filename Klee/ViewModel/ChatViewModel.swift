//
//  ChatViewModel.swift
//  Klee
//
//  Business logic for the chat interface.
//  Handles message sending, streaming, and AI title generation.
//  ChatView owns an instance and delegates all non-UI logic here.
//

import AppKit
import Foundation
@preconcurrency import MLXLMCommon
import Observation
import UniformTypeIdentifiers

// MARK: - Inspector Item

/// Represents a single entry in the Inspector panel (thinking block or tool call)
struct InspectorItem: Identifiable, Codable, Equatable {
    let id: UUID
    let timestamp: Date
    var content: Content

    enum Content: Codable, Equatable {
        case thinking(String)
        case toolCall(name: String, arguments: String, status: ToolCallStatus)
    }

    enum ToolCallStatus: Codable, Equatable {
        case calling
        case completed(result: String)
        case failed(error: String)
    }

    init(timestamp: Date, content: Content) {
        self.id = UUID()
        self.timestamp = timestamp
        self.content = content
    }
}

@Observable
@MainActor
class ChatViewModel {

    // MARK: - Tool Call State

    /// Represents the current state of an MCP tool call during agent execution
    enum ToolCallState: Equatable {
        case calling(toolName: String)
        case completed(toolName: String, result: String)
        case failed(toolName: String, error: String)
    }

    // MARK: - Observable State

    var inputText: String = ""
    var isStreaming: Bool = false

    /// Pending image attachments (file URLs) for the next message
    var pendingImageURLs: [URL] = []

    /// Current active tool call (nil when no tool is being invoked)
    var currentToolCall: ToolCallState?

    /// All thinking and tool call events for the current conversation, shown in Inspector
    var inspectorItems: [InspectorItem] = []

    // MARK: - Private Streaming State

    /// Index of the currently streaming thinking item in inspectorItems (nil when not inside a <think> block)
    private var streamingThinkingIndex: Int?

    /// Whether the current round's think block has been finalized (prevents duplicate processing)
    private var thinkBlockFinalized = false

    // MARK: - Dependencies (injected after init)

    var llmService: LLMService?
    var chatStore: ChatStore?
    var mcpClientManager: MCPClientManager?

    // MARK: - Constants

    /// Maximum number of tool-call round-trips before forcing completion
    private let maxToolCallRounds = 10

    // MARK: - Computed Helpers

    var hasText: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Whether there is any content to send (text or images)
    var hasContent: Bool {
        hasText || !pendingImageURLs.isEmpty
    }

    /// Whether the current model supports vision input
    var currentModelSupportsVision: Bool {
        guard let modelId = llmService?.currentModelId else { return false }
        return ModelInfo.recommended.first(where: { $0.id == modelId })?.supportsVision ?? false
    }

    var messages: [ChatMessage] {
        chatStore?.currentConversation?.messages ?? []
    }

    var conversationId: UUID? {
        chatStore?.selectedConversationId
    }

    // MARK: - Send Message

    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard hasContent,
              !isStreaming,
              llmService?.state == .ready,
              let convId = conversationId,
              let llm = llmService,
              let store = chatStore else { return }

        // Capture and clear pending images
        let imageURLs = pendingImageURLs
        let imageURLStrings = imageURLs.map { $0.absoluteString }
        pendingImageURLs = []
        inputText = ""
        let isFirstMessage = messages.isEmpty

        // Append user message with image URLs
        let userMsg = ChatMessage(role: .user, content: text, imageURLs: imageURLStrings)
        store.appendMessage(userMsg, to: convId)

        // Append empty assistant placeholder
        let assistantMsg = ChatMessage(role: .assistant, content: "")
        store.appendMessage(assistantMsg, to: convId)
        let assistantID = assistantMsg.id

        isStreaming = true

        Task {
            let hasMCPTools = mcpClientManager?.hasTools == true
            let toolSpecs = hasMCPTools ? mcpClientManager?.toolSpecs : nil
            print("[ChatVM] 🚀 Start | hasMCPTools=\(hasMCPTools) | toolCount=\(mcpClientManager?.allTools.count ?? 0) | nativeTools=\(toolSpecs?.count ?? 0)")

            // Build the initial message history
            var history = buildHistory(hasMCPTools: hasMCPTools)

            // Convert image URLs to UserInput.Image for VLM inference
            let vlmImages: [UserInput.Image] = imageURLs.map { .url($0) }

            // Accumulates the final displayed text across all rounds
            var displayText = ""
            var toolCallRound = 0

            // Main inference loop: stream -> check for tool_call -> re-run if needed
            while toolCallRound < maxToolCallRounds {
                print("[ChatVM] 🔄 Round \(toolCallRound) | Starting LLM inference...")
                // Only pass images on the first round (they belong to the original user message)
                let roundImages = toolCallRound == 0 ? vlmImages : []
                let stream = llm.chat(messages: history, tools: toolSpecs, images: roundImages)

                var accumulated = ""
                var detectedToolCall: ToolCall?
                var tokenCount = 0
                streamingThinkingIndex = nil
                thinkBlockFinalized = false

                for await chunk in stream {
                    switch chunk {
                    case .text(let token):
                        accumulated += token
                        tokenCount += 1
                        // Update Inspector with real-time thinking
                        updateInspectorStreaming(accumulated: accumulated)
                        // Skip UI updates during thinking phase — content hasn't changed and
                        // updating every thinking token causes unnecessary SwiftUI re-renders.
                        if streamingThinkingIndex == nil {
                            let cleanedSoFar = removeThinkBlock(from: displayText + accumulated)
                                .trimmingCharacters(in: .whitespacesAndNewlines)
                            store.updateMessage(id: assistantID, in: convId, content: cleanedSoFar)
                        }
                    case .toolCall(let tc):
                        detectedToolCall = tc
                        print("[ChatVM] 🔧 Native tool call detected: \(tc.function.name)")
                    }
                }

                // Finalize any open thinking block
                streamingThinkingIndex = nil

                print("[ChatVM] ✅ Streaming done | tokens=\(tokenCount) | length=\(accumulated.count)")
                print("[ChatVM] 🔍 nativeToolCall=\(detectedToolCall != nil) | Contains <think>: \(accumulated.contains("<think>"))")

                // Handle native tool call
                if let toolCall = detectedToolCall {
                    toolCallRound += 1
                    let toolName = toolCall.function.name
                    print("[ChatVM] 🔧 Executing tool '\(toolName)' | round=\(toolCallRound)")

                    // Record tool call in Inspector as "calling"
                    let argsString = formatToolArguments(toolCall.function.arguments)
                    let inspectorIndex = inspectorItems.count
                    inspectorItems.append(InspectorItem(
                        timestamp: Date(),
                        content: .toolCall(name: toolName, arguments: argsString, status: .calling)
                    ))

                    currentToolCall = .calling(toolName: toolName)
                    let toolResult = await executeNativeToolCall(toolCall)

                    // Clean display: strip <think> blocks and tool call markers from accumulated text
                    let cleaned = removeThinkBlock(from: accumulated)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    displayText += cleaned.isEmpty ? "" : cleaned + "\n\n"
                    store.updateMessage(id: assistantID, in: convId, content: displayText)

                    // Build continuation messages for next round (strip think blocks to prevent repetition)
                    let cleanedForHistory = removeThinkBlock(from: accumulated)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    history.append(ChatMessage(role: .assistant, content: cleanedForHistory))

                    if let result = toolResult.result {
                        currentToolCall = .completed(toolName: toolName, result: String(result.prefix(200)))
                        // Update Inspector item status to completed
                        if inspectorIndex < inspectorItems.count {
                            inspectorItems[inspectorIndex].content = .toolCall(
                                name: toolName, arguments: argsString, status: .completed(result: String(result.prefix(500)))
                            )
                        }
                        print("[ChatVM] ✅ Tool success, result length=\(result.count)")
                        // Qwen3.5 template expects tool results wrapped in <tool_response> as a user message.
                        // Using system role mid-conversation triggers JinjaTemplateException.
                        history.append(ChatMessage(role: .user, content: "<tool_response>\n\(result)\n</tool_response>"))
                    } else {
                        let errMsg = toolResult.error ?? "Unknown error"
                        currentToolCall = .failed(toolName: toolName, error: errMsg)
                        // Update Inspector item status to failed
                        if inspectorIndex < inspectorItems.count {
                            inspectorItems[inspectorIndex].content = .toolCall(
                                name: toolName, arguments: argsString, status: .failed(error: errMsg)
                            )
                        }
                        print("[ChatVM] ❌ Tool failed: \(errMsg)")
                        history.append(ChatMessage(role: .user, content: "<tool_response>\nError: \(errMsg)\n</tool_response>"))
                    }

                    print("[ChatVM] 🔄 Continuing to next round...")
                    continue
                }

                // No tool call — final answer (thinking already captured above)
                print("[ChatVM] 💬 No tool call detected, finalizing response")
                displayText += accumulated
                break
            }

            // Finalize: strip <think> blocks for clean display
            let finalContent = removeThinkBlock(from: displayText)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            store.updateMessage(id: assistantID, in: convId, content: finalContent)
            print("[ChatVM] 🏁 Done | final length=\(finalContent.count)")

            // Remove placeholder if empty (generation failed)
            if finalContent.isEmpty {
                store.removeMessage(id: assistantID, from: convId)
                if let error = llm.error {
                    let errMsg = ChatMessage(role: .system, content: "Error: \(error)")
                    store.appendMessage(errMsg, to: convId)
                }
            }

            // Persist inspector items alongside the conversation
            store.updateInspectorItems(inspectorItems, for: convId)
            store.saveConversation(id: convId)
            currentToolCall = nil

            // Generate title before releasing isStreaming so the LLM is not
            // claimed by a new user message while title generation is running.
            if isFirstMessage {
                let titleBasis = text.isEmpty ? "Image conversation" : text
                await generateTitle(for: convId, basedOn: titleBasis)
            }
            isStreaming = false
        }
    }

    // MARK: - Image Attachment

    /// Open a file picker to select images
    func pickImages() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.image]
        panel.message = "Select images to attach"

        guard panel.runModal() == .OK else { return }
        pendingImageURLs.append(contentsOf: panel.urls)
    }

    /// Remove a pending image at the given index
    func removePendingImage(at index: Int) {
        guard pendingImageURLs.indices.contains(index) else { return }
        pendingImageURLs.remove(at: index)
    }

    // MARK: - Build History

    /// Build the chat history array for the LLM, optionally prepending tool behavior instructions.
    private func buildHistory(hasMCPTools: Bool) -> [ChatMessage] {
        var history = messages
            .filter { $0.role != .system }
            .dropLast() // Exclude the empty assistant placeholder
            .map { $0 }

        // Prepend behavioral system prompt if tools are available
        // (tool definitions are passed via native UserInput.tools, not in the prompt)
        if hasMCPTools,
           let behaviorPrompt = mcpClientManager?.toolBehaviorPrompt,
           !behaviorPrompt.isEmpty {
            history.insert(ChatMessage(role: .system, content: behaviorPrompt), at: 0)
        }

        return Array(history)
    }

    // MARK: - Tool Call Execution

    /// Execute a native MLX ToolCall via MCPClientManager
    private func executeNativeToolCall(_ toolCall: ToolCall) async -> (result: String?, error: String?) {
        guard let mcpClient = mcpClientManager else {
            return (nil, "MCP client manager not available")
        }

        do {
            let result = try await mcpClient.callToolFromNative(
                name: toolCall.function.name,
                arguments: toolCall.function.arguments
            )
            return (result, nil)
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    // MARK: - Text Cleanup

    /// Remove all <think>...</think> blocks from text for clean display
    private func removeThinkBlock(from text: String) -> String {
        var result = text
        // Remove complete <think>...</think> blocks
        while let start = result.range(of: "<think>") {
            if let end = result.range(of: "</think>") {
                result.removeSubrange(start.lowerBound..<end.upperBound)
            } else {
                result.removeSubrange(start.lowerBound..<result.endIndex)
            }
        }
        // Handle orphaned </think>: Qwen3.5 puts <think> in generation prompt (not in stream),
        // so the stream starts with thinking content and ends with </think>.
        // Everything before </think> is thinking — strip it.
        if let end = result.range(of: "</think>") {
            result.removeSubrange(result.startIndex..<end.upperBound)
        }
        return result
    }

    // MARK: - Stop Generation

    func stopGeneration() {
        llmService?.stopGeneration()
        isStreaming = false
        currentToolCall = nil

        // Persist inspector items so they survive conversation switches
        if let convId = conversationId, let store = chatStore {
            store.updateInspectorItems(inspectorItems, for: convId)
            store.saveConversation(id: convId)
        }
    }

    // MARK: - Reset on Conversation Switch

    func resetForNewConversation() {
        isStreaming = false
        inputText = ""
        pendingImageURLs = []
        currentToolCall = nil
        streamingThinkingIndex = nil
        thinkBlockFinalized = false

        // Load persisted inspector items for the selected conversation
        inspectorItems = chatStore?.currentConversation?.inspectorItems ?? []
    }

    // MARK: - Inspector Helpers

    /// Update Inspector in real-time during streaming to show thinking content as it arrives.
    /// Called after each token; detects open/closed <think> blocks in the accumulated text.
    private func updateInspectorStreaming(accumulated: String) {
        if thinkBlockFinalized { return }

        if accumulated.contains("<think>") {
            // Standard mode: <think> is in the stream (old models)
            guard let thinkStart = accumulated.range(of: "<think>") else { return }
            let afterThink = accumulated[thinkStart.upperBound...]
            if let thinkEnd = afterThink.range(of: "</think>") {
                let content = String(afterThink[..<thinkEnd.lowerBound])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if let index = streamingThinkingIndex, index < inspectorItems.count {
                    inspectorItems[index].content = .thinking(content.isEmpty ? "…" : content)
                }
                streamingThinkingIndex = nil
                thinkBlockFinalized = true
            } else {
                let content = String(afterThink).trimmingCharacters(in: .whitespacesAndNewlines)
                if let index = streamingThinkingIndex, index < inspectorItems.count {
                    inspectorItems[index].content = .thinking(content.isEmpty ? "…" : content)
                } else {
                    streamingThinkingIndex = inspectorItems.count
                    inspectorItems.append(InspectorItem(
                        timestamp: Date(),
                        content: .thinking(content.isEmpty ? "…" : content)
                    ))
                }
            }
        } else if let closeRange = accumulated.range(of: "</think>") {
            // Qwen3.5 mode: <think> was in generation prompt, stream starts with thinking content
            let content = String(accumulated[..<closeRange.lowerBound])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if let index = streamingThinkingIndex, index < inspectorItems.count {
                inspectorItems[index].content = .thinking(content.isEmpty ? "…" : content)
            } else {
                inspectorItems.append(InspectorItem(
                    timestamp: Date(),
                    content: .thinking(content.isEmpty ? "…" : content)
                ))
            }
            streamingThinkingIndex = nil
            thinkBlockFinalized = true
        } else {
            // Qwen3.5 mode: still streaming thinking content (no </think> yet)
            let content = accumulated.trimmingCharacters(in: .whitespacesAndNewlines)
            if let index = streamingThinkingIndex, index < inspectorItems.count {
                inspectorItems[index].content = .thinking(content.isEmpty ? "…" : content)
            } else if !accumulated.isEmpty {
                streamingThinkingIndex = inspectorItems.count
                inspectorItems.append(InspectorItem(
                    timestamp: Date(),
                    content: .thinking(content.isEmpty ? "…" : content)
                ))
            }
        }
    }

    /// Format tool call arguments dictionary into a readable string
    private func formatToolArguments(_ arguments: [String: MLXLMCommon.JSONValue]) -> String {
        // Convert JSONValue to native types for JSONSerialization
        let native = arguments.mapValues { jsonValueToNative($0) }
        guard let data = try? JSONSerialization.data(withJSONObject: native, options: [.prettyPrinted, .sortedKeys]),
              let str = String(data: data, encoding: .utf8) else {
            return String(describing: arguments)
        }
        return str
    }

    /// Convert MLXLMCommon.JSONValue to Foundation-compatible type for serialization
    private func jsonValueToNative(_ val: MLXLMCommon.JSONValue) -> Any {
        switch val {
        case .null: return NSNull()
        case .bool(let b): return b
        case .int(let i): return i
        case .double(let d): return d
        case .string(let s): return s
        case .array(let arr): return arr.map { jsonValueToNative($0) }
        case .object(let obj): return obj.mapValues { jsonValueToNative($0) }
        }
    }

    // MARK: - AI Title Generation

    private func generateTitle(for conversationId: UUID, basedOn userMessage: String) async {
        guard let store = chatStore,
              let llm = llmService else { return }

        // Only generate if title is still default
        guard let conv = store.conversations.first(where: { $0.id == conversationId }),
              conv.hasDefaultTitle else { return }

        guard llm.state.isReady else {
            store.updateTitle(String(userMessage.prefix(20)), for: conversationId)
            return
        }

        let prompt = "Generate a very short title (max 5 words) for this chat message. Use the SAME language as the message. Reply with ONLY the title, nothing else. No thinking, no quotes, no explanation.\n\nMessage: \(userMessage)"
        let stream = llm.chat(messages: [ChatMessage(role: .user, content: prompt)])

        var raw = ""
        for await chunk in stream {
            if case .text(let token) = chunk {
                raw += token
            }
        }

        // Strip <think>...</think> blocks
        var title = removeThinkBlock(from: raw)

        // Clean up
        title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if (title.hasPrefix("\"") && title.hasSuffix("\"")) ||
           (title.hasPrefix("'") && title.hasSuffix("'")) {
            title = String(title.dropFirst().dropLast())
        }
        if let firstLine = title.components(separatedBy: .newlines).first(where: { !$0.isEmpty }) {
            title = firstLine.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if title.isEmpty {
            title = String(userMessage.prefix(20))
        } else if title.count > 40 {
            title = String(title.prefix(40))
        }

        store.updateTitle(title, for: conversationId)
    }
}
