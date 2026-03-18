//
//  TokenizerPatcher.swift
//  Klee
//
//  Patches tokenizer_config.json when the chat_template field is missing.
//  Some mlx-community models omit chat_template, causing inference to fail.
//  Attempts remote fetch first, then falls back to bundled templates.
//

import Foundation

// MARK: - TokenizerPatcher

struct TokenizerPatcher {

    /// Fallback chat_template mapping for known model families.
    /// Key is a substring matched against the model ID (case-insensitive).
    static let fallbackTemplates: [(keyword: String, templateResource: String)] = [
        ("Qwen3.5", "QwenChatTemplate"),
        ("Qwen3VL", "QwenChatTemplate"),
    ]

    // MARK: - Patch Entry Point

    /// Check and patch tokenizer_config.json if the chat_template field is missing.
    ///
    /// 1. Reads the local tokenizer_config.json
    /// 2. If chat_template is present, does nothing
    /// 3. Fetches the original repo's tokenizer_config.json from HuggingFace
    /// 4. Falls back to a bundled template if remote fetch fails
    /// 5. Writes the patched JSON back to disk
    ///
    /// Failures are silently logged — this must never block the main download flow.
    static func patchTokenizerConfigIfNeeded(modelId: String, localURL: URL) async {
        let configURL = localURL.appendingPathComponent("tokenizer_config.json")
        let fm = FileManager.default

        // Guard: file must exist
        guard fm.fileExists(atPath: configURL.path) else {
            print("[TokenizerPatcher] tokenizer_config.json not found, skipping patch")
            return
        }

        // Read and parse existing config
        guard let data = fm.contents(atPath: configURL.path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[TokenizerPatcher] Failed to parse tokenizer_config.json, skipping patch")
            return
        }

        // Already has chat_template — nothing to do
        if json["chat_template"] != nil {
            return
        }

        print("[TokenizerPatcher] chat_template missing in tokenizer_config.json, attempting to patch...")

        // Attempt 1: Fetch from the original HuggingFace repo
        if let remoteTemplate = await fetchRemoteChatTemplate(modelId: modelId) {
            var patched = json
            patched["chat_template"] = remoteTemplate
            if writePatchedConfig(patched, to: configURL) {
                print("[TokenizerPatcher] Patched chat_template from remote repo")
                return
            }
        }

        // Attempt 2: Use bundled fallback template from Resources
        let lowerId = modelId.lowercased()
        for entry in fallbackTemplates {
            if lowerId.contains(entry.keyword.lowercased()) {
                if let template = loadBundledTemplate(named: entry.templateResource) {
                    var patched = json
                    patched["chat_template"] = template
                    if writePatchedConfig(patched, to: configURL) {
                        print("[TokenizerPatcher] Patched chat_template from bundled fallback (\(entry.keyword))")
                        return
                    }
                }
            }
        }

        print("[TokenizerPatcher] No chat_template source found for \(modelId), skipping patch")
    }

    // MARK: - Remote Fetch

    /// Fetch chat_template from the original (non-quantized) HuggingFace repo.
    /// Returns the template value if found, nil otherwise.
    static func fetchRemoteChatTemplate(modelId: String) async -> Any? {
        let endpoint = HuggingFaceAPI.resolvedEndpoint()
        let urlString = "\(endpoint)/\(modelId)/raw/main/tokenizer_config.json"

        guard let url = URL(string: urlString) else { return nil }

        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 15
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                print("[TokenizerPatcher] Remote tokenizer_config.json fetch failed (HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0))")
                return nil
            }

            guard let remoteJSON = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let template = remoteJSON["chat_template"] else {
                print("[TokenizerPatcher] Remote tokenizer_config.json has no chat_template either")
                return nil
            }

            return template
        } catch {
            print("[TokenizerPatcher] Failed to fetch remote tokenizer_config.json: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Bundled Template

    /// Load a chat template from the app bundle's Resources.
    /// - Parameter named: Resource file name (without extension), expects .txt
    static func loadBundledTemplate(named name: String) -> String? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "txt") else {
            print("[TokenizerPatcher] Bundled template '\(name).txt' not found in Resources")
            return nil
        }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Write Config

    /// Write patched config dictionary back to disk as pretty-printed JSON.
    /// Returns true on success.
    @discardableResult
    static func writePatchedConfig(_ config: [String: Any], to url: URL) -> Bool {
        do {
            let patchedData = try JSONSerialization.data(
                withJSONObject: config,
                options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            )
            try patchedData.write(to: url, options: .atomic)
            return true
        } catch {
            print("[TokenizerPatcher] Failed to write patched tokenizer_config.json: \(error.localizedDescription)")
            return false
        }
    }
}
