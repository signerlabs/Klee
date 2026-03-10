//
//  ModelManagerView.swift
//  Klee
//
//  Model management: lists available models with download, load, and delete actions.
//  Uses native List selection for active model highlighting.
//

import SwiftUI

struct ModelManagerView: View {
    @Environment(ModelManager.self) var modelManager
    @Environment(LLMService.self) var llmService
    @Environment(DownloadManager.self) var downloadManager
    @State private var showDeleteConfirm = false
    @State private var modelToDelete: ModelInfo?

    var body: some View {
        @Bindable var mm = modelManager

        List(selection: $mm.selectedModelId) {
            if modelManager.availableModels.isEmpty {
                emptyState
            } else {
                ForEach(modelManager.availableModels) { model in
                    modelRow(model)
                        .tag(model.id)
                }
            }
        }
        .onChange(of: modelManager.selectedModelId) { _, newId in
            guard let id = newId, modelManager.isCached(id) else { return }
            Task { await llmService.loadModel(id: id) }
        }
        .alert("Delete Model", isPresented: $showDeleteConfirm, presenting: modelToDelete) { model in
            Button("Delete", role: .destructive) { deleteModel(model) }
            Button("Cancel", role: .cancel) {}
        } message: { model in
            Text("Are you sure you want to delete \"\(model.name)\"? This will free up disk space, but you'll need to re-download it to use again.")
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.title2)
                .foregroundStyle(.quaternary)
            Text("No compatible models for this device")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Insufficient system RAM to run recommended models.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Model Row

    private func modelRow(_ model: ModelInfo) -> some View {
        let isCached = modelManager.isCached(model.id)
        let isLoaded = llmService.currentModelId == model.id && llmService.state.isReady
        let isDownloading = downloadManager.downloadingModelId == model.id && downloadManager.status == .downloading
        let isLoading = modelManager.selectedModelId == model.id && llmService.state == .loading
        let isCompatible = modelManager.isCompatible(model.id)

        return HStack(spacing: 10) {
            // Status indicator
            Group {
                if isDownloading || isLoading {
                    ProgressView().controlSize(.small)
                } else if isLoaded {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                } else if isCached {
                    Image(systemName: "arrow.down.circle.fill").foregroundStyle(.orange)
                } else {
                    Image(systemName: "circle").foregroundStyle(.secondary)
                }
            }
            .frame(width: 20, height: 20)

            // Model info
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(model.name)
                    if !isCompatible {
                        Button {
                            NSAlert.ramWarning(required: model.minRAM, current: modelManager.systemRAM)
                        } label: {
                            Image(systemName: "exclamationmark.circle")
                                .foregroundStyle(.orange)
                                .imageScale(.small)
                        }
                        .buttonStyle(.borderless)
                        .help("Insufficient RAM")
                    }
                }

                HStack(spacing: 8) {
                    Text(model.size)
                    Text(model.ramLabel)
                }
                .foregroundStyle(.secondary)
                .font(.caption)

                if isDownloading {
                    HStack(spacing: 6) {
                        if downloadManager.progress.totalFiles > 0 {
                            Text("File \(downloadManager.progress.completedFiles + 1)/\(downloadManager.progress.totalFiles)")
                                .foregroundStyle(.blue)
                        }
                        if !downloadManager.progress.speedLabel.isEmpty {
                            Text(downloadManager.progress.speedLabel).foregroundStyle(.secondary)
                        }
                    }
                    .font(.caption2)
                    .monospacedDigit()
                } else if isLoading, let status = llmService.loadingStatus {
                    Text(status).font(.caption2).foregroundStyle(.secondary)
                } else if isCached, let bytes = modelManager.cachedSize(for: model.id) {
                    Text("Downloaded: \(ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file))")
                        .font(.caption2)
                        .foregroundStyle(.green.opacity(0.8))
                }
            }

            Spacer()

            // Action button
            if isDownloading {
                Button { downloadManager.cancel() } label: {
                    Image(systemName: "xmark.circle").foregroundStyle(.red.opacity(0.7))
                }
                .buttonStyle(.borderless)
                .help("Cancel download")
            } else if isCached && !isLoading {
                Button {
                    modelToDelete = model
                    showDeleteConfirm = true
                } label: {
                    Image(systemName: "trash").foregroundStyle(.red.opacity(0.7))
                }
                .buttonStyle(.borderless)
                .help("Delete \(model.name)")
            } else if !isCached && !isLoading {
                Button { downloadAndLoadModel(model) } label: {
                    Image(systemName: "arrow.down.circle")
                }
                .buttonStyle(.borderless)
                .disabled(downloadManager.status == .downloading)
                .help("Download \(model.name)")
            }
        }
    }

    // MARK: - Actions

    private func downloadAndLoadModel(_ model: ModelInfo) {
        modelManager.selectedModelId = model.id
        UserDefaults.standard.set(model.id, forKey: "lastUsedModelId")
        Task {
            let container = await downloadManager.downloadAndLoad(id: model.id)
            if let container {
                llmService.setLoadedContainer(container, id: model.id)
                modelManager.refreshCachedModels()
            }
            downloadManager.reset()
        }
    }

    private func deleteModel(_ model: ModelInfo) {
        if llmService.currentModelId == model.id { llmService.unloadModel() }
        try? modelManager.deleteModel(id: model.id)
    }
}

// MARK: - NSAlert RAM Warning

private extension NSAlert {
    static func ramWarning(required: Int, current: Int) {
        let alert = NSAlert()
        alert.messageText = "Insufficient RAM"
        alert.informativeText = "This model requires \(required) GB of RAM, but your system only has \(current) GB. You can still download it, but it may fail to load or run very slowly."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}

// MARK: - Preview

#Preview {
    ModelManagerView()
        .environment(ModelManager())
        .environment(LLMService())
        .environment(DownloadManager())
        .frame(width: 320, height: 500)
}
