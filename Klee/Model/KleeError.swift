//
//  KleeError.swift
//  Klee
//
//  Unified error types for the Klee application.
//  Consolidates model and download errors into a single enum.
//

import Foundation

// MARK: - KleeError

enum KleeError: LocalizedError {

    // MARK: Model Errors

    case modelLoadFailed(String)
    case generationFailed(String)
    case modelNotLoaded
    case insufficientMemory(required: Int, available: Int)

    // MARK: Download Errors

    case downloadFailed(String)

    var errorDescription: String? {
        switch self {
        case .modelLoadFailed(let detail):
            return "Failed to load model: \(detail)"
        case .generationFailed(let detail):
            return "Generation failed: \(detail)"
        case .modelNotLoaded:
            return "No model loaded. Please select and download a model first."
        case .insufficientMemory(let required, let available):
            return "Insufficient memory: this model requires \(required)GB, but only \(available)GB available."
        case .downloadFailed(let detail):
            return "Model download failed: \(detail)"
        }
    }
}
