//
//  ModelManagerView.swift
//  Klee
//
//  模型管理界面：展示推荐模型列表、下载进度、删除、选择。
//  替代 Ollama 模型管理，直接操作 HuggingFace Hub 缓存。
//

import SwiftUI

struct ModelManagerView: View {
    @Environment(ModelManager.self) var modelManager
    @Environment(LLMService.self) var llmService
    @State private var showDeleteConfirm = false
    @State private var modelToDelete: ModelInfo?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 头部
            headerSection

            Divider()

            // 加载进度（如果正在下载/加载模型）
            if llmService.state == .loading {
                loadingProgressSection
                Divider()
            }

            // 系统信息
            systemInfoSection

            Divider()

            // 模型列表
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

    // MARK: - 头部

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

    // MARK: - 加载进度

    private var loadingProgressSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(llmService.loadingStatus ?? "Loading...")
                    .font(.caption.weight(.medium))
                Spacer()
                if let progress = llmService.loadProgress {
                    Text("\(Int(progress * 100))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let progress = llmService.loadProgress {
                ProgressView(value: progress)
            } else {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    // MARK: - 系统信息

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

    // MARK: - 模型列表

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

    // MARK: - 模型行

    private func modelRow(_ model: ModelInfo) -> some View {
        let isCached = modelManager.isCached(model.id)
        let isSelected = modelManager.selectedModelId == model.id
        let isCurrentlyLoaded = llmService.currentModelId == model.id && llmService.state.isReady

        return HStack(spacing: 10) {
            // 选中/已下载 指示器
            Image(systemName: statusIcon(isCached: isCached, isSelected: isSelected, isLoaded: isCurrentlyLoaded))
                .foregroundStyle(statusColor(isCached: isCached, isSelected: isSelected, isLoaded: isCurrentlyLoaded))
                .font(.title3)

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

                // 已缓存时显示实际占用空间
                if isCached, let cachedBytes = modelManager.cachedSize(for: model.id) {
                    Text("Downloaded: \(ByteCountFormatter.string(fromByteCount: cachedBytes, countStyle: .file))")
                        .font(.caption2)
                        .foregroundStyle(.green.opacity(0.8))
                }
            }

            Spacer()

            // 操作按钮
            if isCached {
                // 删除按钮
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
                // 下载按钮
                Button {
                    downloadAndLoadModel(model)
                } label: {
                    Image(systemName: "arrow.down.circle")
                }
                .buttonStyle(.borderless)
                .disabled(llmService.state == .loading)
                .help("Download \(model.name)")
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .onTapGesture {
            selectAndLoadModel(model)
        }
        .background(isSelected ? Color.accentColor.opacity(0.06) : Color.clear)
    }

    // MARK: - 状态图标和颜色

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

    // MARK: - 操作

    /// 选择并加载模型
    private func selectAndLoadModel(_ model: ModelInfo) {
        modelManager.selectedModelId = model.id
        UserDefaults.standard.set(model.id, forKey: "lastUsedModelId")

        if modelManager.isCached(model.id) {
            Task {
                await llmService.loadModel(id: model.id)
            }
        }
    }

    /// 下载并加载模型
    private func downloadAndLoadModel(_ model: ModelInfo) {
        modelManager.selectedModelId = model.id
        UserDefaults.standard.set(model.id, forKey: "lastUsedModelId")

        Task {
            await llmService.loadModel(id: model.id)
            // 下载完成后刷新缓存列表
            modelManager.refreshCachedModels()
        }
    }

    /// 删除模型
    private func deleteModel(_ model: ModelInfo) {
        // 如果正在使用该模型，先卸载
        if llmService.currentModelId == model.id {
            llmService.unloadModel()
        }

        try? modelManager.deleteModel(id: model.id)
    }
}

// MARK: - 预览

#Preview {
    ModelManagerView()
        .environment(ModelManager())
        .environment(LLMService())
        .frame(width: 320, height: 500)
}
