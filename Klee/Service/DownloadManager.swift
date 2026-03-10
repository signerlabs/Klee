//
//  DownloadManager.swift
//  Klee
//
//  Model download manager: wraps HuggingFace Hub download capabilities with real-time progress, speed, and cancel support.
//  Relies on mlx-swift-lm's loadContainer -> Hub.snapshot -> Downloader pipeline.
//  Hub's Downloader supports resume (Range header); cancelling and restarting automatically resumes.
//

import Foundation
import Observation
import MLXLLM
@preconcurrency import MLXLMCommon

// MARK: - Download Status

/// Download status for a single model
enum DownloadStatus: Equatable {
    case idle
    case downloading
    case paused
    case completed
    case failed(String)
    case cancelling
}

// MARK: - Download Progress

/// Download progress snapshot (for UI display)
struct DownloadProgress: Equatable {
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

// MARK: - DownloadManager

@Observable
class DownloadManager {

    // MARK: - Observable Properties

    /// Current download status
    private(set) var status: DownloadStatus = .idle

    /// Download progress
    private(set) var progress: DownloadProgress = .init()

    /// ID of the model being downloaded
    private(set) var downloadingModelId: String?

    // MARK: - Private Properties

    /// Current download+load task (for cancellation)
    private var downloadTask: Task<ModelContainer?, Never>?

    // MARK: - Download and Load Model

    /// Download model files and load into memory, returning a ModelContainer
    /// - Parameter id: HuggingFace model ID
    /// - Returns: The loaded ModelContainer, or nil if cancelled or failed
    @discardableResult
    func downloadAndLoad(id: String) async -> ModelContainer? {
        // Don't start a duplicate download for the same model
        if downloadingModelId == id && status == .downloading {
            return nil
        }

        // Cancel any previous task
        cancelCurrentTask()

        // Reset state
        downloadingModelId = id
        status = .downloading
        progress = .init()

        let task = Task<ModelContainer?, Never> { [weak self] in
            do {
                let configuration = ModelConfiguration(id: id)

                // Track download progress via loadContainer's Progress callback
                // Hub.snapshot creates child Progress per file, callback fires on each chunk write
                let container = try await LLMModelFactory.shared.loadContainer(
                    configuration: configuration
                ) { [weak self] progress in
                    // Progress object:
                    //   totalUnitCount = total file count
                    //   completedUnitCount = completed files (including partial progress)
                    //   fractionCompleted = overall completion ratio
                    //   userInfo[.throughputKey] = current speed (bytes/sec)
                    Task { @MainActor [weak self] in
                        guard let self, self.status == .downloading else { return }
                        self.progress.fractionCompleted = progress.fractionCompleted
                        self.progress.completedFiles = progress.completedUnitCount
                        self.progress.totalFiles = progress.totalUnitCount
                        if let speed = progress.userInfo[.throughputKey] as? Double {
                            self.progress.speed = speed
                        }
                    }
                }

                // Check if cancelled
                if Task.isCancelled {
                    await MainActor.run { [weak self] in
                        self?.status = .idle
                        self?.downloadingModelId = nil
                    }
                    return nil
                }

                // Download + load complete
                await MainActor.run { [weak self] in
                    self?.status = .completed
                    self?.progress.fractionCompleted = 1.0
                }

                return container

            } catch {
                if Task.isCancelled {
                    await MainActor.run { [weak self] in
                        self?.status = .idle
                        self?.downloadingModelId = nil
                    }
                } else {
                    await MainActor.run { [weak self] in
                        self?.status = .failed(error.localizedDescription)
                    }
                }
                return nil
            }
        }

        downloadTask = task
        return await task.value
    }

    // MARK: - Cancel Download

    /// Cancel the current download task
    /// Hub's Downloader retains .incomplete files; the next download automatically resumes
    func cancel() {
        guard status == .downloading else { return }
        status = .cancelling
        cancelCurrentTask()
        status = .idle
        downloadingModelId = nil
        progress = .init()
    }

    // MARK: - Reset State

    /// Reset to initial state (for cleanup after download completion)
    func reset() {
        cancelCurrentTask()
        status = .idle
        downloadingModelId = nil
        progress = .init()
    }

    // MARK: - Private Methods

    private func cancelCurrentTask() {
        downloadTask?.cancel()
        downloadTask = nil
    }
}
