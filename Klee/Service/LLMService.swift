//
//  LLMService.swift
//  Klee
//
//  MLX Swift 进程内推理服务。
//  替代 OllamaService，直接使用 mlx-swift-lm 进行本地模型加载和流式生成。
//

import Foundation
import Observation
import MLXLLM
@preconcurrency import MLXLMCommon

@Observable
class LLMService {

    // MARK: - 可观察属性

    /// 当前 LLM 引擎状态
    private(set) var state: LLMState = .idle

    /// 当前已加载模型的 ID
    private(set) var currentModelId: String?

    /// 最近一次错误信息
    private(set) var error: String?

    /// 模型下载/加载进度（0.0 ~ 1.0）
    private(set) var loadProgress: Double?

    /// 加载状态描述文字
    private(set) var loadingStatus: String?

    /// 当前生成的 token/s 速度
    private(set) var tokensPerSecond: Double = 0

    // MARK: - 私有属性

    /// 已加载的模型容器
    private var modelContainer: ModelContainer?

    /// 当前生成任务（用于取消）
    private var generationTask: Task<Void, Never>?

    /// HuggingFace 镜像地址（国内加速）
    /// 设置后所有模型下载走镜像，设为 nil 恢复官方源
    static var huggingFaceMirror: String? {
        didSet {
            if let mirror = huggingFaceMirror {
                setenv("HF_ENDPOINT", mirror, 1)
            } else {
                unsetenv("HF_ENDPOINT")
            }
        }
    }

    // MARK: - 模型加载

    /// 加载指定模型（从 HuggingFace 下载或读取本地缓存）
    /// - Parameter id: HuggingFace 模型 ID，如 "mlx-community/Qwen3-4B-4bit"
    func loadModel(id: String) async {
        // 如果当前已加载同一模型，无需重复加载
        if currentModelId == id, modelContainer != nil, state == .ready {
            return
        }

        state = .loading
        error = nil
        loadProgress = 0
        loadingStatus = "Preparing model..."

        do {
            let configuration = ModelConfiguration(id: id)

            // loadContainer 自动处理下载（含断点续传）和加载
            loadingStatus = "Downloading and loading model..."
            let container = try await LLMModelFactory.shared.loadContainer(
                configuration: configuration
            ) { progress in
                let fraction = progress.fractionCompleted
                let total = progress.totalUnitCount
                Task { @MainActor [weak self] in
                    self?.loadProgress = fraction
                    if total > 0 {
                        self?.loadingStatus = "Loading (\(Int(fraction * 100))%)"
                    }
                }
            }

            modelContainer = container
            currentModelId = id
            state = .ready
            loadProgress = nil
            loadingStatus = nil

            // 持久化上次使用的模型 ID
            UserDefaults.standard.set(id, forKey: "lastUsedModelId")

        } catch {
            self.state = .error(error.localizedDescription)
            self.error = error.localizedDescription
            self.loadProgress = nil
            self.loadingStatus = nil
        }
    }

    // MARK: - 流式聊天

    /// 发送聊天消息，返回流式 token 输出
    /// - Parameter messages: 完整的对话历史
    /// - Returns: 异步字符串流，每个元素是一个 token 片段
    func chat(messages: [ChatMessage]) -> AsyncStream<String> {
        AsyncStream { continuation in
            generationTask = Task { [weak self] in
                guard let self, let container = self.modelContainer else {
                    continuation.finish()
                    return
                }

                self.state = .generating
                self.tokensPerSecond = 0

                do {
                    // 构建 MLX Chat.Message 数组
                    let chatMessages: [Chat.Message] = messages.map { msg in
                        switch msg.role {
                        case .user: .user(msg.content)
                        case .assistant: .assistant(msg.content)
                        case .system: .system(msg.content)
                        }
                    }

                    let userInput = UserInput(chat: chatMessages)

                    // 准备输入（UserInput → LMInput）
                    let lmInput = try await container.prepare(input: userInput)

                    // 生成参数
                    let parameters = GenerateParameters(temperature: 0.7)

                    // 使用 AsyncStream 版本的 generate API
                    let generateStream = try await container.generate(
                        input: lmInput,
                        parameters: parameters
                    )

                    var tokenCount = 0
                    let startTime = Date()

                    for await result in generateStream {
                        if Task.isCancelled { break }

                        // result 包含生成的文本片段
                        if let text = result.chunk {
                            continuation.yield(text)
                            tokenCount += 1
                        }
                    }

                    // 计算 tok/s
                    let elapsed = Date().timeIntervalSince(startTime)
                    if elapsed > 0 {
                        self.tokensPerSecond = Double(tokenCount) / elapsed
                    }
                    self.state = .ready

                } catch {
                    if !Task.isCancelled {
                        self.state = .error(error.localizedDescription)
                        self.error = error.localizedDescription
                    }
                }

                continuation.finish()
            }
        }
    }

    // MARK: - 停止生成

    /// 取消当前正在进行的生成
    func stopGeneration() {
        generationTask?.cancel()
        generationTask = nil
        if state == .generating {
            state = .ready
        }
    }

    // MARK: - 卸载模型

    /// 卸载当前模型，释放内存
    func unloadModel() {
        stopGeneration()
        modelContainer = nil
        currentModelId = nil
        state = .idle
    }
}
