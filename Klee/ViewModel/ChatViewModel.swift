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

@Observable
@MainActor
class ChatViewModel {

    // MARK: - Observable State

    var inputText: String = ""
    var isStreaming: Bool = false

    /// Pending image attachments (file URLs) for the next message
    var pendingImageURLs: [URL] = []

    /// All thinking events for the current conversation, shown in Inspector
    var inspectorItems: [InspectorItem] = []

    // MARK: - Private Streaming State

    /// Index of the currently streaming thinking item in inspectorItems (nil when not inside a <think> block)
    private var streamingThinkingIndex: Int?

    /// Whether the current round's think block has been finalized (prevents duplicate processing)
    private var thinkBlockFinalized = false

    // MARK: - Dependencies (injected via init)

    private let llmService: LLMService
    private let chatStore: ChatStore
    private let moduleManager: ModuleManager

    // MARK: - Init

    init(llmService: LLMService, chatStore: ChatStore, moduleManager: ModuleManager) {
        self.llmService = llmService
        self.chatStore = chatStore
        self.moduleManager = moduleManager
    }

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
        guard let modelId = llmService.currentModelId else { return false }
        return ModelInfo.recommended.first(where: { $0.id == modelId })?.supportsVision ?? false
    }

    var messages: [ChatMessage] {
        chatStore.currentConversation?.messages ?? []
    }

    var conversationId: UUID? {
        chatStore.selectedConversationId
    }

    /// Current thinking content for inline display (most recent thinking block)
    var currentThinkingContent: String? {
        for item in inspectorItems.reversed() {
            if case .thinking(let content) = item.content {
                return content
            }
        }
        return nil
    }

    // MARK: - Tool Specifications

    /// Assemble active tool specs based on enabled modules.
    /// Built-in tools (file, shell) are always included.
    /// Module tools (web_search, etc.) only when the module is ready.
    private var toolSpecs: [[String: any Sendable]] {
        var specs = ToolDefinitions.builtIn
        if moduleManager.modules.first(where: { $0.id == "web_search" })?.isReady == true {
            specs += ToolDefinitions.webSearch
        }
        return specs
    }

    // MARK: - Send Message

    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard hasContent,
              !isStreaming,
              llmService.state == .ready,
              let convId = conversationId else { return }

        // Capture and clear pending images
        let imageURLs = pendingImageURLs
        let imageURLStrings = imageURLs.map { $0.absoluteString }
        pendingImageURLs = []
        inputText = ""
        let isFirstMessage = messages.isEmpty

        // Append user message with image URLs
        let userMsg = ChatMessage(role: .user, content: text, imageURLs: imageURLStrings)
        chatStore.appendMessage(userMsg, to: convId)

        // Append empty assistant placeholder
        let assistantMsg = ChatMessage(role: .assistant, content: "")
        chatStore.appendMessage(assistantMsg, to: convId)
        let assistantID = assistantMsg.id

        isStreaming = true
        // Clear previous thinking state so new generation starts fresh
        inspectorItems = []
        streamingThinkingIndex = nil
        thinkBlockFinalized = false

        Task {
            // Build initial message history with system prompt
            var history = buildHistory()

            // Images are only attached on the first round (user's original message)
            var roundImages: [UserInput.Image] = imageURLs.map { .url($0) }

            // Accumulated display text for the assistant bubble (across all rounds)
            var displayText = ""

            // Tool calling loop: stream LLM output, detect native ToolCall, execute, re-run.
            // Capped at maxToolRounds to prevent infinite loops.
            let maxToolRounds = 5
            var toolRound = 0

            while toolRound < maxToolRounds {
                // Reset per-round thinking state
                streamingThinkingIndex = nil
                thinkBlockFinalized = false

                print("[ChatVM] ===== Round \(toolRound) START (history: \(history.count)) =====")
                let stream = llmService.chat(messages: history, tools: toolSpecs, images: roundImages)
                var accumulated = ""
                var detectedToolCall: ToolCall?

                for await chunk in stream {
                    switch chunk {
                    case .text(let token):
                        accumulated += token
                        // Update Inspector with real-time thinking
                        updateInspectorStreaming(accumulated: accumulated)
                    case .toolCall(let tc):
                        detectedToolCall = tc
                        print("[ChatVM] Native tool call: \(tc.function.name)")
                    }
                }

                // Finalize any open thinking block for this round
                streamingThinkingIndex = nil

                // Clean up the accumulated text (remove think blocks for display)
                let cleanedAccumulated = removeThinkBlock(from: accumulated)
                    .trimmingCharacters(in: .whitespacesAndNewlines)

                print("[ChatVM] Round \(toolRound) LLM done | length: \(accumulated.count) | hasToolCall: \(detectedToolCall != nil)")

                // Check for native tool call
                if let toolCall = detectedToolCall {
                    toolRound += 1
                    print("[ChatVM] TOOL CALL: \(toolCall.function.name) | round \(toolRound)")

                    // Append any text before the tool call to the display
                    if !cleanedAccumulated.isEmpty {
                        displayText += cleanedAccumulated + "\n\n"
                    }

                    // Convert MLXLMCommon.JSONValue arguments to [String: Any]
                    let args = convertToolCallArguments(toolCall.function.arguments)

                    // Build arguments summary for Inspector display
                    let argsSummary = toolCallArgumentsSummary(name: toolCall.function.name, arguments: args)

                    // Record the tool call in Inspector for visibility
                    inspectorItems.append(InspectorItem(
                        timestamp: Date(),
                        content: .toolCall(
                            name: toolCall.function.name,
                            arguments: argsSummary,
                            status: .calling
                        )
                    ))
                    let toolItemIndex = inspectorItems.count - 1

                    // Collect API keys from enabled modules
                    var apiKeys: [String: String] = [:]
                    for module in moduleManager.modules where module.isReady {
                        if let key = module.apiKey { apiKeys[module.id] = key }
                    }
                    let result = await IntentRouter.execute(name: toolCall.function.name, arguments: args, apiKeys: apiKeys)
                    print("[ChatVM] Tool \(toolCall.function.name) \(result.success ? "OK" : "FAIL"): \(result.output.prefix(120))")

                    // Update Inspector with result
                    if toolItemIndex < inspectorItems.count {
                        if result.success {
                            inspectorItems[toolItemIndex].content = .toolCall(
                                name: toolCall.function.name,
                                arguments: argsSummary,
                                status: .completed(result: String(result.output.prefix(200)))
                            )
                        } else {
                            inspectorItems[toolItemIndex].content = .toolCall(
                                name: toolCall.function.name,
                                arguments: argsSummary,
                                status: .failed(error: result.output)
                            )
                        }
                    }

                    // Inject tool result into history for the next LLM round.
                    // The full accumulated output is the assistant's response,
                    // and the tool result is injected as a user message.
                    let cleanedAssistant = removeThinkBlock(from: accumulated)
                    history.append(ChatMessage(role: .assistant, content: cleanedAssistant))
                    history.append(ChatMessage(role: .user, content: "<tool_response>\n\(result.output)\n</tool_response>"))
                    print("[ChatVM] Injected tool_response into history | history count now: \(history.count)")

                    // No images on continuation rounds
                    roundImages = []

                    // If we've hit the tool round limit, stop looping.
                    if toolRound >= maxToolRounds {
                        displayText += "\n\n*(Reached maximum tool rounds -- stopping.)*"
                        break
                    }
                    continue
                }

                // No tool call found — this is the final answer.
                displayText += cleanedAccumulated
                print("[ChatVM] ===== FINAL ANSWER | round \(toolRound) =====")
                break
            }

            // Update the assistant message with the final accumulated display text
            let finalContent = displayText.trimmingCharacters(in: .whitespacesAndNewlines)
            chatStore.updateMessage(id: assistantID, in: convId, content: finalContent)

            // Remove placeholder if empty (generation failed)
            if finalContent.isEmpty {
                chatStore.removeMessage(id: assistantID, from: convId)
                if let error = llmService.error {
                    let errMsg = ChatMessage(role: .system, content: "Error: \(error)")
                    chatStore.appendMessage(errMsg, to: convId)
                }
            }

            // Persist inspector items alongside the conversation
            chatStore.updateInspectorItems(inspectorItems, for: convId)
            chatStore.saveConversation(id: convId)

            isStreaming = false

            // Use user's first message as conversation title (truncated to 30 chars)
            if isFirstMessage {
                let title = text.isEmpty ? "Image conversation" : String(text.prefix(30))
                chatStore.updateTitle(title, for: convId)
            }
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

    /// Build the chat history array for the LLM, prepending a minimal system prompt.
    /// Tool definitions are passed natively via toolSpecs (not in the prompt),
    /// saving ~500 tokens compared to the text-based <action> approach.
    private func buildHistory() -> [ChatMessage] {
        var history = messages
            .filter { $0.role != .system }
            .dropLast() // Exclude the empty assistant placeholder
            .map { $0 }

        let homeDir = FileManager.default.homeDirectoryForCurrentUser.path

        // Build system prompt: role description + capability notes.
        // Tool definitions are NOT listed here — they're passed via native tool spec.
        var systemParts: [String] = [
            "You are Klee, a local AI assistant running on macOS.",
            "You have access to tools for file operations, web browsing, and shell commands.",
            "The user's home directory is: \(homeDir)",
            "Use absolute paths. ~ expands to the home directory.",
            "For dangerous operations (file deletion, shell commands), confirm with the user first.",
        ]

        let moduleSkills = moduleManager.combinedSkillPrompt
        if !moduleSkills.isEmpty {
            systemParts.append(moduleSkills)
        }

        let systemPrompt = systemParts.joined(separator: "\n")
        history.insert(ChatMessage(role: .system, content: systemPrompt), at: 0)

        return Array(history)
    }

    // MARK: - Tool Call Argument Conversion

    /// Convert MLXLMCommon [String: JSONValue] arguments to a plain [String: Any] dictionary.
    /// ToolCall.Function.arguments is [String: JSONValue]; IntentRouter expects [String: Any].
    private func convertToolCallArguments(_ arguments: [String: JSONValue]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in arguments {
            result[key] = convertJSONValue(value)
        }
        return result
    }

    /// Recursively convert a single JSONValue to a Swift Any value.
    /// JSONValue cases: .null, .bool, .int, .double, .string, .array, .object
    private func convertJSONValue(_ value: JSONValue) -> Any {
        switch value {
        case .string(let s):
            return s
        case .int(let i):
            return i
        case .double(let d):
            return d
        case .bool(let b):
            return b
        case .null:
            return NSNull()
        case .array(let arr):
            return arr.map { convertJSONValue($0) }
        case .object(let dict):
            var result: [String: Any] = [:]
            for (key, val) in dict {
                result[key] = convertJSONValue(val)
            }
            return result
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

    /// Build a short summary of tool call arguments for Inspector display
    private func toolCallArgumentsSummary(name: String, arguments: [String: Any]) -> String {
        var parts: [String] = []
        if let path = arguments["path"] as? String { parts.append("path: \(path)") }
        if let url = arguments["url"] as? String { parts.append("url: \(url)") }
        if let query = arguments["query"] as? String { parts.append("query: \(query)") }
        if let command = arguments["command"] as? String {
            let short = command.count > 60 ? String(command.prefix(60)) + "..." : command
            parts.append("command: \(short)")
        }
        if arguments["content"] != nil { parts.append("content: (provided)") }
        return parts.joined(separator: ", ")
    }

    // MARK: - Stop Generation

    func stopGeneration() {
        llmService.stopGeneration()
        isStreaming = false

        // Persist inspector items so they survive conversation switches
        if let convId = conversationId {
            chatStore.updateInspectorItems(inspectorItems, for: convId)
            chatStore.saveConversation(id: convId)
        }
    }

    // MARK: - Reset on Conversation Switch

    func resetForNewConversation() {
        isStreaming = false
        inputText = ""
        pendingImageURLs = []
        streamingThinkingIndex = nil
        thinkBlockFinalized = false

        // Load persisted inspector items for the selected conversation
        inspectorItems = chatStore.currentConversation?.inspectorItems ?? []
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

}
