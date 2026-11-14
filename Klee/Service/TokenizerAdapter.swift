//
//  TokenizerAdapter.swift
//  Klee
//
//  Bridges swift-transformers tokenizers to the mlx-swift-lm 3.x Tokenizer protocol.
//  mlx-swift-lm 3.x no longer ships a tokenizer implementation; it expects the app to
//  supply a TokenizerLoader. This is the same bridge the MLXHuggingFace macros expand to
//  (mlx-swift-lm, MIT), written out by hand so the app does not need Swift macros.
//  Klee downloads model files itself, so only the tokenizer half is needed (no Downloader).
//

import Foundation
@preconcurrency import MLXLMCommon
import Tokenizers

/// Loads a tokenizer from a local model directory using swift-transformers.
/// swift-transformers also picks up `chat_template.jinja` from the same directory.
/// `nonisolated` because the target defaults to MainActor isolation and model loading
/// calls this off the main actor.
nonisolated struct TransformersTokenizerLoader: MLXLMCommon.TokenizerLoader {

    func load(from directory: URL) async throws -> any MLXLMCommon.Tokenizer {
        let upstream = try await AutoTokenizer.from(modelFolder: directory)
        return TransformersTokenizerBridge(upstream)
    }
}

/// Adapts a swift-transformers tokenizer to the mlx-swift-lm Tokenizer protocol.
nonisolated private struct TransformersTokenizerBridge: MLXLMCommon.Tokenizer {

    private let upstream: any Tokenizers.Tokenizer

    init(_ upstream: any Tokenizers.Tokenizer) {
        self.upstream = upstream
    }

    func encode(text: String, addSpecialTokens: Bool) -> [Int] {
        upstream.encode(text: text, addSpecialTokens: addSpecialTokens)
    }

    // swift-transformers uses `decode(tokens:)` instead of `decode(tokenIds:)`.
    func decode(tokenIds: [Int], skipSpecialTokens: Bool) -> String {
        upstream.decode(tokens: tokenIds, skipSpecialTokens: skipSpecialTokens)
    }

    func convertTokenToId(_ token: String) -> Int? {
        upstream.convertTokenToId(token)
    }

    func convertIdToToken(_ id: Int) -> String? {
        upstream.convertIdToToken(id)
    }

    var bosToken: String? { upstream.bosToken }
    var eosToken: String? { upstream.eosToken }
    var unknownToken: String? { upstream.unknownToken }

    func applyChatTemplate(
        messages: [[String: any Sendable]],
        tools: [[String: any Sendable]]?,
        additionalContext: [String: any Sendable]?
    ) throws -> [Int] {
        do {
            return try upstream.applyChatTemplate(
                messages: messages, tools: tools, additionalContext: additionalContext)
        } catch Tokenizers.TokenizerError.missingChatTemplate {
            throw MLXLMCommon.TokenizerError.missingChatTemplate
        }
    }
}
