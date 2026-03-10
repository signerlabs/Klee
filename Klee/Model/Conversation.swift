//
//  Conversation.swift
//  Klee
//
//  Data model for a single conversation (chat session).
//  Each conversation is persisted as a separate JSON file.
//

import Foundation

/// A single conversation containing a list of messages
struct Conversation: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var messages: [ChatMessage]
    let createdAt: Date
    var updatedAt: Date

    /// Whether the title is still the default placeholder
    var hasDefaultTitle: Bool {
        title == Conversation.defaultTitle
    }

    static let defaultTitle = "New Chat"

    init(id: UUID = UUID(), title: String = Conversation.defaultTitle, messages: [ChatMessage] = [], createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id
        self.title = title
        self.messages = messages
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
