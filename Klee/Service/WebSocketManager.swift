//
//  WebSocketManager.swift
//  Klee
//
//  Manages WebSocket connection to OpenClaw Gateway.
//  Handles authentication, message send/receive, streaming, and auto-reconnect.
//

import Foundation
import Combine

@MainActor
final class WebSocketManager: ObservableObject {

    // MARK: - Published State

    @Published private(set) var connectionState: WSConnectionState = .disconnected
    @Published var messages: [ChatMessage] = []
    @Published private(set) var agentActivity: AgentActivity = .idle

    // MARK: - Configuration

    private let port: Int
    private let token: String
    private let maxReconnectAttempts = 5
    private let reconnectBaseDelay: TimeInterval = 1.0

    // MARK: - Private

    private var webSocketTask: URLSessionWebSocketTask?
    private var reconnectAttempt = 0
    private var receiveTask: Task<Void, Never>?
    private var isIntentionalDisconnect = false

    /// ID of the message currently being streamed (assistant response).
    private var streamingMessageID: UUID?

    // MARK: - Init

    init(port: Int, token: String) {
        self.port = port
        self.token = token
    }

    // MARK: - Connect

    func connect() {
        guard connectionState != .connected, connectionState != .connecting else { return }

        isIntentionalDisconnect = false
        connectionState = .connecting

        let url = URL(string: "ws://127.0.0.1:\(port)")!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        // Use URLSession.shared to avoid leaking sessions (W2 fix)
        let task = URLSession.shared.webSocketTask(with: request)
        webSocketTask = task
        task.resume()

        // Stay in .connecting until we confirm the connection with a ping (W1 fix)
        receiveTask = Task { [weak self] in
            await self?.confirmConnection()
            await self?.receiveLoop()
        }
    }

    // MARK: - Disconnect

    func disconnect() {
        isIntentionalDisconnect = true
        receiveTask?.cancel()
        receiveTask = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        connectionState = .disconnected
    }

    // MARK: - Send Message

    /// Send a user message to the gateway.
    func sendMessage(_ text: String) async {
        let userMessage = ChatMessage(role: .user, content: text)
        messages.append(userMessage)

        agentActivity = .thinking

        let payload: [String: Any] = [
            "type": "chat.send",
            "data": [
                "message": text
            ]
        ]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            agentActivity = .idle
            return
        }

        do {
            try await webSocketTask?.send(.string(jsonString))
        } catch {
            agentActivity = .idle
            appendSystemMessage("Failed to send message: \(error.localizedDescription)")
        }
    }

    // MARK: - Connection Confirmation

    /// Send a ping to verify the WebSocket handshake actually completed.
    /// Only transition to .connected after a successful pong response.
    private func confirmConnection() async {
        guard let ws = webSocketTask else { return }
        do {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                ws.sendPing { error in
                    if let error { cont.resume(throwing: error) }
                    else { cont.resume() }
                }
            }
            reconnectAttempt = 0
            connectionState = .connected
        } catch {
            if !isIntentionalDisconnect {
                await handleDisconnect()
            }
        }
    }

    // MARK: - Receive Loop

    private func receiveLoop() async {
        // If ping failed, confirmConnection already handled disconnect
        guard connectionState == .connected else { return }

        guard let ws = webSocketTask else { return }

        while !Task.isCancelled {
            do {
                let message = try await ws.receive()
                await handleMessage(message)
            } catch {
                if !isIntentionalDisconnect {
                    await handleDisconnect()
                }
                return
            }
        }
    }

    // MARK: - Message Handling

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) async {
        switch message {
        case .string(let text):
            guard let data = text.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = json["type"] as? String else { return }

            switch type {
            case "chat.stream.start":
                // Begin a new assistant message
                let assistantMsg = ChatMessage(role: .assistant, content: "")
                streamingMessageID = assistantMsg.id
                messages.append(assistantMsg)
                agentActivity = .thinking

            case "chat.stream.delta":
                // Append text chunk to the current streaming message
                if let deltaData = json["data"] as? [String: Any],
                   let content = deltaData["content"] as? String,
                   let sid = streamingMessageID,
                   let idx = messages.firstIndex(where: { $0.id == sid }) {
                    messages[idx].content += content
                    agentActivity = .thinking
                }

            case "chat.stream.end":
                // Streaming complete
                streamingMessageID = nil
                agentActivity = .done
                // Reset to idle after a brief display
                Task {
                    try? await Task.sleep(for: .seconds(1))
                    if agentActivity == .done { agentActivity = .idle }
                }

            case "agent.tool.start":
                // Agent is executing a tool
                let toolName = (json["data"] as? [String: Any])?["tool"] as? String ?? "tool"
                agentActivity = .executing(toolName)

            case "agent.tool.end":
                agentActivity = .thinking

            case "error":
                let errorMsg = (json["data"] as? [String: Any])?["message"] as? String ?? "Unknown error"
                appendSystemMessage("Gateway error: \(errorMsg)")
                agentActivity = .idle

            default:
                break
            }

        case .data:
            // Binary frames not expected from OpenClaw
            break

        @unknown default:
            break
        }
    }

    // MARK: - Auto-Reconnect

    private func handleDisconnect() async {
        connectionState = .disconnected

        guard !isIntentionalDisconnect,
              reconnectAttempt < maxReconnectAttempts else {
            if reconnectAttempt >= maxReconnectAttempts {
                connectionState = .failed("Max reconnect attempts reached.")
            }
            return
        }

        reconnectAttempt += 1
        connectionState = .reconnecting(attempt: reconnectAttempt)

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        let delay = reconnectBaseDelay * pow(2.0, Double(reconnectAttempt - 1))
        try? await Task.sleep(for: .seconds(delay))

        if !isIntentionalDisconnect {
            connect()
        }
    }

    // MARK: - Helpers

    private func appendSystemMessage(_ content: String) {
        let msg = ChatMessage(role: .system, content: content)
        messages.append(msg)
    }
}
