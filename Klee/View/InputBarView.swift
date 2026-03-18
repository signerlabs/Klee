//
//  InputBarView.swift
//  Klee
//
//  Chat input bar with text field, image attachments, and send/stop controls.
//

import SwiftUI
import UniformTypeIdentifiers

struct InputBarView: View {
    @Binding var inputText: String
    @Binding var pendingImageURLs: [URL]
    let isStreaming: Bool
    let hasContent: Bool
    let llmState: LLMState
    let currentModelSupportsVision: Bool
    let onSend: () -> Void
    let onStop: () -> Void
    let onPickImages: () -> Void
    let onRemoveImage: (Int) -> Void

    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            // Pending image thumbnails
            if !pendingImageURLs.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(pendingImageURLs.enumerated()), id: \.offset) { index, url in
                            imageThumbnail(url: url, index: index)
                        }
                    }
                    .padding(.horizontal, 4)
                }
                .frame(height: 72)
            }

            TextField("Type a message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...8)
                .focused($isInputFocused)
                .disabled(isStreaming)
                .onKeyPress(.return, phases: .down) { event in
                    if event.modifiers.contains(.shift) { return .ignored }
                    onSend()
                    return .handled
                }

            HStack(spacing: 12) {
                if llmState == .loading {
                    Text("Loading model...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if llmState == .idle {
                    Text("Select a model to start")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                // Image attach button (visible when current model supports vision)
                if currentModelSupportsVision {
                    Button {
                        onPickImages()
                    } label: {
                        Image(systemName: "photo.badge.plus")
                            .font(.system(size: 18))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .disabled(isStreaming)
                    .help("Attach images")
                }

                Spacer()

                if isStreaming {
                    Button {
                        onStop()
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.red.opacity(0.8))
                    }
                    .buttonStyle(.plain)
                    .help("Stop generating")
                } else {
                    Button(action: onSend) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 24))
                    }
                    .buttonStyle(.plain)
                    .disabled(!hasContent || llmState != .ready)
                }
            }
        }
        .padding(12)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(.tertiary, lineWidth: 1)
        )
        .onDrop(of: [.image], isTargeted: nil) { providers in
            guard currentModelSupportsVision else { return false }
            for provider in providers {
                provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { data, _ in
                    if let url = data as? URL {
                        Task { @MainActor in
                            pendingImageURLs.append(url)
                        }
                    } else if let data = data as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                        Task { @MainActor in
                            pendingImageURLs.append(url)
                        }
                    }
                }
            }
            return true
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: - Image Thumbnail

    /// Thumbnail preview for a pending image attachment
    private func imageThumbnail(url: URL, index: Int) -> some View {
        ZStack(alignment: .topTrailing) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    Image(systemName: "photo")
                        .foregroundStyle(.secondary)
                default:
                    ProgressView()
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Remove button
            Button {
                onRemoveImage(index)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(.white)
                    .background(Circle().fill(.black.opacity(0.5)))
            }
            .buttonStyle(.plain)
            .offset(x: 4, y: -4)
        }
    }
}
