//
//  ModelManager.swift
//  Klee
//
//  Model manager: recommended model list, RAM-based filtering, download/delete cached models.
//  Model cache path: ~/Library/Caches/models/{org}/{model-name}/
//

import Foundation
import Observation

@Observable
class ModelManager {

    // MARK: - Observable Properties

    /// Recommended models runnable on the current system (filtered by RAM)
    private(set) var availableModels: [ModelInfo] = []

    /// Set of model IDs that have been downloaded to local cache
    private(set) var cachedModelIds: Set<String> = []

    /// Currently selected model ID
    var selectedModelId: String?

    /// System physical memory (GB)
    private(set) var systemRAM: Int = 0

    // MARK: - Initialization

    init() {
        let totalBytes = ProcessInfo.processInfo.physicalMemory
        systemRAM = Int(totalBytes / (1024 * 1024 * 1024))
        filterBySystemRAM()
        refreshCachedModels()
        loadLastSelectedModel()
    }

    // MARK: - Filter by System RAM

    /// Detect system memory and filter models runnable on this machine
    func filterBySystemRAM() {
        availableModels = ModelInfo.recommended.filter { $0.minRAM <= systemRAM }
    }

    // MARK: - Refresh Cached Models

    /// Scan the model cache directory to find downloaded models
    /// mlx-swift-lm cache structure: ~/Library/Caches/models/{org}/{model-name}/
    func refreshCachedModels() {
        var cached = Set<String>()
        let fm = FileManager.default

        // Iterate recommended models, check if directory exists and contains safetensors files
        for model in ModelInfo.recommended {
            let modelDir = cacheDirectory(for: model.id)
            if fm.fileExists(atPath: modelDir.path) {
                if let files = try? fm.contentsOfDirectory(atPath: modelDir.path),
                   files.contains(where: { $0.hasSuffix(".safetensors") }) {
                    cached.insert(model.id)
                }
            }
        }

        cachedModelIds = cached
    }

    // MARK: - Delete Model

    /// Delete the local cache for a specified model
    /// - Parameter id: HuggingFace model ID (e.g., "mlx-community/Qwen3-4B-4bit")
    func deleteModel(id: String) throws {
        let modelDir = cacheDirectory(for: id)

        guard FileManager.default.fileExists(atPath: modelDir.path) else {
            return
        }

        try FileManager.default.removeItem(at: modelDir)

        // Update cached list
        cachedModelIds.remove(id)

        // If the deleted model was selected, clear the selection
        if selectedModelId == id {
            selectedModelId = nil
            UserDefaults.standard.removeObject(forKey: "lastUsedModelId")
        }
    }

    // MARK: - Check if Model is Cached

    /// Check whether a model has been downloaded locally
    func isCached(_ id: String) -> Bool {
        cachedModelIds.contains(id)
    }

    // MARK: - Model Cache Size

    /// Get the local cache file size for a specified model
    /// - Returns: Size in bytes, or nil if not cached
    func cachedSize(for id: String) -> Int64? {
        let modelDir = cacheDirectory(for: id)

        guard FileManager.default.fileExists(atPath: modelDir.path) else {
            return nil
        }

        return directorySize(at: modelDir)
    }

    // MARK: - Private Methods

    /// Model cache root directory: ~/Library/Caches/models/
    private var modelsCacheDir: URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("models")
    }

    /// Get the cache directory for a specified model
    /// "mlx-community/Qwen3-4B-4bit" -> ~/Library/Caches/models/mlx-community/Qwen3-4B-4bit/
    private func cacheDirectory(for id: String) -> URL {
        modelsCacheDir.appendingPathComponent(id)
    }

    /// Calculate total directory size
    private func directorySize(at url: URL) -> Int64 {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(
            at: url,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }

        var total: Int64 = 0
        for case let fileURL as URL in enumerator {
            if let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey]),
               let size = values.fileSize {
                total += Int64(size)
            }
        }
        return total
    }

    /// Restore the last selected model from UserDefaults
    private func loadLastSelectedModel() {
        if let lastId = UserDefaults.standard.string(forKey: "lastUsedModelId") {
            selectedModelId = lastId
        }
    }
}
