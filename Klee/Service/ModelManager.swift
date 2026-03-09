//
//  ModelManager.swift
//  Klee
//
//  模型管理器：推荐模型列表、按内存过滤、下载/删除缓存模型。
//  替代 Ollama 的模型管理方式，直接操作 HuggingFace Hub 本地缓存。
//

import Foundation
import Observation

@Observable
class ModelManager {

    // MARK: - 可观察属性

    /// 当前系统可运行的推荐模型（已按内存过滤）
    private(set) var availableModels: [ModelInfo] = []

    /// 已下载到本地缓存的模型 ID 集合
    private(set) var cachedModelIds: Set<String> = []

    /// 当前选中的模型 ID
    var selectedModelId: String?

    /// 系统物理内存（GB）
    private(set) var systemRAM: Int = 0

    // MARK: - 预定义推荐模型列表（按内存分级）

    static let recommendedModels: [ModelInfo] = [
        // 8GB 机型
        ModelInfo(
            id: "mlx-community/Qwen3-4B-4bit",
            name: "Qwen3 4B",
            size: "~2.5 GB",
            minRAM: 8
        ),
        // 16GB 机型
        ModelInfo(
            id: "mlx-community/Llama-3.3-8B-Instruct-4bit",
            name: "Llama 3.3 8B",
            size: "~5 GB",
            minRAM: 16
        ),
        ModelInfo(
            id: "mlx-community/Qwen3-8B-4bit",
            name: "Qwen3 8B",
            size: "~5 GB",
            minRAM: 16
        ),
        // 32GB 机型
        ModelInfo(
            id: "mlx-community/Mistral-Small-24B-Instruct-2501-4bit",
            name: "Mistral Small 24B",
            size: "~12 GB",
            minRAM: 32
        ),
        ModelInfo(
            id: "mlx-community/Qwen3-14B-4bit",
            name: "Qwen3 14B",
            size: "~8 GB",
            minRAM: 32
        ),
        // 64GB+ 机型
        ModelInfo(
            id: "mlx-community/Qwen3-32B-4bit",
            name: "Qwen3 32B",
            size: "~18 GB",
            minRAM: 64
        ),
    ]

    // MARK: - 初始化

    init() {
        let totalBytes = ProcessInfo.processInfo.physicalMemory
        systemRAM = Int(totalBytes / (1024 * 1024 * 1024))
        filterBySystemRAM()
        refreshCachedModels()
        loadLastSelectedModel()
    }

    // MARK: - 按系统内存过滤

    /// 检测系统内存，过滤出当前机器可运行的模型
    func filterBySystemRAM() {
        availableModels = Self.recommendedModels.filter { $0.minRAM <= systemRAM }
    }

    // MARK: - 刷新缓存模型列表

    /// 扫描 HuggingFace Hub 缓存目录，找出已下载的模型
    func refreshCachedModels() {
        let cacheDir = huggingFaceCacheDir
        var cached = Set<String>()

        guard let contents = try? FileManager.default.contentsOfDirectory(
            at: cacheDir,
            includingPropertiesForKeys: nil
        ) else {
            cachedModelIds = cached
            return
        }

        // HuggingFace Hub 缓存目录结构：
        // ~/Library/Caches/huggingface/hub/models--org--model-name/
        for dir in contents {
            let dirName = dir.lastPathComponent
            if dirName.hasPrefix("models--") {
                // 将目录名转换回 HuggingFace 模型 ID
                // "models--mlx-community--Qwen3-4B-4bit" -> "mlx-community/Qwen3-4B-4bit"
                let modelId = dirName
                    .replacingOccurrences(of: "models--", with: "")
                    .replacingOccurrences(of: "--", with: "/")

                // 检查是否有实际的模型文件（safetensors）
                let snapshotsDir = dir.appendingPathComponent("snapshots")
                if let snapshots = try? FileManager.default.contentsOfDirectory(
                    at: snapshotsDir,
                    includingPropertiesForKeys: nil
                ) {
                    for snapshot in snapshots {
                        if let files = try? FileManager.default.contentsOfDirectory(atPath: snapshot.path),
                           files.contains(where: { $0.hasSuffix(".safetensors") }) {
                            cached.insert(modelId)
                            break
                        }
                    }
                }
            }
        }

        cachedModelIds = cached
    }

    // MARK: - 删除模型

    /// 删除指定模型的本地缓存
    /// - Parameter id: HuggingFace 模型 ID
    func deleteModel(id: String) throws {
        let dirName = "models--" + id.replacingOccurrences(of: "/", with: "--")
        let modelDir = huggingFaceCacheDir.appendingPathComponent(dirName)

        guard FileManager.default.fileExists(atPath: modelDir.path) else {
            return
        }

        try FileManager.default.removeItem(at: modelDir)

        // 更新缓存列表
        cachedModelIds.remove(id)

        // 如果删除的是当前选中的模型，清除选择
        if selectedModelId == id {
            selectedModelId = nil
            UserDefaults.standard.removeObject(forKey: "lastUsedModelId")
        }
    }

    // MARK: - 检查模型是否已缓存

    /// 判断模型是否已下载到本地
    func isCached(_ id: String) -> Bool {
        cachedModelIds.contains(id)
    }

    // MARK: - 模型缓存大小

    /// 获取指定模型的本地缓存文件大小
    /// - Returns: 字节数，如果未缓存则返回 nil
    func cachedSize(for id: String) -> Int64? {
        let dirName = "models--" + id.replacingOccurrences(of: "/", with: "--")
        let modelDir = huggingFaceCacheDir.appendingPathComponent(dirName)

        guard FileManager.default.fileExists(atPath: modelDir.path) else {
            return nil
        }

        return directorySize(at: modelDir)
    }

    // MARK: - 私有方法

    /// HuggingFace Hub 缓存根目录
    private var huggingFaceCacheDir: URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("huggingface/hub")
    }

    /// 计算目录总大小
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

    /// 从 UserDefaults 恢复上次选择的模型
    private func loadLastSelectedModel() {
        if let lastId = UserDefaults.standard.string(forKey: "lastUsedModelId") {
            selectedModelId = lastId
        }
    }
}
