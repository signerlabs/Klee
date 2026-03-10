//
//  SettingsView.swift
//  Klee
//
//  Settings sheet: contains model management and app version info.
//

import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                // Model Management section
                Section {
                    ModelManagerView()
                        .frame(minHeight: 300)
                }

                // About section
                Section("About") {
                    LabeledContent("Version", value: appVersion)
                    LabeledContent("Build", value: buildNumber)
                    LabeledContent("Engine", value: "MLX Swift (on-device)")
                    LabeledContent("Platform", value: "macOS \(ProcessInfo.processInfo.operatingSystemVersionString)")
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .frame(minWidth: 500, idealWidth: 600, minHeight: 500, idealHeight: 600)
    }

    // MARK: - App Info

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "Unknown"
    }
}

// MARK: - Preview

#Preview {
    SettingsView()
        .environment(ModelManager())
        .environment(LLMService())
        .environment(DownloadManager())
}
