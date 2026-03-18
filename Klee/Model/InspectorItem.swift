//
//  InspectorItem.swift
//  Klee
//
//  Data model for Inspector panel entries (thinking blocks and tool calls).
//

import Foundation

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
