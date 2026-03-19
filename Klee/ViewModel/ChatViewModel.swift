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

            // Action loop: stream LLM output, detect <action> tags, execute, re-run.
            // Capped at maxActionRounds to prevent infinite loops.
            let maxActionRounds = 5
            var actionRound = 0

            while actionRound < maxActionRounds {
                // Reset per-round thinking state
                streamingThinkingIndex = nil
                thinkBlockFinalized = false

                print("[ChatVM] ===== Round \(actionRound) START (history: \(history.count)) =====")
                let stream = llmService.chat(messages: history, images: roundImages)
                var accumulated = ""

                for await chunk in stream {
                    if case .text(let token) = chunk {
                        accumulated += token
                        // Update Inspector with real-time thinking
                        updateInspectorStreaming(accumulated: accumulated)
                        // Only update thinking block during streaming.
                        // Message content is set once at the end of the loop.
                    }
                }

                // Finalize any open thinking block for this round
                streamingThinkingIndex = nil

                // Clean up the accumulated text (remove think blocks)
                let cleanedAccumulated = removeThinkBlock(from: accumulated)
                    .trimmingCharacters(in: .whitespacesAndNewlines)

                print("[ChatVM] Round \(actionRound) LLM done | length: \(accumulated.count) | hasAction: \(cleanedAccumulated.contains("<action>"))")

                // Check for <action> tag in the cleaned output
                if let parsed = IntentRouter.parseAction(from: cleanedAccumulated) {
                    actionRound += 1
                    print("[ChatVM] ACTION DETECTED: \(parsed.action.type) | round \(actionRound)")

                    // Append any text before the action tag to the display
                    let preText = parsed.preText.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !preText.isEmpty {
                        displayText += preText + "\n\n"
                    }

                    // Record the action in Inspector for visibility
                    inspectorItems.append(InspectorItem(
                        timestamp: Date(),
                        content: .toolCall(
                            name: parsed.action.type,
                            arguments: actionArgumentsSummary(parsed.action),
                            status: .calling
                        )
                    ))
                    let actionItemIndex = inspectorItems.count - 1

                    // Execute the action
                    let result = await IntentRouter.execute(parsed.action)
                    print("[ChatVM] Action \(parsed.action.type) \(result.success ? "OK" : "FAIL"): \(result.output.prefix(120))")

                    // Update Inspector with result
                    if actionItemIndex < inspectorItems.count {
                        if result.success {
                            inspectorItems[actionItemIndex].content = .toolCall(
                                name: parsed.action.type,
                                arguments: actionArgumentsSummary(parsed.action),
                                status: .completed(result: String(result.output.prefix(200)))
                            )
                        } else {
                            inspectorItems[actionItemIndex].content = .toolCall(
                                name: parsed.action.type,
                                arguments: actionArgumentsSummary(parsed.action),
                                status: .failed(error: result.output)
                            )
                        }
                    }
                    // Inject action result into history for the next LLM round.
                    // The full accumulated output (including the action tag) is the assistant's response,
                    // and the action result is injected as a user message.
                    history.append(ChatMessage(role: .assistant, content: accumulated))
                    let actionResultMsg = "<action_result>\n\(result.output)\n</action_result>"
                    history.append(ChatMessage(role: .user, content: actionResultMsg))
                    print("[ChatVM] Injected action_result into history | history count now: \(history.count)")

                    // No images on continuation rounds
                    roundImages = []

                    // If we've hit the action round limit, stop looping.
                    // Append a notice so the user knows why the AI stopped.
                    if actionRound >= maxActionRounds {
                        displayText += "\n\n*(Reached maximum action rounds — stopping.)*"
                        break
                    }
                    continue
                }

                // No action found — this is the final answer.
                let finalRoundText = removeActionBlock(from: cleanedAccumulated)
                displayText += finalRoundText
                print("[ChatVM] ===== FINAL ANSWER | round \(actionRound) =====")
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

    /// Build the chat history array for the LLM, prepending system prompt with action instructions
    /// and module skills.
    private func buildHistory() -> [ChatMessage] {
        var history = messages
            .filter { $0.role != .system }
            .dropLast() // Exclude the empty assistant placeholder
            .map { $0 }

        let homeDir = FileManager.default.homeDirectoryForCurrentUser.path

        // Build system prompt: action instructions + module skills
        var systemParts: [String] = [
            """
            You are Klee, a local AI assistant running on macOS.

            You can perform actions on the user's computer by outputting action tags. When the user asks you to do something (create a file, read a file, fetch a webpage, etc.), output the action in the following format:

            <action>
            {"type": "action_type", ...parameters}
            </action>

            Available actions:
            - file_write: Create or overwrite a file. Parameters: path (string), content (string)
            - file_read: Read a file's contents. Parameters: path (string)
            - file_list: List files in a directory. Parameters: path (string)
            - file_delete: Delete a file. Parameters: path (string)
            - web_fetch: Fetch a webpage's text content. Parameters: url (string)
            - shell_exec: Execute a shell command. Parameters: command (string)

            Path notes:
            - Use absolute paths. ~ expands to the user's home directory.
            - The user's home directory is: \(homeDir)

            After outputting an action, wait for the result. The system will execute it and provide the output inside <action_result> tags. Then continue your response to the user based on the result.

            Important rules:
            - Only output ONE action at a time. Wait for the result before outputting the next action.
            - Do not fabricate action results. Wait for the actual execution result.
            - For simple questions that don't require system interaction, just respond normally without any action tags.
            """
        ]

        let moduleSkills = moduleManager.combinedSkillPrompt
        if !moduleSkills.isEmpty {
            systemParts.append(moduleSkills)
        }

        let systemPrompt = systemParts.joined(separator: "\n\n")
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

    /// Remove all <action>...</action> blocks from text for clean display.
    /// Also removes incomplete action tags (opening <action> without closing).
    private func removeActionBlock(from text: String) -> String {
        var result = text
        // Remove <action>...</action> blocks
        while let start = result.range(of: "<action>") {
            if let end = result.range(of: "</action>") {
                result.removeSubrange(start.lowerBound..<end.upperBound)
            } else {
                result.removeSubrange(start.lowerBound..<result.endIndex)
            }
        }
        // Remove <action_result>...</action_result> blocks
        while let start = result.range(of: "<action_result>") {
            if let end = result.range(of: "</action_result>") {
                result.removeSubrange(start.lowerBound..<end.upperBound)
            } else {
                result.removeSubrange(start.lowerBound..<result.endIndex)
            }
        }
        return result
    }

    /// Build a short summary of action arguments for Inspector display
    private func actionArgumentsSummary(_ action: KleeAction) -> String {
        var parts: [String] = []
        if let path = action.path { parts.append("path: \(path)") }
        if let url = action.url { parts.append("url: \(url)") }
        if let command = action.command {
            let short = command.count > 60 ? String(command.prefix(60)) + "..." : command
            parts.append("command: \(short)")
        }
        if action.content != nil { parts.append("content: (provided)") }
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
