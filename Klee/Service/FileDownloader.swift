//
//  FileDownloader.swift
//  Klee
//
//  Single-file HTTP downloader with resume support via URLSessionDownloadDelegate.
//  Manages a dedicated URLSession and reports progress via a callback closure.
//

import Foundation

// MARK: - Download Progress Callback

/// Progress update from the downloader to the orchestrator (DownloadManager).
/// - Parameters:
///   - fractionCompleted: Overall fraction (0.0 ~ 1.0), accounting for all files
///   - speed: Current download speed in bytes/sec, nil if not yet measured
typealias DownloadProgressCallback = @MainActor (_ fractionCompleted: Double, _ speed: Double?) -> Void

// MARK: - DelegateContext

/// Mutable state accessed from URLSessionDownloadDelegate callbacks on background threads.
/// Stored as a `nonisolated let` reference so delegate methods can read/write it
/// without crossing the @MainActor boundary.
final class DelegateContext: @unchecked Sendable {
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

// MARK: - FileDownloader

class FileDownloader: NSObject, URLSessionDownloadDelegate {

    /// Delegate context for background-thread progress tracking
    nonisolated private let ctx = DelegateContext()

    /// Dedicated URLSession with delegate for progress callbacks
    private var downloadSession: URLSession = .shared

    /// Active URLSessionDownloadTask reference (for cancellation)
    private var activeDownloadTask: URLSessionDownloadTask?

    /// Progress callback invoked on MainActor
    var onProgress: DownloadProgressCallback?

    // MARK: - Init

    nonisolated override init() {
        super.init()
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForResource = 3600
        downloadSession = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        try? FileManager.default.createDirectory(at: ctx.stagingDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Cancel

    /// Cancel the currently active download task
    func cancelActiveTask() {
        activeDownloadTask?.cancel()
        activeDownloadTask = nil
    }

    // MARK: - Download Single File

    /// Download a single file with resume support using URLSessionDownloadTask.
    /// Returns the number of bytes this file occupies (resumeOffset + newly downloaded).
    /// - Parameters:
    ///   - modelId: HuggingFace model ID
    ///   - remotePath: Remote file path within the model repo
    ///   - localURL: Destination file URL on disk
    ///   - expectedSize: Expected file size in bytes
    ///   - totalBytes: Total bytes across all files (for progress calculation)
    ///   - previouslyDownloaded: Bytes already downloaded by prior files
    func downloadFile(
        modelId: String,
        remotePath: String,
        to localURL: URL,
        expectedSize: Int64,
        totalBytes: Int64,
        previouslyDownloaded: Int64
    ) async throws -> Int64 {
        let endpoint = HuggingFaceAPI.resolvedEndpoint()
        // URL-encode the path components (but not the slashes)
        let encodedPath = remotePath.split(separator: "/").map {
            $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0)
        }.joined(separator: "/")
        let urlString = "\(endpoint)/\(modelId)/resolve/main/\(encodedPath)?download=true"

        guard let url = URL(string: urlString) else {
            throw KleeError.downloadFailed("Invalid download URL for \(remotePath)")
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
            throw KleeError.downloadFailed("Invalid response for \(remotePath)")
        }

        // Handle response codes
        switch httpResponse.statusCode {
        case 200:
            // Full content — server ignored Range or fresh download
            resumeOffset = 0
            try? fm.removeItem(at: incompleteURL)
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
            throw KleeError.downloadFailed("HTTP \(httpResponse.statusCode) downloading \(remotePath)")
        }

        // Validate downloaded size
        let finalAttrs = try fm.attributesOfItem(atPath: incompleteURL.path)
        let bytesWritten = finalAttrs[.size] as? Int64 ?? 0

        if expectedSize > 0 && bytesWritten != expectedSize {
            // Size mismatch — keep .incomplete for future resume attempt
            throw KleeError.downloadFailed(
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

        let fraction: Double = total > 0 ? Double(overallDownloaded) / Double(total) * 0.95 : 0

        Task { @MainActor [weak self, currentSpeed] in
            self?.onProgress?(fraction, currentSpeed)
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
                ctx.continuation?.resume(throwing: KleeError.downloadFailed("No response from download task"))
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
}
