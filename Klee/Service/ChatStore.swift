//
//  ChatStore.swift
//  Klee
//
//  Manages all conversations: CRUD operations and JSON file persistence.
//  Each conversation is saved as a separate JSON file under Application Support/Klee/chats/.
//

import Foundation
import Observation

@Observable
class ChatStore {

    // MARK: - Observable Properties

    /// All conversations, sorted by updatedAt descending (newest first)
    private(set) var conversations: [Conversation] = []

    /// Currently selected conversation ID
    var selectedConversationId: UUID? {
        didSet {
            // Persist last selected conversation
            if let id = selectedConversationId {
                UserDefaults.standard.set(id.uuidString, forKey: "lastSelectedConversationId")
            }
        }
    }

    /// The currently selected conversation (convenience accessor)
    var currentConversation: Conversation? {
        get {
            conversations.first { $0.id == selectedConversationId }
        }
        set {
            guard let newValue else { return }
            if let idx = conversations.firstIndex(where: { $0.id == newValue.id }) {
                conversations[idx] = newValue
            }
        }
    }

    // MARK: - Private Properties

    private let chatsDirectory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    // MARK: - Init

    init() {
        // ~/Library/Application Support/Klee/chats/
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        chatsDirectory = appSupport.appendingPathComponent("Klee/chats", isDirectory: true)

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        // Ensure directory exists
        try? FileManager.default.createDirectory(at: chatsDirectory, withIntermediateDirectories: true)

        // Load existing conversations
        loadAll()

        // Restore last selected conversation
        if let lastId = UserDefaults.standard.string(forKey: "lastSelectedConversationId"),
           let uuid = UUID(uuidString: lastId),
           conversations.contains(where: { $0.id == uuid }) {
            selectedConversationId = uuid
        } else if let first = conversations.first {
            selectedConversationId = first.id
        }
    }

    // MARK: - CRUD

    /// Create a new empty conversation and select it
    @discardableResult
    func createConversation() -> Conversation {
        let conversation = Conversation()
        conversations.insert(conversation, at: 0)
        selectedConversationId = conversation.id
        save(conversation)
        return conversation
    }

    /// Delete a conversation by ID
    func deleteConversation(id: UUID) {
        conversations.removeAll { $0.id == id }

        // Remove file
        let fileURL = chatsDirectory.appendingPathComponent("\(id.uuidString).json")
        try? FileManager.default.removeItem(at: fileURL)

        // If deleted the selected one, select the first available
        if selectedConversationId == id {
            selectedConversationId = conversations.first?.id
        }
    }

    /// Append a message to the given conversation and save
    func appendMessage(_ message: ChatMessage, to conversationId: UUID) {
        guard let idx = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        conversations[idx].messages.append(message)
        conversations[idx].updatedAt = Date()
        sortConversations()
        save(conversations[idx])
    }

    /// Update a specific message in a conversation (e.g., streaming content update)
    func updateMessage(id messageId: UUID, in conversationId: UUID, content: String) {
        guard let cIdx = conversations.firstIndex(where: { $0.id == conversationId }),
              let mIdx = conversations[cIdx].messages.firstIndex(where: { $0.id == messageId }) else { return }
        conversations[cIdx].messages[mIdx].content = content
    }

    /// Remove a specific message from a conversation
    func removeMessage(id messageId: UUID, from conversationId: UUID) {
        guard let cIdx = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        conversations[cIdx].messages.removeAll { $0.id == messageId }
    }

    /// Update the title of a conversation
    func updateTitle(_ title: String, for conversationId: UUID) {
        guard let idx = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        conversations[idx].title = title
        save(conversations[idx])
    }

    /// Save the current state of a conversation to disk
    func saveConversation(id: UUID) {
        guard let conversation = conversations.first(where: { $0.id == id }) else { return }
        save(conversation)
    }

    // MARK: - Persistence

    /// Save a single conversation to its JSON file
    private func save(_ conversation: Conversation) {
        let fileURL = chatsDirectory.appendingPathComponent("\(conversation.id.uuidString).json")
        do {
            let data = try encoder.encode(conversation)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("[ChatStore] Failed to save conversation \(conversation.id): \(error)")
        }
    }

    /// Load all conversations from disk
    private func loadAll() {
        guard let files = try? FileManager.default.contentsOfDirectory(at: chatsDirectory, includingPropertiesForKeys: nil)
            .filter({ $0.pathExtension == "json" }) else {
            return
        }

        var loaded: [Conversation] = []
        for file in files {
            do {
                let data = try Data(contentsOf: file)
                let conversation = try decoder.decode(Conversation.self, from: data)
                loaded.append(conversation)
            } catch {
                print("[ChatStore] Failed to load \(file.lastPathComponent): \(error)")
            }
        }

        // Sort by updatedAt descending
        loaded.sort { $0.updatedAt > $1.updatedAt }
        conversations = loaded
    }

    /// Re-sort conversations by updatedAt descending
    private func sortConversations() {
        conversations.sort { $0.updatedAt > $1.updatedAt }
    }
}
