//
//  AppState.swift
//  Klee
//
//  状态枚举与数据模型。
//  Phase 1 重构：移除进程管理相关类型，新增 MLX 推理层模型。
//

import Foundation

// MARK: - LLM 状态

/// LLM 推理引擎的运行状态
enum LLMState: Equatable {
    case idle           // 未加载模型
    case loading        // 正在加载模型（下载/读取缓存）
    case ready          // 模型已加载，等待输入
    case generating     // 正在流式生成
    case error(String)  // 发生错误

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

// MARK: - 模型信息

/// 描述一个可用的 MLX 模型
struct ModelInfo: Identifiable, Equatable, Hashable {
    /// HuggingFace 模型 ID（如 "mlx-community/Qwen3-4B-4bit"）
    let id: String
    /// 用户友好的显示名
    let name: String
    /// 预估模型文件大小（如 "~2.5 GB"）
    let size: String
    /// 运行此模型所需的最低系统内存（GB）
    let minRAM: Int

    /// 以内存要求生成描述标签
    var ramLabel: String {
        "Requires \(minRAM)GB+ RAM"
    }
}

// MARK: - 聊天消息

/// 对话中的单条消息
struct ChatMessage: Identifiable, Equatable {
    let id: UUID
    let role: Role
    var content: String
    let timestamp: Date

    enum Role: String, Equatable {
        case user
        case assistant
        case system
    }

    init(role: Role, content: String) {
        self.id = UUID()
        self.role = role
        self.content = content
        self.timestamp = Date()
    }
}

// MARK: - 应用错误

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
