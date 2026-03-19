//
//  LLMService.swift
//  Klee
//
//  MLX Swift in-process inference service.
//  Handles model loading (from downloaded local files) and streaming generation.
//  Download logic has been separated into DownloadManager.
//
//  Phase C optimizations applied based on oMLX engine_core.py analysis:
//  - Metal pipeline warmup after model load
//  - Tuned GenerateParameters (temperature, prefillStepSize)
//  - KV cache quantization support (kvBits param, disabled by default)
//  - Accurate metrics from mlx-swift-lm's built-in GenerateCompletionInfo
//  - GPU memory limit configuration via MLX Memory API
//

import Foundation
import MLX
import Observation
import MLXLLM
import MLXVLM
@preconcurrency import MLXLMCommon

@Observable
class LLMService {

    // MARK: - Observable Properties

    /// Current LLM engine state
    private(set) var state: LLMState = .idle

    /// ID of the currently loaded model
    private(set) var currentModelId: String?

    /// Most recent error message
    private(set) var error: String?

    /// Model loading progress (0.0 ~ 1.0), only valid during weight loading
    private(set) var loadProgress: Double?

    /// Loading status description text
    private(set) var loadingStatus: String?

    /// Current generation speed in tokens/second
    private(set) var tokensPerSecond: Double = 0

    // MARK: - Detailed Performance Metrics

    /// Time to first token (TTFT / prefill) in milliseconds
    private(set) var lastPrefillTimeMs: Double = 0

    /// Decode speed in tokens/second (excludes prefill time)
    private(set) var lastDecodeTokensPerSec: Double = 0

    /// Total tokens generated in the last run
    private(set) var lastTotalTokens: Int = 0

    /// Total generation wall-clock time in milliseconds
    private(set) var lastTotalTimeMs: Double = 0

    // MARK: - Private Properties

    /// The loaded model container
    private var modelContainer: ModelContainer?

    /// Current generation task (for cancellation)
    private var generationTask: Task<Void, Never>?

    /// Whether the Metal pipeline has been warmed up for the current model.
    /// Reset when a new model is loaded.
    private var isMetalWarmedUp = false

    /// HuggingFace mirror URL (for acceleration in China)
    /// When set, all model downloads use the mirror; set to nil to restore the official source
    static var huggingFaceMirror: String? {
        didSet {
            if let mirror = huggingFaceMirror {
                setenv("HF_ENDPOINT", mirror, 1)
            } else {
                unsetenv("HF_ENDPOINT")
            }
        }
    }

    // MARK: - Generation Parameters

    // Optimization: tuned parameters based on oMLX engine defaults and mlx-swift-lm analysis.
    // - temperature 0.6: mlx-swift-lm default, uses CategoricalSampler (efficient)
    // - topP 1.0 (default): avoids TopPSampler overhead (softmax+cumsum+sort per token).
    //   CategoricalSampler is already selected by temperature > 0 alone.
    // - prefillStepSize 512: matches oMLX scheduler default, processes prompt in chunks
    // - repetitionPenalty nil: no LogitProcessor created → zero per-token processing overhead
    // - kvBits nil: KV cache quantization disabled by default. Enable (e.g., 8) for
    //   long-context scenarios to reduce memory bandwidth. Quality tradeoff is minimal
    //   at 8-bit but measurable at 4-bit.

    /// Build optimized GenerateParameters for inference.
    /// - Parameter kvBits: Optional KV cache quantization bits (nil = no quantization, 4 or 8 typical)
    private func makeGenerateParameters(kvBits: Int? = nil) -> GenerateParameters {
        GenerateParameters(
            kvBits: kvBits,
            kvGroupSize: 64,
            temperature: 0.6,
            prefillStepSize: 512
        )
    }

    // MARK: - GPU Memory Configuration

    /// Configure the MLX memory cache limit based on available system resources.
    /// Optimization: oMLX engine_core.py keeps Metal resources alive by managing memory carefully.
    /// On Apple Silicon, the GPU shares unified memory with the system.
    /// Setting an appropriate cache limit prevents excessive memory pressure and page faults
    /// that can degrade decode throughput.
    private func configureGPUMemoryLimit() {
        // Set MLX memory cache limit to allow the framework to keep recently freed
        // GPU buffers in cache for reuse, reducing allocation overhead during decode.
        // On M4 Pro (24GB), 75% of recommendedMaxWorkingSet is a conservative choice
        // that leaves headroom for the OS and other apps.
        if let recommended = GPU.maxRecommendedWorkingSetBytes() {
            // Use 75% of recommended as cache limit
            let limit = Int(Double(recommended) * 0.75)
            Memory.cacheLimit = limit
            print("[LLMService] Memory cache limit set to \(limit / 1_048_576)MB (recommended working set: \(recommended / 1_048_576)MB)")
        }
    }

