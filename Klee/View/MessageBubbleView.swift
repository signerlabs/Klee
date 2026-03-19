//
//  MessageBubbleView.swift
//  Klee
//
//  Individual chat message bubble views for user, assistant, and system roles.
//

import SwiftUI

// MARK: - Message Bubble

struct MessageBubbleView: View {
    let message: ChatMessage

    var body: some View {
        switch message.role {
        case .user:
            VStack(alignment: .trailing) {
                // Images displayed separately, no background, right-aligned
                if !message.imageURLs.isEmpty {
                    HStack {
                        Spacer(minLength: 60)
                        messageImages(urls: message.imageURLs)
                    }
                }
                // Text in accent bubble
                if !message.content.isEmpty {
                    HStack {
                        Spacer(minLength: 60)
                        Text(message.content)
                            .textSelection(.enabled)
                            .padding(8)
                            .foregroundStyle(.white)
                            .background(.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }

        case .assistant:
            assistantBubbleContent(message.content)
                .padding(8)

        case .system:
            HStack {
                Spacer()
                Text(message.content)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 4)
                Spacer()
            }
        }
    }

    // MARK: - Assistant Bubble (clean text only; thinking is shown inline via ThinkingBlockView)

    @ViewBuilder
    private func assistantBubbleContent(_ content: String) -> some View {
        if !content.isEmpty {
            MarkdownTextView(text: content)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - User Message Image Display

    /// Display attached images in a user message, right-aligned without background
    private func messageImages(urls: [String]) -> some View {
        HStack(spacing: 6) {
            ForEach(urls, id: \.self) { urlString in
                if let url = URL(string: urlString) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFit()
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .strokeBorder(.tertiary, lineWidth: 0.5)
                                )
                        case .failure:
                            Image(systemName: "photo")
                                .foregroundStyle(.secondary)
                        default:
                            ProgressView()
                        }
                    }
                    .frame(width: 160)
                }
            }
        }
    }
}

// MARK: - Thinking Bubble

struct ThinkingBubbleView: View {
    var body: some View {
        HStack {
            HStack(spacing: 6) {
                ThinkingIndicator()
                Text("Thinking...")
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            Spacer(minLength: 60)
        }
    }
}
