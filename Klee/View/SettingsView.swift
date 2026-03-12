//
//  SettingsView.swift
//  Klee
//
//  Settings sheet with three panels: Connectors, Models, About.
//

import SwiftUI

// MARK: - Settings Panel Enum

/// Identifies which settings panel to display.
enum SettingsPanel: String, Identifiable, CaseIterable {
    case connectors
    case models
    case about

    var id: String { rawValue }

    var title: String {
        switch self {
        case .connectors: "Connectors"
        case .models: "Models"
        case .about: "About"
        }
    }

    var icon: String {
        switch self {
        case .connectors: "puzzlepiece.extension"
        case .models: "cpu"
        case .about: "info.circle"
        }
    }
}

// MARK: - Settings View

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State var initialPanel: SettingsPanel

    var body: some View {
        NavigationStack {
            Form {
                switch initialPanel {
                case .connectors:
                    connectorsContent
                case .models:
                    modelsContent
                case .about:
                    aboutContent
                }
            }
            .formStyle(.grouped)
            .navigationTitle(initialPanel.title)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .frame(minWidth: 540, idealWidth: 600, minHeight: 500, idealHeight: 600)
    }

    // MARK: - Connectors Panel

    @ViewBuilder
    private var connectorsContent: some View {
        MCPServerListView()
    }

    // MARK: - Models Panel

    @ViewBuilder
    private var modelsContent: some View {
        Section {
            LabeledContent {
                Text(chipName)
            } label: {
                Label("Chip", systemImage: "cpu")
            }
            LabeledContent {
                Text("\(systemMemoryGB) GB")
            } label: {
                Label("Memory", systemImage: "memorychip")
            }
            LabeledContent {
                Text(ProcessInfo.processInfo.operatingSystemVersionString)
            } label: {
                Label("macOS", systemImage: "apple.logo")
            }
        }

        Section {
            ModelManagerView()
        } footer: {
            Text("Klee runs AI models directly on your Mac — your conversations never leave your device. Models need to be downloaded once before use. Smaller models are faster and use less memory, while larger models give more detailed and nuanced answers. As a general rule, pick the largest model your Mac can comfortably run.")
        }
    }

    // MARK: - About Panel

    @ViewBuilder
    private var aboutContent: some View {
        Section {
            LabeledContent {
                Text(appVersion)
            } label: {
                Label("Version", systemImage: "app.badge")
            }
            LabeledContent {
                Text(buildNumber)
            } label: {
                Label("Build", systemImage: "hammer")
            }
            LabeledContent {
                Text("MLX Swift (on-device)")
            } label: {
                Label("Engine", systemImage: "bolt.fill")
            }
        }

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

    // MARK: - App Row

    private func appRow(_ app: ShipSwiftApp) -> some View {
        HStack {
            Image(app.assetName)
                .resizable()
                .scaledToFill()
                .frame(width: 24, height: 24)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            Text("\(app.name) - \(app.tagline)")
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

#Preview("Connectors") {
    SettingsView(initialPanel: .connectors)
        .environment(MCPServerStore())
        .environment(MCPServerManager())
}

#Preview("Models") {
    SettingsView(initialPanel: .models)
        .environment(ModelManager())
        .environment(LLMService())
        .environment(DownloadManager())
}

#Preview("About") {
    SettingsView(initialPanel: .about)
}
