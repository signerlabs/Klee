//
//  ThinkingBlockView.swift
//  Klee
//
//  Inline collapsible thinking block displayed in the chat area.
//  Shows the model's <think> content before the final response.
//  Expanded by default inside a card with max height. Scrollable if content overflows.
//

import SwiftUI

struct ThinkingBlockView: View {
    let content: String
    let isStreaming: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack(spacing: 6) {
                if isStreaming {
                    ThinkingIndicator()
                }
                Text("Thinking")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            // Scrollable content with max height
            ScrollView {
                Text(content)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 200)
        }
        .padding(10)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(.quaternary, lineWidth: 0.5)
        )
    }
}

// MARK: - Preview

#Preview("Streaming") {
    ThinkingBlockView(
        content: "Let me analyze this step by step...\n1. First, consider the input\n2. Then process the logic",
        isStreaming: true
    )
    .frame(width: 400)
    .padding()
}

#Preview("Collapsed") {
    ThinkingBlockView(
        content: "This is the completed thinking content that can be expanded.",
        isStreaming: false
    )
    .frame(width: 400)
    .padding()
}
