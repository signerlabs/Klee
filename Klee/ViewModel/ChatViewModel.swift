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

        Task {
            // Build message history with system prompt
            let history = buildHistory()

            // Convert image URLs to UserInput.Image for VLM inference
            let vlmImages: [UserInput.Image] = imageURLs.map { .url($0) }

            // Single-round LLM streaming inference (no tool calling)
            let stream = llmService.chat(messages: history, images: vlmImages)

            var accumulated = ""
            streamingThinkingIndex = nil
            thinkBlockFinalized = false

            for await chunk in stream {
                if case .text(let token) = chunk {
                    accumulated += token
                    // Update Inspector with real-time thinking
                    updateInspectorStreaming(accumulated: accumulated)
                    // Skip UI updates during thinking phase — content hasn't changed and
                    // updating every thinking token causes unnecessary SwiftUI re-renders.
                    if streamingThinkingIndex == nil {
                        let cleanedSoFar = removeThinkBlock(from: accumulated)
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                        chatStore.updateMessage(id: assistantID, in: convId, content: cleanedSoFar)
                    }
                }
            }

            // Finalize any open thinking block
            streamingThinkingIndex = nil

            // Strip <think> blocks for clean display
            let finalContent = removeThinkBlock(from: accumulated)
                .trimmingCharacters(in: .whitespacesAndNewlines)
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

    /// Build the chat history array for the LLM, prepending system prompt with module skills.
    private func buildHistory() -> [ChatMessage] {
        var history = messages
            .filter { $0.role != .system }
            .dropLast() // Exclude the empty assistant placeholder
            .map { $0 }

        // Build system prompt: built-in capabilities + active module skills
        var systemParts: [String] = [
            "You are Klee, a local AI assistant running on macOS.",
            "You can read and write local files (Desktop, Documents, Downloads, etc.) and fetch web page content."
        ]

        let moduleSkills = moduleManager.combinedSkillPrompt
        if !moduleSkills.isEmpty {
            systemParts.append(moduleSkills)
        }

        let systemPrompt = systemParts.joined(separator: "\n")
        history.insert(ChatMessage(role: .system, content: systemPrompt), at: 0)

        return Array(history)
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
