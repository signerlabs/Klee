//
//  DownloadManager.swift
//  Klee
//
//  Model download manager: downloads files directly via URLSession HTTP requests,
//  bypassing HuggingFace's Xet protocol which causes 0-byte safetensors on macOS.
//
//  Download phase: fetches file list from HF API, then downloads each file via
//  `resolve/main/{filename}?download=true` with resume support (.incomplete files).
//
//  Load phase: once all files are downloaded, loads the model from the local directory
//  using `loadModelContainer(configuration: ModelConfiguration(directory:))`.
//

import Foundation
import Observation
import MLXLLM
@preconcurrency import MLXLMCommon

// MARK: - Download Status

/// Download status for a single model
enum DownloadStatus: Equatable, Sendable {
    case idle
    case downloading
    case paused
    case completed
    case failed(String)
    case cancelling

    nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle), (.downloading, .downloading), (.paused, .paused),
             (.completed, .completed), (.cancelling, .cancelling): return true
        case (.failed(let a), .failed(let b)): return a == b
        default: return false
        }
    }
}

// MARK: - Download Progress

/// Download progress snapshot (for UI display)
struct DownloadProgress: Sendable {
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

// MARK: - HF API File Entry

/// A file entry returned by the HuggingFace API tree endpoint
private struct HFFileEntry: Decodable {
    let type: String      // "file" or "directory"
    let path: String      // e.g. "config.json", "model-00001-of-00002.safetensors"
    let size: Int64?      // file size in bytes (nil for directories)
}

// MARK: - DelegateContext

/// Mutable state accessed from URLSessionDownloadDelegate callbacks on background threads.
/// Stored as a `nonisolated let` reference so delegate methods can read/write it
/// without crossing the @MainActor boundary imposed by @Observable.
private final class DelegateContext: @unchecked Sendable {
    nonisolated(unsafe) var continuation: CheckedContinuation<(URL, URLResponse), any Error>?
    nonisolated(unsafe) var stagingDirectory: URL = FileManager.default
        .temporaryDirectory.appendingPathComponent("klee-download-staging")
    nonisolated(unsafe) var speedBytesAccumulator: Int64 = 0
    nonisolated(unsafe) var lastSpeedUpdate: Date = .now
    nonisolated(unsafe) var lastReportedTotalWritten: Int64 = 0
    nonisolated(unsafe) var filePreviouslyDownloaded: Int64 = 0
    nonisolated(unsafe) var fileResumeOffset: Int64 = 0
    nonisolated(unsafe) var fileTotalBytes: Int64 = 0
}

// MARK: - DownloadManager

@Observable
class DownloadManager: NSObject, URLSessionDownloadDelegate {

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

    /// Active URLSessionDownloadTask reference (for cancellation)
    private var activeDownloadTask: URLSessionDownloadTask?

    /// Dedicated URLSession with delegate for progress callbacks
    private var downloadSession: URLSession = .shared

    nonisolated override init() {
        super.init()
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForResource = 3600
        downloadSession = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        try? FileManager.default.createDirectory(at: ctx.stagingDirectory, withIntermediateDirectories: true)
    }

    /// Mutable state for URLSessionDownloadDelegate callbacks (background thread access).
    /// `nonisolated let` on a reference type bypasses @Observable's MainActor tracking.
    nonisolated private let ctx = DelegateContext()

    /// Files that must be downloaded for model loading
    private static let requiredExtensions: Set<String> = [
        ".safetensors",
        ".json",
        ".txt",
        ".py",       // tokenizer scripts
        ".model",    // sentencepiece models
        ".tiktoken"  // tiktoken vocab
    ]

    /// Files to always include by exact name (regardless of extension)
    private static let requiredFileNames: Set<String> = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "preprocessor_config.json",
        "processor_config.json",
        "video_preprocessor_config.json",
        "vocab.json",
        "merges.txt",
        "special_tokens_map.json",
        "generation_config.json",
        "chat_template.json",
        "added_tokens.json",
        "tokenizer.model"
    ]

