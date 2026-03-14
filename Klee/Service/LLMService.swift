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
import MLXVLM
@preconcurrency import MLXLMCommon

/// A single piece of generation output — either a text chunk or a tool call.
enum GenerationChunk: Sendable {
    case text(String)
    case toolCall(ToolCall)
}

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
            // Patch missing chat_template before loading (mlx-vlm conversions strip it)
            await Self.ensureChatTemplate(for: id)

            // If the model is already cached locally, load directly from disk to avoid
            // unnecessary network requests (Hub normally fetches remote hashes even for cached models)
            let localURL = Self.localCacheURL(for: id)
            let isCachedLocally = FileManager.default.fileExists(atPath: localURL.path)
            let configuration = isCachedLocally
                ? ModelConfiguration(directory: localURL)
                : ModelConfiguration(id: id)

            let progressHandler: @Sendable (Progress) -> Void = { [weak self] progress in
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

            let container = try await VLMModelFactory.shared.loadContainer(
                configuration: configuration,
                progressHandler: progressHandler
            )

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
    /// Matches the Hub library's default download path on macOS.
    static func localCacheURL(for id: String) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("models/\(id)")
    }

    // MARK: - Chat Template Auto-Fix

    /// Ensure the cached model has a chat_template in its tokenizer_config.json.
    /// Many mlx-community models converted with mlx-vlm strip the chat_template,
    /// which breaks tool calling. This method detects the issue and fetches the
    /// template from the original upstream model.
    /// - Returns: `true` if the template was patched, `false` if already present or not applicable.
    @discardableResult
    static func ensureChatTemplate(for id: String) async -> Bool {
        let localURL = localCacheURL(for: id)
        let tokenizerConfigURL = localURL.appendingPathComponent("tokenizer_config.json")

        guard FileManager.default.fileExists(atPath: tokenizerConfigURL.path),
              let data = try? Data(contentsOf: tokenizerConfigURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return false }

        // Already has chat_template — nothing to do
        if json["chat_template"] != nil { return false }

        // Infer the original upstream model ID from the mlx-community model ID
        // e.g. "mlx-community/Qwen3.5-35B-A3B-4bit" -> "Qwen/Qwen3.5-35B-A3B"
        guard let upstreamId = inferUpstreamModelId(from: id) else {
            print("[LLMService] Cannot infer upstream model for '\(id)', skipping chat_template fix")
            return false
        }

        print("[LLMService] Missing chat_template, fetching from '\(upstreamId)'...")

        let endpoint = huggingFaceMirror ?? "https://huggingface.co"
        let urlString = "\(endpoint)/\(upstreamId)/resolve/main/tokenizer_config.json"
        guard let url = URL(string: urlString) else { return false }

        do {
            let (remoteData, _) = try await URLSession.shared.data(from: url)
            guard let remoteJson = try JSONSerialization.jsonObject(with: remoteData) as? [String: Any],
                  let chatTemplate = remoteJson["chat_template"]
            else {
                print("[LLMService] Upstream tokenizer_config.json has no chat_template either")
                return false
            }

            // Merge chat_template into the local config
            var patched = json
            patched["chat_template"] = chatTemplate
            let patchedData = try JSONSerialization.data(withJSONObject: patched, options: [.prettyPrinted, .sortedKeys])
            try patchedData.write(to: tokenizerConfigURL)
            print("[LLMService] chat_template patched successfully from '\(upstreamId)'")
            return true
        } catch {
            print("[LLMService] Failed to fetch chat_template: \(error.localizedDescription)")
            return false
        }
    }

    /// Infer the original HuggingFace model ID from an mlx-community model ID.
    /// Maps known org prefixes and strips quantization suffixes.
    private static func inferUpstreamModelId(from id: String) -> String? {
        // Only handle mlx-community models
        guard id.hasPrefix("mlx-community/") else { return nil }
        var name = String(id.dropFirst("mlx-community/".count))

        // Strip common quantization suffixes
        let suffixes = ["-MLX-4bit", "-MLX-8bit", "-4bit", "-8bit", "-nvfp4", "-fp16"]
        for suffix in suffixes {
            if name.hasSuffix(suffix) {
                name = String(name.dropLast(suffix.count))
                break
            }
        }

        // Map known model families to their upstream orgs
        let orgMappings: [(prefix: String, org: String)] = [
            ("Qwen", "Qwen"),
            ("DeepSeek", "deepseek-ai"),
            ("gemma", "google"),
            ("Gemma", "google"),
            ("Llama", "meta-llama"),
            ("Mistral", "mistralai"),
            ("GLM", "zai-org"),
            ("Kimi", "moonshotai"),
        ]

        for mapping in orgMappings {
            if name.hasPrefix(mapping.prefix) {
                return "\(mapping.org)/\(name)"
            }
        }

        return nil
    }

    // MARK: - Streaming Chat

    /// Send chat messages with optional tool definitions and return a streaming output.
    /// Each element is either a text chunk or a native tool call detected by the model.
    /// - Parameters:
    ///   - messages: Complete conversation history
    ///   - tools: Optional tool specifications for native tool calling
    /// - Returns: Async stream of GenerationChunk
    func chat(messages: [ChatMessage], tools: [[String: any Sendable]]? = nil) -> AsyncStream<GenerationChunk> {
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
