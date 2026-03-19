//
//  InspectorItem.swift
//  Klee
//
//  Data model for conversation activity entries (thinking blocks and action tool calls).
//  Persisted alongside conversations in JSON.
//

import Foundation

/// Represents a single activity entry in a conversation (thinking blocks and tool call records)
struct InspectorItem: Identifiable, Codable, Equatable {
    let id: UUID
    let timestamp: Date
    var content: Content

    enum Content: Codable, Equatable {
        case thinking(String)
        /// Records an IntentRouter action execution (file/web/shell operations)
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
