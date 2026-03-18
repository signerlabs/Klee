//
//  ChatConfigView.swift
//  Klee
//
//  Right sidebar: model selection and platform module toggles.
//  Replaces the former Inspector panel.
//

import SwiftUI

struct ChatConfigView: View {
    @Environment(LLMService.self) var llmService
    @Environment(ModelManager.self) var modelManager
    @Environment(ModuleManager.self) var moduleManager

    var body: some View {
        Form {
            Section("Model") {
                modelSelectionSection

                // Show recent decode speed for the loaded model (prefer detailed metric)
                if llmService.lastDecodeTokensPerSec > 0 {
                    Text("\(String(format: "%.1f", llmService.lastDecodeTokensPerSec)) tok/s")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if llmService.tokensPerSecond > 0 {
                    Text("\(String(format: "%.1f", llmService.tokensPerSecond)) tok/s")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Modules") {
                moduleListSection
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Model Selection

    /// Show downloaded models; tap to switch the active model.
    @ViewBuilder
    private var modelSelectionSection: some View {
        let cachedModels = modelManager.availableModels.filter { modelManager.isCached($0.id) }

        if cachedModels.isEmpty {
            Text("No models downloaded")
                .foregroundStyle(.secondary)
                .font(.callout)
        } else {
            ForEach(cachedModels) { model in
                Button {
                    Task {
                        await llmService.loadModel(id: model.id)
                    }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.name)
                                .font(.callout)
                            Text(model.size)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if llmService.currentModelId == model.id {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.accent)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Module Toggles

    /// Platform module list with enable/disable toggles and auth status.
    @ViewBuilder
    private var moduleListSection: some View {
        if moduleManager.modules.isEmpty {
            Text("No modules available")
                .foregroundStyle(.secondary)
                .font(.callout)
        } else {
            ForEach(moduleManager.modules, id: \.id) { module in
                HStack(spacing: 10) {
                    Image(systemName: module.icon)
                        .frame(width: 20)
                        .foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(module.name)
                            .font(.callout)
                        if module.isEnabled && !module.isAuthenticated {
                            Text("Login required")
                                .font(.caption2)
                                .foregroundStyle(.orange)
                        }
                    }

                    Spacer()

                    Toggle("", isOn: Binding(
                        get: { module.isEnabled },
                        set: { moduleManager.toggleModule(id: module.id, enabled: $0) }
                    ))
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .controlSize(.small)
                }
            }
        }
    }
}
