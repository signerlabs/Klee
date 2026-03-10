//
//  SettingsView.swift
//  Klee
//
//  Settings sheet: Device info, model management, about, and ShipSwift showcase.
//

import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(ModelManager.self) var modelManager
    @Environment(LLMService.self) var llmService
    @Environment(DownloadManager.self) var downloadManager

    var body: some View {
        NavigationStack {
            Form {
                // MARK: - Device Section
                Section("Device") {
                    LabeledContent("Chip", value: chipName)
                    LabeledContent("Memory", value: "\(systemMemoryGB) GB")
                    LabeledContent("macOS", value: ProcessInfo.processInfo.operatingSystemVersionString)
                }

                // MARK: - Models Section
                Section {
                    ModelManagerView()
                        .frame(minHeight: 300)
                } header: {
                    HStack {
                        Text("Models")
                        Spacer()
                        Button {
                            modelManager.refreshCachedModels()
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.borderless)
                        .help("Refresh model list")
                    }
                }

                // MARK: - About Section
                Section("About Klee") {
                    LabeledContent("Version", value: appVersion)
                    LabeledContent("Build", value: buildNumber)
                    LabeledContent("Engine", value: "MLX Swift (on-device)")
                }

                // MARK: - ShipSwift Showcase Section
                Section("Apps Built with ShipSwift") {
                    ForEach(shipSwiftApps) { app in
                        if let url = app.url {
                            Link(destination: url) {
                                appRow(app)
                            }
                        } else {
                            appRow(app)
                        }
                    }
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
        .frame(minWidth: 540, idealWidth: 600, minHeight: 600, idealHeight: 700)
    }

    // MARK: - App Row

    private func appRow(_ app: ShipSwiftApp) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "app.fill")
                .font(.title2)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(app.name)
                    .font(.subheadline.weight(.medium))
                if let badge = app.badge {
                    Text(badge)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    // MARK: - Device Info Helpers

    /// Read CPU brand string via sysctl
    private var chipName: String {
        var size: Int = 0
        sysctlbyname("machdep.cpu.brand_string", nil, &size, nil, 0)
        guard size > 0 else { return "Apple Silicon" }
        var buffer = [CChar](repeating: 0, count: size)
        sysctlbyname("machdep.cpu.brand_string", &buffer, &size, nil, 0)
        let name = String(cString: buffer)
        return name.isEmpty ? "Apple Silicon" : name
    }

    /// Physical memory in GB (integer)
    private var systemMemoryGB: Int {
        Int(ProcessInfo.processInfo.physicalMemory / (1024 * 1024 * 1024))
    }

    // MARK: - App Info

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "Unknown"
    }

    // MARK: - ShipSwift Apps Data

    private var shipSwiftApps: [ShipSwiftApp] {
        [
            ShipSwiftApp(name: "Klee", badge: "This App", url: nil),
            ShipSwiftApp(name: "SmileMax - Glow Up Coach", badge: nil,
                         url: URL(string: "https://apps.apple.com/us/app/smilemax/id6758947123")),
            ShipSwiftApp(name: "Fullpack - Packing & Outfit", badge: nil,
                         url: URL(string: "https://apps.apple.com/us/app/fullpack-packing-outfit/id6745692929")),
            ShipSwiftApp(name: "Brushmo - Oral Health Companion", badge: nil,
                         url: URL(string: "https://apps.apple.com/us/app/brushmo/id6744569822")),
            ShipSwiftApp(name: "Lifebang - Pro Cleaner", badge: nil,
                         url: URL(string: "https://apps.apple.com/us/app/lifebang/id6474886848")),
            ShipSwiftApp(name: "Journey - Goal Tracker", badge: nil,
                         url: URL(string: "https://apps.apple.com/us/app/journey-goal-tracker-diary/id6748666816")),
        ]
    }
}

// MARK: - ShipSwift App Model

private struct ShipSwiftApp: Identifiable {
    let id = UUID()
    let name: String
    let badge: String?
    let url: URL?
}

// MARK: - Preview

#Preview {
    SettingsView()
        .environment(ModelManager())
        .environment(LLMService())
        .environment(DownloadManager())
}