    // MARK: - Metal Pipeline Warmup

    /// Run a minimal generation pass to warm up Metal shader compilation and memory allocators.
    /// Optimization: oMLX's engine_core.py keeps the BatchGenerator and Metal stream persistent
    /// between requests, so shaders stay compiled. In Klee, each generation creates a fresh
    /// TokenIterator. Running a 1-token warmup after model load ensures Metal pipelines are
    /// compiled and cached before the user's first real query.
    /// - Parameter container: The loaded model container
    private func warmupMetalPipeline(_ container: ModelContainer) async {
        guard !isMetalWarmedUp else { return }

        do {
            let warmupMessages: [Chat.Message] = [
                .system("You are a helpful assistant."),
                .user("Hi"),
            ]
            let warmupInput = UserInput(chat: warmupMessages)
            let lmInput = try await container.prepare(input: warmupInput)

            // Use a minimal generation: maxTokens = 2 forces a quick prefill + 2 decode steps.
            // This triggers Metal shader compilation for the model's architecture.
            let params = GenerateParameters(maxTokens: 2, temperature: 0.0, prefillStepSize: 512)
            let stream = try await container.generate(input: lmInput, parameters: params)

            // Drain the stream to ensure Metal kernels are fully compiled
            for await _ in stream {}

            isMetalWarmedUp = true
            print("[LLMService] Metal pipeline warmup complete")
        } catch {
            // Warmup failure is non-fatal — first real generation will just be slightly slower
            print("[LLMService] Metal warmup failed (non-fatal): \(error.localizedDescription)")
        }
    }

    // MARK: - Use Downloaded Container

    /// Directly set a loaded ModelContainer (provided by DownloadManager)
    /// - Parameters:
    ///   - container: The fully loaded model container
    ///   - id: Model ID
    func setLoadedContainer(_ container: ModelContainer, id: String) {
        modelContainer = container
        currentModelId = id
        state = .ready
        loadProgress = nil
        loadingStatus = nil
        error = nil
        isMetalWarmedUp = false

        // Persist the last used model ID
        UserDefaults.standard.set(id, forKey: "lastUsedModelId")

        // Configure GPU memory and warm up Metal pipeline in background
        configureGPUMemoryLimit()
        Task {
            await warmupMetalPipeline(container)
        }
    }

    // MARK: - Load Local Downloaded Model

