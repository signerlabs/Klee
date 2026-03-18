//
//  DownloadManager.swift
//  Klee
//
//  Download orchestrator: coordinates HuggingFaceAPI, FileDownloader, and TokenizerPatcher
//  to download model files and load them into memory.
//
//  Download phase: fetches file list from HF API, then downloads each file with resume support.
//  Load phase: once all files are downloaded, loads the model from the local directory.
//

import Foundation
import Observation
import MLXLLM
@preconcurrency import MLXLMCommon

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

    /// File downloader instance (owns the URLSession + delegate)
    private let fileDownloader = FileDownloader()

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

        // Wire up progress callback from FileDownloader
        fileDownloader.onProgress = { [weak self] fractionCompleted, speed in
            guard let self, self.status == .downloading else { return }
            self.progress.fractionCompleted = fractionCompleted
            if let speed {
                self.progress.speed = speed
            }
        }

        let task = Task<ModelContainer?, Never> { [weak self] in
            guard let self else { return nil }

            do {
                // Phase 1: Download all required files
                let localDir = self.cacheDirectory(for: id)
                try await self.downloadAllFiles(modelId: id, to: localDir)

                // Check cancellation between phases
                if Task.isCancelled {
                    await MainActor.run { [weak self] in
                        self?.status = .idle
                        self?.downloadingModelId = nil
                    }
                    return nil
                }

                // Phase 2: Load model from local directory
                let configuration = ModelConfiguration(directory: localDir)
                let container = try await loadModelContainer(
                    configuration: configuration
                ) { [weak self] loadProgress in
                    Task { @MainActor [weak self] in
                        guard let self, self.status == .downloading else { return }
                        // During loading phase, show progress as 95-100%
                        let loadFraction = loadProgress.fractionCompleted
                        self.progress.fractionCompleted = 0.95 + loadFraction * 0.05
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
    /// .incomplete files are retained; the next download automatically resumes
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

    // MARK: - Private: File Download Pipeline

    /// Download all required files for a model
    private func downloadAllFiles(modelId: String, to localDir: URL) async throws {
        // Step 1: Fetch file list from HuggingFace API
        let files = try await HuggingFaceAPI.fetchFileList(modelId: modelId)
        let filteredFiles = HuggingFaceAPI.filterFiles(files)

        guard !filteredFiles.isEmpty else {
            throw KleeError.downloadFailed("No downloadable files found for model \(modelId)")
        }

        // Calculate total bytes
        let totalBytes = filteredFiles.reduce(Int64(0)) { $0 + ($1.size ?? 0) }
        let fileCount = Int64(filteredFiles.count)

        await MainActor.run { [weak self] in
            self?.progress.totalFiles = fileCount
            self?.progress.completedFiles = 0
        }

        // Create local directory
        try FileManager.default.createDirectory(at: localDir, withIntermediateDirectories: true)

        // Step 2: Download each file
        var downloadedBytes: Int64 = 0

        for (index, file) in filteredFiles.enumerated() {
            try Task.checkCancellation()

            let fileURL = localDir.appendingPathComponent(file.path)

            // Create subdirectories if needed (for nested paths)
            let parentDir = fileURL.deletingLastPathComponent()
            if parentDir != localDir {
                try FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)
            }

            // Check if file already exists with correct size
            let expectedSize = file.size ?? 0
            if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
               let existingSize = attrs[.size] as? Int64,
               existingSize == expectedSize, expectedSize > 0 {
                // File already complete, skip
                downloadedBytes += expectedSize
                let snapshot1 = downloadedBytes
                await MainActor.run { [weak self] in
                    self?.progress.completedFiles = Int64(index + 1)
                    if totalBytes > 0 {
                        self?.progress.fractionCompleted = Double(snapshot1) / Double(totalBytes) * 0.95
                    }
                }
                continue
            }

            // Download the file (with resume support)
            let bytesForFile = try await fileDownloader.downloadFile(
                modelId: modelId,
                remotePath: file.path,
                to: fileURL,
                expectedSize: expectedSize,
                totalBytes: totalBytes,
                previouslyDownloaded: downloadedBytes
            )
            downloadedBytes += bytesForFile

            let snapshot2 = downloadedBytes
            await MainActor.run { [weak self] in
                self?.progress.completedFiles = Int64(index + 1)
                if totalBytes > 0 {
                    self?.progress.fractionCompleted = Double(snapshot2) / Double(totalBytes) * 0.95
                }
            }
        }

        // Step 3: Validate safetensors files are non-empty
        let fm = FileManager.default
        for file in filteredFiles where file.path.hasSuffix(".safetensors") {
            let fileURL = localDir.appendingPathComponent(file.path)
            guard fm.fileExists(atPath: fileURL.path) else {
                throw KleeError.downloadFailed("Missing safetensors file: \(file.path)")
            }
            let attrs = try fm.attributesOfItem(atPath: fileURL.path)
            let size = attrs[.size] as? Int64 ?? 0
            if size == 0 {
                throw KleeError.downloadFailed("Downloaded safetensors file is 0 bytes: \(file.path)")
            }
        }

        // Step 4: Patch tokenizer_config.json if chat_template is missing
        await TokenizerPatcher.patchTokenizerConfigIfNeeded(modelId: modelId, localURL: localDir)
    }

    // MARK: - Helpers

    /// Model cache directory: ~/Library/Caches/models/{org}/{model-name}/
    private func cacheDirectory(for id: String) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("models/\(id)")
    }

    private func cancelCurrentTask() {
        fileDownloader.cancelActiveTask()
        downloadTask?.cancel()
        downloadTask = nil
    }
}
