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
    var inspectorItems: [InspectorItem]
    let createdAt: Date
    var updatedAt: Date

    /// Whether the title is still the default placeholder
    var hasDefaultTitle: Bool {
        title == Conversation.defaultTitle
    }

    static let defaultTitle = "New Task"

    init(id: UUID = UUID(), title: String = Conversation.defaultTitle, messages: [ChatMessage] = [], inspectorItems: [InspectorItem] = [], createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id
        self.title = title
        self.messages = messages
        self.inspectorItems = inspectorItems
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    /// Custom decoder for backward compatibility with existing JSON files that lack inspectorItems
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        messages = try container.decode([ChatMessage].self, forKey: .messages)
        inspectorItems = try container.decodeIfPresent([InspectorItem].self, forKey: .inspectorItems) ?? []
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
    }
}
