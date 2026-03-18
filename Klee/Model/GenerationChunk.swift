//
//  GenerationChunk.swift
//  Klee
//
//  A single piece of streaming generation output.
//

@preconcurrency import MLXLMCommon

/// A single piece of generation output — either a text chunk or a tool call.
enum GenerationChunk: Sendable {
    case text(String)
    case toolCall(ToolCall)
}
