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
            let configuration = ModelConfiguration(id: id)

            let container = try await LLMModelFactory.shared.loadContainer(
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

    // MARK: - Streaming Chat

    /// Send chat messages and return a streaming token output
    /// - Parameter messages: Complete conversation history
    /// - Returns: Async string stream where each element is a token fragment
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
                    // Build MLX Chat.Message array
                    let chatMessages: [Chat.Message] = messages.map { msg in
                        switch msg.role {
                        case .user: .user(msg.content)
                        case .assistant: .assistant(msg.content)
                        case .system: .system(msg.content)
                        }
                    }

                    let userInput = UserInput(chat: chatMessages)

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

                        // result contains the generated text fragment
                        if let text = result.chunk {
                            continuation.yield(text)
                            tokenCount += 1
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
