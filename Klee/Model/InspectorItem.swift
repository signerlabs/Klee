//
//  InspectorItem.swift
//  Klee
//
//  Data model for conversation activity entries (thinking blocks).
//  Persisted alongside conversations in JSON.
//

import Foundation

/// Represents a single activity entry in a conversation (currently thinking blocks only)
struct InspectorItem: Identifiable, Codable, Equatable {
    let id: UUID
    let timestamp: Date
    var content: Content

    enum Content: Codable, Equatable {
        case thinking(String)
        // toolCall case reserved for future module implementations
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