    /// File patterns to exclude
    private static let excludedPatterns: [String] = [
        "README.md",
        "LICENSE",
        ".gitattributes",
        ".gitignore",
        "original/",
        "onnx/",
        "flax_model",
        "tf_model",
        "pytorch_model",
        "model.bin",
        "consolidated"
    ]

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
        let files = try await fetchFileList(modelId: modelId)
        let filteredFiles = filterFiles(files)

        guard !filteredFiles.isEmpty else {
            throw AppError.downloadFailed("No downloadable files found for model \(modelId)")
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
        ctx.speedBytesAccumulator = 0
        ctx.lastSpeedUpdate = .now

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
            let bytesForFile = try await downloadFile(
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
                throw AppError.downloadFailed("Missing safetensors file: \(file.path)")
            }
            let attrs = try fm.attributesOfItem(atPath: fileURL.path)
            let size = attrs[.size] as? Int64 ?? 0
            if size == 0 {
                throw AppError.downloadFailed("Downloaded safetensors file is 0 bytes: \(file.path)")
            }
        }

        // Step 4: Patch tokenizer_config.json if chat_template is missing
        await patchTokenizerConfigIfNeeded(modelId: modelId, localURL: localDir)
    }

    /// Fetch file list from HuggingFace API
    private func fetchFileList(modelId: String) async throws -> [HFFileEntry] {
        let endpoint = Self.resolvedEndpoint()
        let urlString = "\(endpoint)/api/models/\(modelId)/tree/main"

        guard let url = URL(string: urlString) else {
            throw AppError.downloadFailed("Invalid API URL: \(urlString)")
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppError.downloadFailed("Invalid response from HuggingFace API")
        }

        guard httpResponse.statusCode == 200 else {
            throw AppError.downloadFailed("HuggingFace API returned status \(httpResponse.statusCode)")
        }

        // Try decoding as array first; some repos use paginated results
        let entries = try JSONDecoder().decode([HFFileEntry].self, from: data)

        // If there are directories, recursively fetch their contents
        var allFiles = entries.filter { $0.type == "file" }
        let directories = entries.filter { $0.type == "directory" }

        for dir in directories {
            let subFiles = try await fetchSubdirectoryFiles(modelId: modelId, path: dir.path)
            allFiles.append(contentsOf: subFiles)
        }

        return allFiles
    }

    /// Recursively fetch files from a subdirectory
    private func fetchSubdirectoryFiles(modelId: String, path: String) async throws -> [HFFileEntry] {
        let endpoint = Self.resolvedEndpoint()
        let urlString = "\(endpoint)/api/models/\(modelId)/tree/main/\(path)"

        guard let url = URL(string: urlString) else { return [] }

        var request = URLRequest(url: url)
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            return []
        }

        let entries = try JSONDecoder().decode([HFFileEntry].self, from: data)
        var files = entries.filter { $0.type == "file" }
        let subdirs = entries.filter { $0.type == "directory" }

        for subdir in subdirs {
            let subFiles = try await fetchSubdirectoryFiles(modelId: modelId, path: subdir.path)
            files.append(contentsOf: subFiles)
        }

        return files
    }

    /// Filter files to only include those needed for model loading
    private func filterFiles(_ files: [HFFileEntry]) -> [HFFileEntry] {
        files.filter { file in
            let name = (file.path as NSString).lastPathComponent
            let lowercasePath = file.path.lowercased()

            // Exclude unwanted files
            for pattern in Self.excludedPatterns {
                if lowercasePath.contains(pattern.lowercased()) {
                    return false
                }
            }

            // Include by exact name
            if Self.requiredFileNames.contains(name) {
                return true
            }

            // Include by extension
            for ext in Self.requiredExtensions {
                if name.hasSuffix(ext) {
                    return true
                }
            }

            return false
        }
    }

    /// Download a single file with resume support using URLSessionDownloadTask.
    /// Returns the number of bytes this file occupies (resumeOffset + newly downloaded).
    private func downloadFile(
        modelId: String,
        remotePath: String,
        to localURL: URL,
        expectedSize: Int64,
        totalBytes: Int64,
        previouslyDownloaded: Int64
    ) async throws -> Int64 {
        let endpoint = Self.resolvedEndpoint()
        // URL-encode the path components (but not the slashes)
        let encodedPath = remotePath.split(separator: "/").map {
            $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0)
        }.joined(separator: "/")
        let urlString = "\(endpoint)/\(modelId)/resolve/main/\(encodedPath)?download=true"

        guard let url = URL(string: urlString) else {
            throw AppError.downloadFailed("Invalid download URL for \(remotePath)")
        }

        let incompleteURL = localURL.appendingPathExtension("incomplete")
        let fm = FileManager.default

        // Check for existing incomplete file (for resume)
        var resumeOffset: Int64 = 0
        if fm.fileExists(atPath: incompleteURL.path) {
            let attrs = try fm.attributesOfItem(atPath: incompleteURL.path)
            resumeOffset = attrs[.size] as? Int64 ?? 0
        }

        // If already fully downloaded (complete file exists), return expected size
        if fm.fileExists(atPath: localURL.path) {
            if let attrs = try? fm.attributesOfItem(atPath: localURL.path),
               let size = attrs[.size] as? Int64, size == expectedSize, expectedSize > 0 {
                return expectedSize
            }
            // Existing file has wrong size, re-download
            try? fm.removeItem(at: localURL)
        }

        // Build request with Range header for resume
        var request = URLRequest(url: url)
        request.timeoutInterval = 600
        if resumeOffset > 0 {
            request.setValue("bytes=\(resumeOffset)-", forHTTPHeaderField: "Range")
        }

        // Set up delegate context for progress reporting
        ctx.speedBytesAccumulator = 0
        ctx.lastSpeedUpdate = .now
        ctx.lastReportedTotalWritten = 0
        ctx.filePreviouslyDownloaded = previouslyDownloaded
        ctx.fileResumeOffset = resumeOffset
        ctx.fileTotalBytes = totalBytes

        // Use URLSessionDownloadTask via continuation
        // (delegate moves temp file to staging before system deletes it)
        let (stagedURL, response) = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<(URL, URLResponse), any Error>) in
            self.ctx.continuation = continuation
            let task = self.downloadSession.downloadTask(with: request)
            self.activeDownloadTask = task
            task.resume()
        }

        // Clear active task reference after completion
        activeDownloadTask = nil

        guard let httpResponse = response as? HTTPURLResponse else {
            try? fm.removeItem(at: stagedURL)
            throw AppError.downloadFailed("Invalid response for \(remotePath)")
        }

        // Handle response codes
        switch httpResponse.statusCode {
        case 200:
            // Full content — server ignored Range or fresh download
            resumeOffset = 0
            try? fm.removeItem(at: incompleteURL)
            // Move staged file to .incomplete
            try fm.moveItem(at: stagedURL, to: incompleteURL)

        case 206:
            // Partial content — stream-append staged file to .incomplete in chunks
            // (avoid Data(contentsOf:) which loads gigabytes into memory)
            if !fm.fileExists(atPath: incompleteURL.path) {
                fm.createFile(atPath: incompleteURL.path, contents: nil)
            }
            let writeHandle = try FileHandle(forWritingTo: incompleteURL)
            let readHandle = try FileHandle(forReadingFrom: stagedURL)
            do {
                try writeHandle.seekToEnd()
                let chunkSize = 4 * 1024 * 1024 // 4 MB
                while true {
                    let chunk = readHandle.readData(ofLength: chunkSize)
                    if chunk.isEmpty { break }
                    try writeHandle.write(contentsOf: chunk)
                }
                try writeHandle.close()
                try readHandle.close()
            } catch {
                try? writeHandle.close()
                try? readHandle.close()
                throw error
            }
            try? fm.removeItem(at: stagedURL)

        case 416:
            // Range not satisfiable — .incomplete is stale, delete and retry
            try? fm.removeItem(at: incompleteURL)
            try? fm.removeItem(at: stagedURL)
            return try await downloadFile(
                modelId: modelId,
                remotePath: remotePath,
                to: localURL,
                expectedSize: expectedSize,
                totalBytes: totalBytes,
                previouslyDownloaded: previouslyDownloaded
            )

        default:
            try? fm.removeItem(at: stagedURL)
            throw AppError.downloadFailed("HTTP \(httpResponse.statusCode) downloading \(remotePath)")
        }

        // Validate downloaded size
        let finalAttrs = try fm.attributesOfItem(atPath: incompleteURL.path)
        let bytesWritten = finalAttrs[.size] as? Int64 ?? 0

        if expectedSize > 0 && bytesWritten != expectedSize {
            // Size mismatch — keep .incomplete for future resume attempt
            throw AppError.downloadFailed(
                "Size mismatch for \(remotePath): expected \(expectedSize), got \(bytesWritten)"
            )
        }

        // Rename .incomplete to final path
        try? fm.removeItem(at: localURL)
        try fm.moveItem(at: incompleteURL, to: localURL)

        return bytesWritten
    }

    // MARK: - URLSessionDownloadDelegate

    /// Progress callback from URLSession — called on background thread
    nonisolated func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        // Calculate speed from delta since last report
        let delta = totalBytesWritten - ctx.lastReportedTotalWritten
        ctx.lastReportedTotalWritten = totalBytesWritten
        ctx.speedBytesAccumulator += delta

        let now = Date.now
        let elapsed = now.timeIntervalSince(ctx.lastSpeedUpdate)

        var currentSpeed: Double? = nil
        if elapsed >= 0.5 {
            currentSpeed = Double(ctx.speedBytesAccumulator) / elapsed
            ctx.speedBytesAccumulator = 0
            ctx.lastSpeedUpdate = now
        }

        // Overall progress = (previous files + resume offset + this file's written) / total
        let overallDownloaded = ctx.filePreviouslyDownloaded + ctx.fileResumeOffset + totalBytesWritten
        let total = ctx.fileTotalBytes

        Task { @MainActor [weak self, currentSpeed] in
            guard let self, self.status == .downloading else { return }
            if total > 0 {
                self.progress.fractionCompleted = Double(overallDownloaded) / Double(total) * 0.95
            }
            if let speed = currentSpeed {
                self.progress.speed = speed
            }
        }
    }

    /// Called when download finishes writing to a temp file.
    /// Must move the file immediately — system deletes it after this method returns.
    nonisolated func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        let stagedFile = ctx.stagingDirectory.appendingPathComponent(UUID().uuidString)
        do {
            try FileManager.default.moveItem(at: location, to: stagedFile)
            if let response = downloadTask.response {
                ctx.continuation?.resume(returning: (stagedFile, response))
            } else {
                ctx.continuation?.resume(throwing: AppError.downloadFailed("No response from download task"))
            }
        } catch {
            ctx.continuation?.resume(throwing: error)
        }
        ctx.continuation = nil
    }

    /// Called when the download task completes with an error (network failure, cancellation, etc.)
    nonisolated func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: (any Error)?
    ) {
        // Only handle error cases — success is handled in didFinishDownloadingTo
        if let error {
            ctx.continuation?.resume(throwing: error)
            ctx.continuation = nil
        }
    }

    // MARK: - Helpers

    /// Resolved HuggingFace endpoint (mirror or official)
    private static func resolvedEndpoint() -> String {
        if let mirror = LLMService.huggingFaceMirror {
            return mirror
        }
        return "https://huggingface.co"
    }

    /// Model cache directory: ~/Library/Caches/models/{org}/{model-name}/
    private func cacheDirectory(for id: String) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("models/\(id)")
    }

    private func cancelCurrentTask() {
        activeDownloadTask?.cancel()
        activeDownloadTask = nil
        downloadTask?.cancel()
        downloadTask = nil
    }

    // MARK: - Tokenizer Config Patching

    /// Standard Qwen chat template used as fallback when the model's
    /// tokenizer_config.json is missing a chat_template field.
    /// Supports Qwen3.5 thinking mode, tool calling, and vision content.
    private static let qwenChatTemplate: String = #"""
{%- set image_count = namespace(value=0) %}
{%- set video_count = namespace(value=0) %}
{%- macro render_content(content, do_vision_count, is_system_content=false) %}
    {%- if content is string %}
        {{- content }}
    {%- elif content is iterable and content is not mapping %}
        {%- for item in content %}
            {%- if 'image' in item or 'image_url' in item or item.type == 'image' %}
                {%- if is_system_content %}
                    {{- raise_exception('System message cannot contain images.') }}
                {%- endif %}
                {%- if do_vision_count %}
                    {%- set image_count.value = image_count.value + 1 %}
                {%- endif %}
                {%- if add_vision_id %}
                    {{- 'Picture ' ~ image_count.value ~ ': ' }}
                {%- endif %}
                {{- '<|vision_start|><|image_pad|><|vision_end|>' }}
            {%- elif 'video' in item or item.type == 'video' %}
                {%- if is_system_content %}
                    {{- raise_exception('System message cannot contain videos.') }}
                {%- endif %}
                {%- if do_vision_count %}
                    {%- set video_count.value = video_count.value + 1 %}
                {%- endif %}
                {%- if add_vision_id %}
                    {{- 'Video ' ~ video_count.value ~ ': ' }}
                {%- endif %}
                {{- '<|vision_start|><|video_pad|><|vision_end|>' }}
            {%- elif 'text' in item %}
                {{- item.text }}
            {%- else %}
                {{- raise_exception('Unexpected item type in content.') }}
            {%- endif %}
        {%- endfor %}
    {%- elif content is none or content is undefined %}
        {{- '' }}
    {%- else %}
        {{- raise_exception('Unexpected content type.') }}
    {%- endif %}
{%- endmacro %}
{%- if not messages %}
    {{- raise_exception('No messages provided.') }}
{%- endif %}
{%- if tools and tools is iterable and tools is not mapping %}
    {{- '<|im_start|>system\n' }}
    {{- "# Tools\n\nYou have access to the following functions:\n\n<tools>" }}
    {%- for tool in tools %}
        {{- "\n" }}
        {{- tool | tojson }}
    {%- endfor %}
    {{- "\n</tools>" }}
    {{- '\n\nIf you choose to call a function ONLY reply in the following format with NO suffix:\n\n<tool_call>\n<function=example_function_name>\n<parameter=example_parameter_1>\nvalue_1\n</parameter>\n<parameter=example_parameter_2>\nThis is the value for the second parameter\nthat can span\nmultiple lines\n</parameter>\n</function>\n</tool_call>\n\n<IMPORTANT>\nReminder:\n- Function calls MUST follow the specified format: an inner <function=...></function> block must be nested within <tool_call></tool_call> XML tags\n- Required parameters MUST be specified\n- You may provide optional reasoning for your function call in natural language BEFORE the function call, but NOT after\n- If there is no function call available, answer the question like normal with your current knowledge and do not tell the user about function calls\n</IMPORTANT>' }}
    {%- if messages[0].role == 'system' %}
        {%- set content = render_content(messages[0].content, false, true)|trim %}
        {%- if content %}
            {{- '\n\n' + content }}
        {%- endif %}
    {%- endif %}
    {{- '<|im_end|>\n' }}
{%- else %}
    {%- if messages[0].role == 'system' %}
        {%- set content = render_content(messages[0].content, false, true)|trim %}
        {{- '<|im_start|>system\n' + content + '<|im_end|>\n' }}
    {%- endif %}
{%- endif %}
{%- set ns = namespace(multi_step_tool=true, last_query_index=messages|length - 1) %}
{%- for message in messages[::-1] %}
    {%- set index = (messages|length - 1) - loop.index0 %}
    {%- if ns.multi_step_tool and message.role == "user" %}
        {%- set content = render_content(message.content, false)|trim %}
        {%- if not(content.startswith('<tool_response>') and content.endswith('</tool_response>')) %}
            {%- set ns.multi_step_tool = false %}
            {%- set ns.last_query_index = index %}
        {%- endif %}
    {%- endif %}
{%- endfor %}
{%- if ns.multi_step_tool %}
    {{- raise_exception('No user query found in messages.') }}
{%- endif %}
{%- for message in messages %}
    {%- set content = render_content(message.content, true)|trim %}
    {%- if message.role == "system" %}
        {%- if not loop.first %}
            {{- raise_exception('System message must be at the beginning.') }}
        {%- endif %}
    {%- elif message.role == "user" %}
        {{- '<|im_start|>' + message.role + '\n' + content + '<|im_end|>' + '\n' }}
    {%- elif message.role == "assistant" %}
        {%- set reasoning_content = '' %}
        {%- if message.reasoning_content is string %}
            {%- set reasoning_content = message.reasoning_content %}
        {%- else %}
            {%- if '</think>' in content %}
                {%- set reasoning_content = content.split('</think>')[0].rstrip('\n').split('<think>')[-1].lstrip('\n') %}
                {%- set content = content.split('</think>')[-1].lstrip('\n') %}
            {%- endif %}
        {%- endif %}
        {%- set reasoning_content = reasoning_content|trim %}
        {%- if loop.index0 > ns.last_query_index %}
            {{- '<|im_start|>' + message.role + '\n<think>\n' + reasoning_content + '\n</think>\n\n' + content }}
        {%- else %}
            {{- '<|im_start|>' + message.role + '\n' + content }}
        {%- endif %}
        {%- if message.tool_calls and message.tool_calls is iterable and message.tool_calls is not mapping %}
            {%- for tool_call in message.tool_calls %}
                {%- if tool_call.function is defined %}
                    {%- set tool_call = tool_call.function %}
                {%- endif %}
                {%- if loop.first %}
                    {%- if content|trim %}
                        {{- '\n\n<tool_call>\n<function=' + tool_call.name + '>\n' }}
                    {%- else %}
                        {{- '<tool_call>\n<function=' + tool_call.name + '>\n' }}
                    {%- endif %}
                {%- else %}
                    {{- '\n<tool_call>\n<function=' + tool_call.name + '>\n' }}
                {%- endif %}
                {%- if tool_call.arguments is defined %}
                    {%- for args_name, args_value in tool_call.arguments|items %}
                        {{- '<parameter=' + args_name + '>\n' }}
                        {%- set args_value = args_value | tojson | safe if args_value is mapping or (args_value is sequence and args_value is not string) else args_value | string %}
                        {{- args_value }}
                        {{- '\n</parameter>\n' }}
                    {%- endfor %}
                {%- endif %}
                {{- '</function>\n</tool_call>' }}
            {%- endfor %}
        {%- endif %}
        {{- '<|im_end|>\n' }}
    {%- elif message.role == "tool" %}
        {%- if loop.previtem and loop.previtem.role != "tool" %}
            {{- '<|im_start|>user' }}
        {%- endif %}
        {{- '\n<tool_response>\n' }}
        {{- content }}
        {{- '\n</tool_response>' }}
        {%- if not loop.last and loop.nextitem.role != "tool" %}
            {{- '<|im_end|>\n' }}
        {%- elif loop.last %}
            {{- '<|im_end|>\n' }}
        {%- endif %}
    {%- else %}
        {{- raise_exception('Unexpected message role.') }}
    {%- endif %}
{%- endfor %}
{%- if add_generation_prompt %}
    {{- '<|im_start|>assistant\n' }}
    {%- if enable_thinking is defined and enable_thinking is false %}
        {{- '<think>\n\n</think>\n\n' }}
    {%- else %}
        {{- '<think>\n' }}
    {%- endif %}
{%- endif %}
"""#

    /// Fallback chat_template mapping for known model families.
    /// Key is a substring matched against the model ID (case-insensitive).
    private static let fallbackTemplates: [(keyword: String, template: String)] = [
        ("Qwen3.5", qwenChatTemplate),
        ("Qwen3VL", qwenChatTemplate),
    ]

    /// Check and patch tokenizer_config.json if the chat_template field is missing.
    ///
    /// Some mlx-community models omit chat_template, causing inference to fail with
    /// "This tokenizer does not have a chat template". This method:
    /// 1. Reads the local tokenizer_config.json
    /// 2. If chat_template is present, does nothing
    /// 3. Fetches the original repo's tokenizer_config.json from HuggingFace
    /// 4. Falls back to a built-in template table if remote fetch fails
    /// 5. Writes the patched JSON back to disk
    ///
    /// Failures are silently logged — this must never block the main download flow.
    private func patchTokenizerConfigIfNeeded(modelId: String, localURL: URL) async {
        let configURL = localURL.appendingPathComponent("tokenizer_config.json")
        let fm = FileManager.default

        // Guard: file must exist
        guard fm.fileExists(atPath: configURL.path) else {
            print("[DownloadManager] tokenizer_config.json not found, skipping patch")
            return
        }

        // Read and parse existing config
        guard let data = fm.contents(atPath: configURL.path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[DownloadManager] Failed to parse tokenizer_config.json, skipping patch")
            return
        }

        // Already has chat_template — nothing to do
        if json["chat_template"] != nil {
            return
        }

        print("[DownloadManager] chat_template missing in tokenizer_config.json, attempting to patch...")

        // Attempt 1: Fetch from the original HuggingFace repo
        if let remoteTemplate = await fetchRemoteChatTemplate(modelId: modelId) {
            var patched = json
            patched["chat_template"] = remoteTemplate
            if writePatchedConfig(patched, to: configURL) {
                print("[DownloadManager] Patched chat_template from remote repo")
                return
            }
        }

        // Attempt 2: Use built-in fallback template
        let lowerId = modelId.lowercased()
        for entry in Self.fallbackTemplates {
            if lowerId.contains(entry.keyword.lowercased()) {
                var patched = json
                patched["chat_template"] = entry.template
                if writePatchedConfig(patched, to: configURL) {
                    print("[DownloadManager] Patched chat_template from built-in fallback (\(entry.keyword))")
                    return
                }
            }
        }

        print("[DownloadManager] No chat_template source found for \(modelId), skipping patch")
    }

    /// Fetch chat_template from the original (non-quantized) HuggingFace repo.
    /// Returns the template string if found, nil otherwise.
    private func fetchRemoteChatTemplate(modelId: String) async -> Any? {
        let endpoint = Self.resolvedEndpoint()
        let urlString = "\(endpoint)/\(modelId)/raw/main/tokenizer_config.json"

        guard let url = URL(string: urlString) else { return nil }

        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 15
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                print("[DownloadManager] Remote tokenizer_config.json fetch failed (HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0))")
                return nil
            }

            guard let remoteJSON = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let template = remoteJSON["chat_template"] else {
                print("[DownloadManager] Remote tokenizer_config.json has no chat_template either")
                return nil
            }

            return template
        } catch {
            print("[DownloadManager] Failed to fetch remote tokenizer_config.json: \(error.localizedDescription)")
            return nil
        }
    }

    /// Write patched config dictionary back to disk as pretty-printed JSON.
    /// Returns true on success.
    @discardableResult
    private func writePatchedConfig(_ config: [String: Any], to url: URL) -> Bool {
        do {
            let patchedData = try JSONSerialization.data(
                withJSONObject: config,
                options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            )
            try patchedData.write(to: url, options: .atomic)
            return true
        } catch {
            print("[DownloadManager] Failed to write patched tokenizer_config.json: \(error.localizedDescription)")
            return false
        }
    }
}
