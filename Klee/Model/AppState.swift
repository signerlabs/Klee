//
//  AppState.swift
//  Klee
//
//  State enums and data models for Klee app.
//

import Foundation

// MARK: - Process State

/// Lifecycle state for a managed subprocess (Ollama / OpenClaw).
enum ProcessState: Equatable {
    case stopped
    case starting
    case running
    case error(String)

    var label: String {
        switch self {
        case .stopped:  return "Stopped"
        case .starting: return "Starting"
        case .running:  return "Running"
        case .error(let msg): return "Error: \(msg)"
        }
    }

    var isRunning: Bool {
        self == .running
    }
}

// MARK: - Chat Message

/// A single chat message displayed in the conversation.
struct ChatMessage: Identifiable, Equatable {
    let id: UUID
    let role: Role
    var content: String
    let timestamp: Date

    enum Role: String, Equatable {
        case user
        case assistant
        case system
    }

    init(role: Role, content: String) {
        self.id = UUID()
        self.role = role
        self.content = content
        self.timestamp = Date()
    }
}

// MARK: - Agent Activity

/// Indicates what the AI agent is currently doing.
enum AgentActivity: Equatable {
    case idle
    case thinking
    case executing(String)   // tool name or description
    case done
}

// MARK: - WebSocket Connection State

enum WSConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting(attempt: Int)
    case failed(String)
}

// MARK: - App Errors

enum AppError: LocalizedError {
    case ollamaStartTimeout
    case openclawStartTimeout
    case processLaunchFailed(String)
    case portInUse(Int)
    case webSocketConnectionFailed(String)

    var errorDescription: String? {
        switch self {
        case .ollamaStartTimeout:
            return "Ollama failed to start within the timeout period."
        case .openclawStartTimeout:
            return "OpenClaw Gateway failed to start within the timeout period."
        case .processLaunchFailed(let detail):
            return "Process launch failed: \(detail)"
        case .portInUse(let port):
            return "Port \(port) is already in use by another process."
        case .webSocketConnectionFailed(let detail):
            return "WebSocket connection failed: \(detail)"
        }
    }
}
