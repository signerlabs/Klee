//
//  AppState.swift
//  Klee
//
//  State enums and data models.
//  Phase 1 refactor: removed process management types, added MLX inference layer models.
//

import Foundation

// MARK: - LLM State

/// Runtime state of the LLM inference engine
enum LLMState: Equatable {
    case idle           // No model loaded
    case loading        // Loading model (downloading/reading cache)
    case ready          // Model loaded, awaiting input
    case generating     // Streaming generation in progress
    case error(String)  // An error occurred

    var label: String {
        switch self {
        case .idle:             return "Not Loaded"
        case .loading:          return "Loading..."
        case .ready:            return "Ready"
        case .generating:       return "Generating..."
        case .error(let msg):   return "Error: \(msg)"
        }
    }

    var isReady: Bool {
        self == .ready || self == .generating
    }
}

// MARK: - Model Info

/// Describes an available MLX model
struct ModelInfo: Identifiable, Equatable, Hashable {
    /// HuggingFace model ID (e.g., "mlx-community/Qwen3.5-9B-4bit")
    let id: String
    /// User-friendly display name
    let name: String
    /// Estimated model file size (e.g., "~2.5 GB")
    let size: String
    /// Minimum system RAM (GB) required to run this model
    let minRAM: Int
    /// Estimated download size in bytes (used for progress calculation)
    let expectedBytes: Int64
    /// Whether this model supports vision (image/video) input
    let supportsVision: Bool

    init(id: String, name: String, size: String, minRAM: Int, expectedBytes: Int64, supportsVision: Bool = false) {
        self.id = id
        self.name = name
        self.size = size
        self.minRAM = minRAM
        self.expectedBytes = expectedBytes
        self.supportsVision = supportsVision
    }

    /// Label describing the RAM requirement
    var ramLabel: String {
        "Requires \(minRAM)GB+ RAM"
    }
}

// MARK: - Chat Message

/// A single message in the conversation
struct ChatMessage: Identifiable, Equatable, Codable {
    let id: UUID
    let role: Role
    var content: String
    let timestamp: Date
    /// File URLs of attached images (stored as strings for Codable compatibility)
    var imageURLs: [String]

    enum Role: String, Equatable, Codable {
        case user
        case assistant
        case system
    }

    init(role: Role, content: String, imageURLs: [String] = []) {
        self.id = UUID()
        self.role = role
        self.content = content
        self.timestamp = Date()
        self.imageURLs = imageURLs
    }

    /// Custom decoder for backward compatibility with existing JSON files that lack imageURLs
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        role = try container.decode(Role.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        timestamp = try container.decode(Date.self, forKey: .timestamp)
        imageURLs = try container.decodeIfPresent([String].self, forKey: .imageURLs) ?? []
    }
}

// MARK: - App Errors

enum AppError: LocalizedError {
    case modelLoadFailed(String)
    case generationFailed(String)
    case modelNotLoaded
    case downloadFailed(String)
    case insufficientMemory(required: Int, available: Int)

    var errorDescription: String? {
        switch self {
        case .modelLoadFailed(let detail):
            return "Failed to load model: \(detail)"
        case .generationFailed(let detail):
            return "Generation failed: \(detail)"
        case .modelNotLoaded:
            return "No model loaded. Please select and download a model first."
        case .downloadFailed(let detail):
            return "Model download failed: \(detail)"
        case .insufficientMemory(let required, let available):
            return "Insufficient memory: this model requires \(required)GB, but only \(available)GB available."
        }
    }
}