    /// Load a specified model (loads from local cache only, does not trigger download)
    /// If the model is not downloaded, it will attempt to download (for backward compatibility)
    /// - Parameter id: HuggingFace model ID
    func loadModel(id: String) async {
        // Skip if the same model is already loaded
        if currentModelId == id, modelContainer != nil, state == .ready {
            return
        }

        state = .loading
        error = nil
        loadProgress = 0
        loadingStatus = "Loading model..."

        do {
            // If the model is already cached locally, load directly from disk to avoid
            // unnecessary network requests (Hub normally fetches remote hashes even for cached models)
            let localURL = localCacheURL(for: id)
            let isCachedLocally = FileManager.default.fileExists(atPath: localURL.path)
            let configuration = isCachedLocally
                ? ModelConfiguration(directory: localURL)
                : ModelConfiguration(id: id)

            // Use the unified loadModelContainer() which tries MLXVLM first, then MLXLLM.
            // This ensures VLM models (e.g. Qwen 3.5) are loaded with vision support.
            let container = try await loadModelContainer(
                configuration: configuration
            ) { [weak self] progress in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    self.loadProgress = progress.fractionCompleted
                    let completed = progress.completedUnitCount
                    let total = progress.totalUnitCount
                    if total > 0 {
                        self.loadingStatus = "Loading \(completed)/\(total) files..."
                    }
                }
            }

            modelContainer = container
            currentModelId = id
            state = .ready
            loadProgress = nil
            loadingStatus = nil
            isMetalWarmedUp = false

            // Persist the last used model ID
            UserDefaults.standard.set(id, forKey: "lastUsedModelId")

            // Optimization: configure GPU memory and warm up Metal pipeline
            configureGPUMemoryLimit()
            await warmupMetalPipeline(container)

        } catch {
            self.state = .error(error.localizedDescription)
            self.error = error.localizedDescription
            self.loadProgress = nil
            self.loadingStatus = nil
        }
    }

    /// Local cache directory for a model: ~/Library/Caches/models/{org}/{model-name}/
    private func localCacheURL(for id: String) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("models/\(id)")
    }

    // MARK: - Streaming Chat

    /// Send chat messages with optional tool definitions and return a streaming output.
    /// Each element is either a text chunk or a native tool call detected by the model.
    /// - Parameters:
    ///   - messages: Complete conversation history
    ///   - tools: Optional tool specifications for native tool calling
    ///   - images: Optional images to attach to the latest user message (for VLM inference)
    /// - Returns: Async stream of GenerationChunk
    func chat(messages: [ChatMessage], tools: [[String: any Sendable]]? = nil, images: [UserInput.Image] = []) -> AsyncStream<GenerationChunk> {
        AsyncStream { continuation in
            generationTask = Task { [weak self] in
                guard let self, let container = self.modelContainer else {
                    continuation.finish()
                    return
                }

                self.state = .generating
                self.tokensPerSecond = 0
                self.lastPrefillTimeMs = 0
                self.lastDecodeTokensPerSec = 0
                self.lastTotalTokens = 0
                self.lastTotalTimeMs = 0

                do {
                    // Build MLX Chat.Message array, attaching images to the last user message
                    let chatMessages: [Chat.Message] = messages.enumerated().map { index, msg in
                        let isLastUser = (msg.role == .user && index == messages.lastIndex(where: { $0.role == .user }))
                        switch msg.role {
                        case .user:
                            return .user(msg.content, images: isLastUser ? images : [])
                        case .assistant:
                            return .assistant(msg.content)
                        case .system:
                            return .system(msg.content)
                        }
                    }

                    let userInput = UserInput(chat: chatMessages, tools: tools)

                    // Prepare input (UserInput -> LMInput)
                    let lmInput = try await container.prepare(input: userInput)

                    // Optimization: use tuned GenerateParameters instead of hardcoded values.
                    // See makeGenerateParameters() for details on each parameter choice.
                    let parameters = makeGenerateParameters()

                    // Use the AsyncStream version of the generate API.
                    // Note: mlx-swift-lm's generate() already emits a .info(GenerateCompletionInfo)
                    // event at the end of the stream with accurate timing from the TokenIterator.
                    // We use this for metrics instead of manual Date() timing which includes
                    // async scheduling overhead.
                    let generateStream = try await container.generate(
                        input: lmInput,
                        parameters: parameters
                    )

                    // Optimization: track metrics from mlx-swift-lm's built-in GenerateCompletionInfo
                    // which measures timing inside the synchronous TokenIterator loop, giving more
                    // accurate decode speed than external Date() measurements that include
                    // AsyncStream/Task scheduling overhead.
                    var tokenCount = 0
                    var completionInfo: GenerateCompletionInfo?

                    for await result in generateStream {
                        if Task.isCancelled { break }

                        if let text = result.chunk {
                            continuation.yield(.text(text))
                            tokenCount += 1
                        }
                        if let toolCall = result.toolCall {
                            continuation.yield(.toolCall(toolCall))
                        }
                        // Capture the completion info emitted at the end of the stream.
                        // mlx-swift-lm measures promptTime (prefill) and generateTime (decode)
                        // internally with high precision.
                        if let info = result.info {
                            completionInfo = info
                        }
                    }

                    // Update metrics from mlx-swift-lm's internal measurements when available
                    if !Task.isCancelled {
                        if let info = completionInfo {
                            // Use mlx-swift-lm's accurate internal timing.
                            // promptTime includes both the model.prepare() windowed prefill
                            // (promptPrefillTime) and the first token generation step.
                            self.lastPrefillTimeMs = info.promptTime * 1000
                            self.lastTotalTokens = info.generationTokenCount
                            self.lastDecodeTokensPerSec = info.tokensPerSecond
                            self.lastTotalTimeMs = (info.promptTime + info.generateTime) * 1000

                            // Overall tok/s (kept for backward compatibility)
                            let totalTime = info.promptTime + info.generateTime
                            self.tokensPerSecond = totalTime > 0
                                ? Double(info.generationTokenCount) / totalTime : 0

                            print("[LLMService] TTFT: \(String(format: "%.0f", info.promptTime * 1000))ms | Decode: \(String(format: "%.1f", info.tokensPerSecond)) tok/s (\(info.generationTokenCount) tokens in \(String(format: "%.2f", info.generateTime))s) | Prompt: \(info.promptTokenCount) tokens at \(String(format: "%.0f", info.promptTokensPerSecond)) tok/s")
                        } else {
                            // Fallback: no completion info (stream was cancelled or error)
                            self.lastTotalTokens = tokenCount
                            print("[LLMService] Generation ended without completion info (tokens: \(tokenCount))")
                        }
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

    // MARK: - Stop Generation

    /// Cancel the current ongoing generation
    func stopGeneration() {
        generationTask?.cancel()
        generationTask = nil
        if state == .generating {
            state = .ready
        }
    }

    // MARK: - Unload Model

    /// Unload the current model and free memory
    func unloadModel() {
        stopGeneration()
        modelContainer = nil
        currentModelId = nil
        state = .idle
        isMetalWarmedUp = false
    }
}
