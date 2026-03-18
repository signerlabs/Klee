//
//  DownloadState.swift
//  Klee
//
//  Data types for model download state tracking: status, progress, and HF file entries.
//

import Foundation

// MARK: - Download Status

/// Download status for a single model
enum DownloadStatus: Equatable, Sendable {
    case idle
    case downloading
    case paused
    case completed
    case failed(String)
    case cancelling

    nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle), (.downloading, .downloading), (.paused, .paused),
             (.completed, .completed), (.cancelling, .cancelling): return true
        case (.failed(let a), .failed(let b)): return a == b
        default: return false
        }
    }
}

// MARK: - Download Progress

/// Download progress snapshot (for UI display)
struct DownloadProgress: Sendable {
    /// Fraction completed 0.0 ~ 1.0
    var fractionCompleted: Double = 0
    /// Number of completed files
    var completedFiles: Int64 = 0
    /// Total number of files
    var totalFiles: Int64 = 0
    /// Current download speed (bytes/sec), nil if unknown
    var speed: Double? = nil

    /// Formatted speed string
    var speedLabel: String {
        guard let speed, speed > 0 else { return "" }
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return "\(formatter.string(fromByteCount: Int64(speed)))/s"
    }

    /// Formatted progress percentage
    var percentLabel: String {
        "\(Int(fractionCompleted * 100))%"
    }
}

// MARK: - HF API File Entry

/// A file entry returned by the HuggingFace API tree endpoint
struct HFFileEntry: Decodable {
    let type: String      // "file" or "directory"
    let path: String      // e.g. "config.json", "model-00001-of-00002.safetensors"
    let size: Int64?      // file size in bytes (nil for directories)
}
