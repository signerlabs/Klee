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
        HStack {
            Image(app.assetName)
                .resizable()
                .scaledToFill()
                .frame(width: 24, height: 24)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            Text("\(app.name) - \(app.tagline)")
                .foregroundStyle(.accent)
            Spacer()
            Image(systemName: "arrow.up.right")
                .imageScale(.small)
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
            ShipSwiftApp(name: "ShipSwift", assetName: "ShipSwift Logo", tagline: "MCP Codebase",  customURL: "https://shipswift.app"),
            ShipSwiftApp(name: "SmileMax",  assetName: "SmileMax Logo",  tagline: "Glow Up Coach",                    appId: "6758947123"),
            ShipSwiftApp(name: "Fullpack",  assetName: "Fullpack Logo",  tagline: "Packing & Outfit",                 appId: "6745692929"),
            ShipSwiftApp(name: "Brushmo",   assetName: "Brushmo Logo",   tagline: "Oral Health Companion",            appId: "6744569822"),
            ShipSwiftApp(name: "Lifebang",  assetName: "Lifebang Logo",  tagline: "Pro Cleaner",                      appId: "6474886848"),
            ShipSwiftApp(name: "Journey",   assetName: "Journey Logo",   tagline: "Goal Tracker & Diary",             appId: "6748666816"),
        ]
    }
}

// MARK: - ShipSwift App Model

private struct ShipSwiftApp: Identifiable {
    let id = UUID()
    let name: String
    let assetName: String
    let tagline: String
    var appId: String? = nil
    var customURL: String? = nil

    var url: URL? {
        if let custom = customURL { return URL(string: custom) }
        if let appId { return URL(string: "https://apps.apple.com/app/id\(appId)") }
        return nil
    }
}

// MARK: - Preview

#Preview {
    SettingsView()
        .environment(ModelManager())
        .environment(LLMService())
        .environment(DownloadManager())
}
