//
//  LLMService.swift
//  Klee
//
//  MLX Swift in-process inference service.
//  Handles model loading (from downloaded local files) and streaming generation.
//  Download logic has been separated into DownloadManager.
//

import Foundation
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

    // MARK: - Private Properties

    /// The loaded model container
    private var modelContainer: ModelContainer?

    /// Current generation task (for cancellation)
    private var generationTask: Task<Void, Never>?

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

        // Persist the last used model ID
        UserDefaults.standard.set(id, forKey: "lastUsedModelId")
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

            // Persist the last used model ID
            UserDefaults.standard.set(id, forKey: "lastUsedModelId")

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

                    // Generation parameters
                    let parameters = GenerateParameters(temperature: 0.7)

                    // Use the AsyncStream version of the generate API
                    let generateStream = try await container.generate(
                        input: lmInput,
                        parameters: parameters
                    )

                    var tokenCount = 0
                    let startTime = Date()

                    for await result in generateStream {
                        if Task.isCancelled { break }

                        if let text = result.chunk {
                            continuation.yield(.text(text))
                            tokenCount += 1
                        }
                        if let toolCall = result.toolCall {
                            continuation.yield(.toolCall(toolCall))
                        }
                    }

                    // Calculate tok/s
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
    }
}
