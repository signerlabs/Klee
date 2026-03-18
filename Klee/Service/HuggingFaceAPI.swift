//
//  HuggingFaceAPI.swift
//  Klee
//
//  HuggingFace API client: fetches model file lists and filters them
//  to only include files required for MLX model loading.
//

import Foundation

// MARK: - HuggingFaceAPI

/// Not MainActor-isolated — called from FileDownloader's background URLSession delegate context.
nonisolated struct HuggingFaceAPI {

    // MARK: - File Filtering Constants

    /// File extensions that must be downloaded for model loading
    static let requiredExtensions: Set<String> = [
        ".safetensors",
        ".json",
        ".txt",
        ".py",       // tokenizer scripts
        ".model",    // sentencepiece models
        ".tiktoken"  // tiktoken vocab
    ]

    /// Files to always include by exact name (regardless of extension)
    static let requiredFileNames: Set<String> = [
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
    static let excludedPatterns: [String] = [
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

    // MARK: - Resolved Endpoint

    /// Resolved HuggingFace endpoint (mirror or official).
    /// Reads HF_ENDPOINT env var directly to avoid MainActor dependency.
    nonisolated static func resolvedEndpoint() -> String {
        if let endpoint = ProcessInfo.processInfo.environment["HF_ENDPOINT"], !endpoint.isEmpty {
            return endpoint
        }
        return "https://huggingface.co"
    }

    // MARK: - Fetch File List

    /// Fetch file list from HuggingFace API (recursively fetches subdirectories)
    static func fetchFileList(modelId: String) async throws -> [HFFileEntry] {
        let endpoint = resolvedEndpoint()
        let urlString = "\(endpoint)/api/models/\(modelId)/tree/main"

        guard let url = URL(string: urlString) else {
            throw KleeError.downloadFailed("Invalid API URL: \(urlString)")
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw KleeError.downloadFailed("Invalid response from HuggingFace API")
        }

        guard httpResponse.statusCode == 200 else {
            throw KleeError.downloadFailed("HuggingFace API returned status \(httpResponse.statusCode)")
        }

        let entries = try JSONDecoder().decode([HFFileEntry].self, from: data)

        // Separate files and directories
        var allFiles = entries.filter { $0.type == "file" }
        let directories = entries.filter { $0.type == "directory" }

        // Recursively fetch subdirectory contents
        for dir in directories {
            let subFiles = try await fetchSubdirectoryFiles(modelId: modelId, path: dir.path)
            allFiles.append(contentsOf: subFiles)
        }

        return allFiles
    }

    /// Recursively fetch files from a subdirectory
    static func fetchSubdirectoryFiles(modelId: String, path: String) async throws -> [HFFileEntry] {
        let endpoint = resolvedEndpoint()
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

    // MARK: - Filter Files

    /// Filter files to only include those needed for model loading
    static func filterFiles(_ files: [HFFileEntry]) -> [HFFileEntry] {
        files.filter { file in
            let name = (file.path as NSString).lastPathComponent
            let lowercasePath = file.path.lowercased()

            // Exclude unwanted files
            for pattern in excludedPatterns {
                if lowercasePath.contains(pattern.lowercased()) {
                    return false
                }
            }

            // Include by exact name
            if requiredFileNames.contains(name) {
                return true
            }

            // Include by extension
            for ext in requiredExtensions {
                if name.hasSuffix(ext) {
                    return true
                }
            }

            return false
        }
    }
}
