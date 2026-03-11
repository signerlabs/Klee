//
//  ChatViewModel.swift
//  Klee
//
//  Business logic for the chat interface.
//  Handles message sending, streaming, and AI title generation.
//  ChatView owns an instance and delegates all non-UI logic here.
//

import Foundation
import MCP
import Observation

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

    /// Current active tool call (nil when no tool is being invoked)
    var currentToolCall: ToolCallState?

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
            // Determine if we have MCP tools available
            let hasMCPTools = mcpClientManager?.hasTools == true
            print("[ChatVM] 🚀 Start | hasMCPTools=\(hasMCPTools) | toolCount=\(mcpClientManager?.allTools.count ?? 0)")

            // Build the initial message history (excluding the empty placeholder)
            var history = buildHistory(hasMCPTools: hasMCPTools)
            print("[ChatVM] 📋 History: \(history.count) messages | systemPrompt length=\(history.first(where: { $0.role == .system })?.content.count ?? 0)")
            // Debug: print each message role and content preview
            for (i, msg) in history.enumerated() {
                let preview = String(msg.content.prefix(200))
                print("[ChatVM] 📋 msg[\(i)] role=\(msg.role.rawValue) | length=\(msg.content.count) | preview: \(preview)")
            }

            // Accumulates the final displayed text across all rounds
            var displayText = ""
            var toolCallRound = 0

            // Main inference loop: stream -> check for tool_call -> re-run if needed
            while toolCallRound < maxToolCallRounds {
                print("[ChatVM] 🔄 Round \(toolCallRound) | Starting LLM inference...")
                let stream = llm.chat(messages: history)

                var accumulated = ""
                var tokenCount = 0
                for await token in stream {
                    accumulated += token
                    tokenCount += 1
                    // Show the raw streaming output (including tool_call tags) in real time
                    store.updateMessage(id: assistantID, in: convId, content: displayText + accumulated)
                }
                print("[ChatVM] ✅ Streaming done | tokens=\(tokenCount) | length=\(accumulated.count)")
                print("[ChatVM] 📝 Raw output START >>>")
                // Print full output in chunks to avoid console truncation
                let rawOutput = accumulated
                let chunkSize = 500
                var offset = rawOutput.startIndex
                while offset < rawOutput.endIndex {
                    let end = rawOutput.index(offset, offsetBy: chunkSize, limitedBy: rawOutput.endIndex) ?? rawOutput.endIndex
                    print(String(rawOutput[offset..<end]))
                    offset = end
                }
                print("<<< Raw output END")
                print("[ChatVM] 🔍 Contains ```tool: \(accumulated.contains("```tool")) | Contains <tool_call>: \(accumulated.contains("<tool_call>")) | Contains <think>: \(accumulated.contains("<think>"))")

                // Check for a tool call in this round's output
                if hasMCPTools, let toolCall = parseToolCall(from: accumulated) {
                    toolCallRound += 1
                    print("[ChatVM] 🔧 Tool call detected! name=\(toolCall.name) | round=\(toolCallRound)")

                    // Execute the tool
                    currentToolCall = .calling(toolName: toolCall.name)
                    print("[ChatVM] ⏳ Executing tool '\(toolCall.name)'...")
                    let toolResult = await executeToolCall(toolCall)
                    print("[ChatVM] 🔧 Tool result: success=\(toolResult.result != nil) | error=\(toolResult.error ?? "none")")

                    // Clean tool_call tags from displayed text
                    let cleaned = removeToolCallBlock(from: accumulated)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    displayText += cleaned.isEmpty ? "" : cleaned + "\n\n"
                    store.updateMessage(id: assistantID, in: convId, content: displayText)

                    // Build continuation messages for the next inference round
                    history.append(ChatMessage(role: .assistant, content: accumulated))

                    if let result = toolResult.result {
                        currentToolCall = .completed(
                            toolName: toolCall.name,
                            result: String(result.prefix(200))
                        )
                        print("[ChatVM] ✅ Tool success, result length=\(result.count)")
                        history.append(ChatMessage(role: .system, content: """
                            Tool '\(toolCall.name)' returned:
                            \(result)

                            Continue your response to the user based on this tool result.
                            """))
                    } else {
                        let errMsg = toolResult.error ?? "Unknown error"
                        currentToolCall = .failed(toolName: toolCall.name, error: errMsg)
                        print("[ChatVM] ❌ Tool failed: \(errMsg)")
                        history.append(ChatMessage(role: .system, content: """
                            Tool '\(toolCall.name)' failed: \(errMsg)
                            Inform the user and continue without the tool.
                            """))
                    }

                    // Continue loop for next inference round
                    print("[ChatVM] 🔄 Continuing to next round...")
                    continue
                }

                // No tool call — final answer
                print("[ChatVM] 💬 No tool call detected, finalizing response")
                displayText += accumulated
                break
            }

            // Finalize: strip both <tool_call> and <think> blocks for clean display
            let finalContent = removeThinkBlock(from: removeToolCallBlock(from: displayText))
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

            store.saveConversation(id: convId)
            isStreaming = false
            currentToolCall = nil

            // Generate title after streaming (LLM is now free)
            if isFirstMessage {
                await generateTitle(for: convId, basedOn: text)
            }
        }
    }

    // MARK: - Build History

    /// Build the chat history array for the LLM, optionally prepending MCP tool instructions.
    private func buildHistory(hasMCPTools: Bool) -> [ChatMessage] {
        var history = messages
            .filter { $0.role != .system }
            .dropLast() // Exclude the empty assistant placeholder
            .map { $0 }

        // Prepend tool system prompt if tools are available
        if hasMCPTools,
           let toolsPrompt = mcpClientManager?.toolsSystemPrompt,
           !toolsPrompt.isEmpty {
            history.insert(ChatMessage(role: .system, content: toolsPrompt), at: 0)
        }

        return Array(history)
    }

    // MARK: - Tool Call Parsing

    /// A parsed tool call extracted from LLM output
    private struct ParsedToolCall {
        let name: String
        let arguments: [String: Value]?
    }

    /// Parse a <tool_call>{"name":...,"arguments":...}</tool_call> block from the LLM's response.
    /// Parse a tool call from the LLM's response.
    /// Supports two formats:
    ///   1. ```tool\n{"name":...,"arguments":...}\n```  (markdown code fence)
    ///   2. <tool_call>{"name":...}</tool_call>  (legacy XML, for models that use it natively)
    /// Strips <think>...</think> blocks first so reasoning text doesn't interfere.
    private func parseToolCall(from text: String) -> ParsedToolCall? {
        // Strip <think> blocks first
        var cleaned = text
        while let start = cleaned.range(of: "<think>") {
            if let end = cleaned.range(of: "</think>") {
                cleaned.removeSubrange(start.lowerBound..<end.upperBound)
            } else {
                cleaned.removeSubrange(start.lowerBound..<cleaned.endIndex)
            }
        }

        // Try format 1: ```tool\n{...}\n```
        var jsonString: String?
        if let startRange = cleaned.range(of: "```tool\n"),
           let endRange = cleaned.range(of: "\n```", range: startRange.upperBound..<cleaned.endIndex) {
            jsonString = String(cleaned[startRange.upperBound..<endRange.lowerBound])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Try format 2: <tool_call>{...}</tool_call> (native Hermes format)
        else if let startRange = cleaned.range(of: "<tool_call>"),
                let endRange = cleaned.range(of: "</tool_call>") {
            jsonString = String(cleaned[startRange.upperBound..<endRange.lowerBound])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }

        guard let json = jsonString, let jsonData = json.data(using: .utf8) else {
            return nil
        }

        do {
            guard let dict = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                  let name = dict["name"] as? String else {
                return nil
            }

            var mcpArguments: [String: Value]? = nil
            if let args = dict["arguments"] as? [String: Any] {
                mcpArguments = try convertToMCPValues(args)
            }

            return ParsedToolCall(name: name, arguments: mcpArguments)
        } catch {
            print("[ChatViewModel] Failed to parse tool call: \(error)")
            return nil
        }
    }

    /// Convert [String: Any] to MCP SDK's [String: Value]
    private func convertToMCPValues(_ dict: [String: Any]) throws -> [String: Value] {
        var result: [String: Value] = [:]
        for (key, val) in dict {
            result[key] = try convertAnyToValue(val)
        }
        return result
    }

    /// Convert a single Foundation object to MCP Value
    private func convertAnyToValue(_ val: Any) throws -> Value {
        switch val {
        case let s as String:
            return .string(s)
        case let n as NSNumber:
            if CFGetTypeID(n) == CFBooleanGetTypeID() {
                return .bool(n.boolValue)
            } else if n.doubleValue == Double(n.intValue) {
                return .int(n.intValue)
            } else {
                return .double(n.doubleValue)
            }
        case let arr as [Any]:
            return .array(try arr.map { try convertAnyToValue($0) })
        case let dict as [String: Any]:
            return .object(try convertToMCPValues(dict))
        case is NSNull:
            return .null
        default:
            return .string(String(describing: val))
        }
    }

    /// Remove all tool call blocks from text for clean display.
    /// Handles both ```tool\n...\n``` and <tool_call>...</tool_call> formats.
    private func removeToolCallBlock(from text: String) -> String {
        var result = text
        // Remove ```tool\n...\n``` blocks
        while let start = result.range(of: "```tool\n") {
            if let end = result.range(of: "\n```", range: start.upperBound..<result.endIndex) {
                // Remove including the closing ```
                let removeEnd = result.index(end.upperBound, offsetBy: 0)
                result.removeSubrange(start.lowerBound..<removeEnd)
            } else {
                result.removeSubrange(start.lowerBound..<result.endIndex)
            }
        }
        // Remove <tool_call>...</tool_call> blocks (legacy/native format)
        while let start = result.range(of: "<tool_call>") {
            if let end = result.range(of: "</tool_call>") {
                result.removeSubrange(start.lowerBound..<end.upperBound)
            } else {
                result.removeSubrange(start.lowerBound..<result.endIndex)
            }
        }
        return result
    }

    /// Remove all <think>...</think> blocks from text for clean display
    private func removeThinkBlock(from text: String) -> String {
        var result = text
        while let start = result.range(of: "<think>") {
            if let end = result.range(of: "</think>") {
                result.removeSubrange(start.lowerBound..<end.upperBound)
            } else {
                result.removeSubrange(start.lowerBound..<result.endIndex)
            }
        }
        return result
    }

    // MARK: - Tool Call Execution

    /// Execute a parsed tool call via MCPClientManager
    private func executeToolCall(_ toolCall: ParsedToolCall) async -> (result: String?, error: String?) {
        guard let mcpClient = mcpClientManager else {
            return (nil, "MCP client manager not available")
        }

        do {
            let result = try await mcpClient.callTool(name: toolCall.name, arguments: toolCall.arguments)
            return (result, nil)
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    // MARK: - Stop Generation

    func stopGeneration() {
        llmService?.stopGeneration()
        isStreaming = false
        currentToolCall = nil
    }

    // MARK: - Reset on Conversation Switch

    func resetForNewConversation() {
        isStreaming = false
        inputText = ""
        currentToolCall = nil
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
