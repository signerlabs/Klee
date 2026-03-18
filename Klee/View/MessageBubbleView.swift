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
            HStack {
                Spacer(minLength: 60)
                VStack(alignment: .trailing, spacing: 6) {
                    // Show attached images if any
                    if !message.imageURLs.isEmpty {
                        messageImages(urls: message.imageURLs)
                    }
                    if !message.content.isEmpty {
                        Text(message.content)
                            .textSelection(.enabled)
                    }
                }
                .padding(8)
                .foregroundStyle(.white)
                .background(.accent)
                .clipShape(RoundedRectangle(cornerRadius: 12))
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

    // MARK: - Assistant Bubble (clean text only; thinking/tool details are in Inspector)

    @ViewBuilder
    private func assistantBubbleContent(_ content: String) -> some View {
        if !content.isEmpty {
            MarkdownTextView(text: content)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - User Message Image Display

    /// Display attached images in a user message bubble
    private func messageImages(urls: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(urls, id: \.self) { urlString in
                    if let url = URL(string: urlString) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFill()
                            case .failure:
                                Image(systemName: "photo")
                                    .foregroundStyle(.white.opacity(0.6))
                            default:
                                ProgressView()
                            }
                        }
                        .frame(width: 120, height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
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
                Text("Implementing...")
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
