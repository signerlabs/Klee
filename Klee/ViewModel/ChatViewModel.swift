//
//  ChatViewModel.swift
//  Klee
//
//  Business logic for the chat interface.
//  Handles message sending, streaming, and AI title generation.
//  ChatView owns an instance and delegates all non-UI logic here.
//

import Foundation
import Observation

@Observable
@MainActor
class ChatViewModel {

    // MARK: - Observable State

    var inputText: String = ""
    var isStreaming: Bool = false

    // MARK: - Dependencies (injected after init)

    var llmService: LLMService?
    var chatStore: ChatStore?

    // MARK: - Computed Helpers

    var hasText: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
        guard !text.isEmpty,
              !isStreaming,
              llmService?.state == .ready,
              let convId = conversationId,
              let llm = llmService,
              let store = chatStore else { return }

        inputText = ""
        let isFirstMessage = messages.isEmpty

        // Append user message
        let userMsg = ChatMessage(role: .user, content: text)
        store.appendMessage(userMsg, to: convId)

        // Append empty assistant placeholder
        let assistantMsg = ChatMessage(role: .assistant, content: "")
        store.appendMessage(assistantMsg, to: convId)
        let assistantID = assistantMsg.id

        isStreaming = true

        Task {
            // Build history excluding the empty placeholder
            let history = messages
                .filter { $0.role != .system }
                .dropLast()
                .map { $0 }

            let stream = llm.chat(messages: Array(history))

            var accumulated = ""
            for await token in stream {
                accumulated += token
                store.updateMessage(id: assistantID, in: convId, content: accumulated)
            }

            // Trim and finalize
            let trimmed = accumulated.trimmingCharacters(in: .whitespacesAndNewlines)
            store.updateMessage(id: assistantID, in: convId, content: trimmed)

            // Remove placeholder if empty (generation failed)
            if trimmed.isEmpty {
                store.removeMessage(id: assistantID, from: convId)
                if let error = llm.error {
                    let errMsg = ChatMessage(role: .system, content: "Error: \(error)")
                    store.appendMessage(errMsg, to: convId)
                }
            }

            store.saveConversation(id: convId)
            isStreaming = false

            // Generate title after streaming (LLM is now free)
            if isFirstMessage {
                await generateTitle(for: convId, basedOn: text)
            }
        }
    }

    // MARK: - Stop Generation

    func stopGeneration() {
        llmService?.stopGeneration()
        isStreaming = false
    }

    // MARK: - Reset on Conversation Switch

    func resetForNewConversation() {
        isStreaming = false
        inputText = ""
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
        for await token in stream {
            raw += token
        }

        // Strip <think>...</think> blocks
        var title = raw
        while let start = title.range(of: "<think>") {
            if let end = title.range(of: "</think>") {
                title.removeSubrange(start.lowerBound..<end.upperBound)
            } else {
                title.removeSubrange(start.lowerBound..<title.endIndex)
            }
        }

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
