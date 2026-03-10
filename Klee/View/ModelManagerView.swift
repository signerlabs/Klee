//
//  ModelManagerView.swift
//  Klee
//
//  Model management view: displays recommended model list, download progress, speed, cancel, delete, and selection.
//  Uses DownloadManager for real-time download progress feedback.
//

import SwiftUI

struct ModelManagerView: View {
    @Environment(ModelManager.self) var modelManager
    @Environment(LLMService.self) var llmService
    @Environment(DownloadManager.self) var downloadManager
    @State private var showDeleteConfirm = false
    @State private var modelToDelete: ModelInfo?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            headerSection

            Divider()

            // System info
            systemInfoSection

            Divider()

            // Model list
            modelListSection
        }
        .frame(minWidth: 280)
        .alert("Delete Model", isPresented: $showDeleteConfirm, presenting: modelToDelete) { model in
            Button("Delete", role: .destructive) {
                deleteModel(model)
            }
            Button("Cancel", role: .cancel) {}
        } message: { model in
            Text("Are you sure you want to delete \"\(model.name)\"? This will free up disk space, but you'll need to re-download it to use again.")
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack {
            Text("Models")
                .font(.headline)
            Spacer()
            Button {
                modelManager.refreshCachedModels()
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
            .help("Refresh model list")
        }
        .padding()
    }

    // MARK: - System Info

    private var systemInfoSection: some View {
        HStack(spacing: 6) {
            Image(systemName: "memorychip")
                .foregroundStyle(.secondary)
            Text("System RAM: \(modelManager.systemRAM) GB")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    // MARK: - Model List

    private var modelListSection: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if modelManager.availableModels.isEmpty {
                    emptyState
                } else {
                    ForEach(modelManager.availableModels) { model in
                        modelRow(model)
                        Divider().padding(.leading, 44)
                    }
                }
            }
        }
    }

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
        let isSelected = modelManager.selectedModelId == model.id
        let isCurrentlyLoaded = llmService.currentModelId == model.id && llmService.state.isReady
        let isDownloading = downloadManager.downloadingModelId == model.id
            && downloadManager.status == .downloading
        let isLoading = modelManager.selectedModelId == model.id && llmService.state == .loading

        return VStack(spacing: 0) {
            HStack(spacing: 10) {
                // Status indicator
                if isDownloading || isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 20, height: 20)
                } else {
                    Image(systemName: statusIcon(isCached: isCached, isSelected: isSelected, isLoaded: isCurrentlyLoaded))
                        .foregroundStyle(statusColor(isCached: isCached, isSelected: isSelected, isLoaded: isCurrentlyLoaded))
                        .font(.title3)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(model.name)
                        .font(.subheadline.weight(.medium))

                    HStack(spacing: 8) {
                        Text(model.size)
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Text(model.ramLabel)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }

                    // Downloading: show progress percentage + speed
                    if isDownloading {
                        downloadStatusLabel
                    }
                    // Loading: show loading status
                    else if isLoading, let status = llmService.loadingStatus {
                        Text(status)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    // Cached: show disk space used
                    else if isCached, let cachedBytes = modelManager.cachedSize(for: model.id) {
                        Text("Downloaded: \(ByteCountFormatter.string(fromByteCount: cachedBytes, countStyle: .file))")
                            .font(.caption2)
                            .foregroundStyle(.green.opacity(0.8))
                    }
                }

                Spacer()

                // Action buttons
                if isDownloading {
                    // Cancel download button
                    Button {
                        cancelDownload()
                    } label: {
                        Image(systemName: "xmark.circle")
                            .foregroundStyle(.red.opacity(0.7))
                    }
                    .buttonStyle(.borderless)
                    .help("Cancel download")
                } else if isLoading {
                    // No action buttons while loading
                } else if isCached {
                    // Delete button
                    Button {
                        modelToDelete = model
                        showDeleteConfirm = true
                    } label: {
                        Image(systemName: "trash")
                            .foregroundStyle(.red.opacity(0.7))
                    }
                    .buttonStyle(.borderless)
                    .help("Delete \(model.name)")
                } else {
                    // Download button
                    Button {
                        downloadAndLoadModel(model)
                    } label: {
                        Image(systemName: "arrow.down.circle")
                    }
                    .buttonStyle(.borderless)
                    .disabled(downloadManager.status == .downloading)
                    .help("Download \(model.name)")
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            // Inline progress bar (loading)
            if isLoading, let progress = llmService.loadProgress, progress > 0 {
                ProgressView(value: progress)
                    .padding(.horizontal)
                    .padding(.bottom, 4)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            selectAndLoadModel(model)
        }
        .background(isSelected ? Color.accentColor.opacity(0.06) : Color.clear)
    }

    // MARK: - Download Status Label

    private var downloadStatusLabel: some View {
        HStack(spacing: 6) {
            if downloadManager.progress.totalFiles > 0 {
                Text("File \(downloadManager.progress.completedFiles + 1)/\(downloadManager.progress.totalFiles)")
                    .font(.caption2)
                    .foregroundStyle(.blue)
                    .monospacedDigit()
            }

            if !downloadManager.progress.speedLabel.isEmpty {
                Text(downloadManager.progress.speedLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }

    // MARK: - Status Icon and Color

    private func statusIcon(isCached: Bool, isSelected: Bool, isLoaded: Bool) -> String {
        if isLoaded { return "checkmark.circle.fill" }
        if isSelected && isCached { return "circle.inset.filled" }
        if isCached { return "arrow.down.circle.fill" }
        return "circle"
    }

    private func statusColor(isCached: Bool, isSelected: Bool, isLoaded: Bool) -> Color {
        if isLoaded { return .green }
        if isSelected { return .accentColor }
        if isCached { return .orange }
        return .secondary
    }

    // MARK: - Actions

    /// Select and load a model (already downloaded)
    private func selectAndLoadModel(_ model: ModelInfo) {
        modelManager.selectedModelId = model.id
        UserDefaults.standard.set(model.id, forKey: "lastUsedModelId")

        if modelManager.isCached(model.id) {
            Task {
                await llmService.loadModel(id: model.id)
            }
        }
    }

    /// Download and load a model
    private func downloadAndLoadModel(_ model: ModelInfo) {
        modelManager.selectedModelId = model.id
        UserDefaults.standard.set(model.id, forKey: "lastUsedModelId")

        Task {
            // Use DownloadManager for download+load with real-time progress
            let container = await downloadManager.downloadAndLoad(id: model.id)

            if let container {
                // Download+load successful, set directly on LLMService
                llmService.setLoadedContainer(container, id: model.id)
                modelManager.refreshCachedModels()
            }

            // Reset DownloadManager state
            downloadManager.reset()
        }
    }

    /// Cancel download
    private func cancelDownload() {
        downloadManager.cancel()
    }

    /// Delete a model
    private func deleteModel(_ model: ModelInfo) {
        // If the model is currently in use, unload it first
        if llmService.currentModelId == model.id {
            llmService.unloadModel()
        }

        try? modelManager.deleteModel(id: model.id)
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
