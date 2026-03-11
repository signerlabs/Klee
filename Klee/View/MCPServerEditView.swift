//
//  MCPServerEditView.swift
//  Klee
//
//  Add or edit an MCP server configuration.
//  Presented as a sheet from MCPServerListView.
//

import SwiftUI

struct MCPServerEditView: View {

    // MARK: - Mode

    enum Mode: Identifiable {
        case create
        case edit(MCPServerConfig)

        var id: String {
            switch self {
            case .create: return "create"
            case .edit(let config): return config.id.uuidString
            }
        }
    }

    let mode: Mode
    let onSave: (MCPServerConfig) -> Void

    @Environment(\.dismiss) private var dismiss

    // MARK: - Form State

    @State private var name: String = ""
    @State private var command: String = ""
    @State private var argsText: String = ""
    @State private var envPairs: [EnvPair] = []
    @State private var isEnabled: Bool = true
    @State private var configId: UUID = UUID()

    // MARK: - New Env Variable Input

    @State private var showAddEnv = false
    @State private var newEnvKey: String = ""
    @State private var newEnvValue: String = ""

    // MARK: - Validation

    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !command.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Form {
                // MARK: Server Info
                Section {
                    TextField("Name", text: $name, prompt: Text("Playwright Browser"))
                    TextField("Command", text: $command, prompt: Text("@playwright/mcp"))
                    Text("Klee uses the bundled Node.js to run `npx <command>`.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Extra Arguments", text: $argsText, prompt: Text("--headless, --port 3000"))
                    Text("Comma-separated additional CLI arguments.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Server Info")
                }

                // MARK: Environment Variables
                Section {
                    if envPairs.isEmpty {
                        Text("No environment variables configured.")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    } else {
                        ForEach($envPairs) { $pair in
                            envPairRow(pair: $pair)
                        }
                        .onDelete { indices in
                            envPairs.remove(atOffsets: indices)
                        }
                    }

                    // Inline add variable form
                    if showAddEnv {
                        VStack(spacing: 8) {
                            TextField("Key", text: $newEnvKey, prompt: Text("STRIPE_API_KEY"))
                                .textFieldStyle(.roundedBorder)
                            SecureField("Value", text: $newEnvValue, prompt: Text("sk-..."))
                                .textFieldStyle(.roundedBorder)
                            HStack {
                                Button("Cancel") {
                                    resetNewEnvFields()
                                }
                                Spacer()
                                Button("Add") {
                                    addEnvVariable()
                                }
                                .disabled(newEnvKey.trimmingCharacters(in: .whitespaces).isEmpty)
                            }
                            .controlSize(.small)
                        }
                        .padding(.vertical, 4)
                    } else {
                        Button {
                            showAddEnv = true
                        } label: {
                            Label("Add Variable", systemImage: "plus")
                        }
                    }
                } header: {
                    Text("Environment Variables")
                } footer: {
                    Text("e.g. STRIPE_API_KEY, NOTION_TOKEN, GITHUB_TOKEN")
                        .font(.caption)
                }
            }
            .formStyle(.grouped)
            .navigationTitle(isEditing ? "Edit Server" : "Add Server")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveAndDismiss() }
                        .disabled(!isValid)
                }
            }
        }
        .frame(minWidth: 440, idealWidth: 480, minHeight: 400, idealHeight: 500)
        .onAppear { populateFromMode() }
    }

    // MARK: - Env Pair Row

    private func envPairRow(pair: Binding<EnvPair>) -> some View {
        HStack(spacing: 8) {
            Text(pair.wrappedValue.key)
                .font(.callout)
                .fontDesign(.monospaced)
                .frame(minWidth: 100, alignment: .leading)

            // Masked value display with reveal toggle
            if pair.wrappedValue.isRevealed {
                TextField("Value", text: pair.value)
                    .textFieldStyle(.roundedBorder)
                    .font(.callout)
                    .fontDesign(.monospaced)
            } else {
                Text(maskedValue(pair.wrappedValue.value))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                pair.wrappedValue.isRevealed.toggle()
            } label: {
                Image(systemName: pair.wrappedValue.isRevealed ? "eye.slash" : "eye")
                    .imageScale(.small)
            }
            .buttonStyle(.borderless)
            .help(pair.wrappedValue.isRevealed ? "Hide value" : "Reveal value")
        }
    }

    // MARK: - Helpers

    private func maskedValue(_ value: String) -> String {
        if value.count <= 4 { return String(repeating: "*", count: max(value.count, 6)) }
        return String(value.prefix(2)) + String(repeating: "*", count: value.count - 4) + String(value.suffix(2))
    }

    private func addEnvVariable() {
        let key = newEnvKey.trimmingCharacters(in: .whitespaces)
        guard !key.isEmpty else { return }
        envPairs.append(EnvPair(key: key, value: newEnvValue))
        resetNewEnvFields()
    }

    private func resetNewEnvFields() {
        newEnvKey = ""
        newEnvValue = ""
        showAddEnv = false
    }

    private func populateFromMode() {
        if case .edit(let config) = mode {
            configId = config.id
            name = config.name
            command = config.command
            argsText = config.args.joined(separator: ", ")
            isEnabled = config.isEnabled
            envPairs = config.env.map { EnvPair(key: $0.key, value: $0.value) }
                .sorted { $0.key < $1.key }
        }
    }

    private func saveAndDismiss() {
        let args = argsText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        var env: [String: String] = [:]
        for pair in envPairs {
            let key = pair.key.trimmingCharacters(in: .whitespaces)
            if !key.isEmpty { env[key] = pair.value }
        }

        let config = MCPServerConfig(
            id: configId,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            command: command.trimmingCharacters(in: .whitespacesAndNewlines),
            args: args,
            env: env,
            isEnabled: isEnabled
        )

        onSave(config)
        dismiss()
    }
}

// MARK: - Env Pair Model

/// Local UI model for an environment variable key-value pair
private struct EnvPair: Identifiable {
    let id = UUID()
    var key: String
    var value: String
    var isRevealed: Bool = false
}

// MARK: - Preview

#Preview("Create") {
    MCPServerEditView(mode: .create) { config in
        print("Created: \(config.name)")
    }
}

#Preview("Edit") {
    MCPServerEditView(
        mode: .edit(MCPServerConfig(
            name: "Playwright",
            command: "@playwright/mcp",
            args: ["--headless"],
            env: ["BROWSER_TOKEN": "abc123secret456"]
        ))
    ) { config in
        print("Updated: \(config.name)")
    }
}
