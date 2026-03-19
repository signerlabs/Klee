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
    @State private var isExpanded: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header — click to toggle
            Button {
                isExpanded.toggle()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .frame(width: 10)
                    if isStreaming {
                        ThinkingIndicator()
                    }
                    Text("Thinking")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            // Content — scrollable with max height, no lineLimit truncation
            if isExpanded {
                ScrollView {
                    Text(content)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 200)
                .padding(.top, 6)
            }
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
