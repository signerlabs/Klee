//
//  MCPServerListView.swift
//  Klee
//
//  Displays configured MCP servers split into Built-in and Custom sections.
//  Built-in connectors show toggle only (no edit/delete).
//  Custom connectors retain full edit/delete capabilities.
//  Embedded inside SettingsView's Form.
//

import SwiftUI

struct MCPServerListView: View {
    @Environment(MCPServerStore.self) var store
    @Environment(MCPServerManager.self) var manager

    @State private var showAddSheet = false
    @State private var editingServer: MCPServerConfig?
    @State private var serverToDelete: MCPServerConfig?
    @State private var showDeleteConfirm = false

    var body: some View {
        builtInSection
        customSection
            .sheet(isPresented: $showAddSheet) {
                MCPServerEditView(mode: .create) { newServer in
                    store.add(server: newServer)
                }
            }
            .sheet(item: $editingServer) { server in
                MCPServerEditView(mode: .edit(server)) { updated in
                    store.update(server: updated)
                }
            }
            .alert("Delete Server", isPresented: $showDeleteConfirm, presenting: serverToDelete) { server in
                Button("Delete", role: .destructive) {
                    manager.stop(id: server.id)
                    store.delete(id: server.id)
                }
                Button("Cancel", role: .cancel) {}
            } message: { server in
                Text("Remove \"\(server.name)\" from your MCP servers? This cannot be undone.")
            }
    }

    // MARK: - Built-in Section

    @ViewBuilder
    private var builtInSection: some View {
        Section("Built-in") {
            ForEach(store.builtInServers) { server in
                builtInRow(server)
            }
        }
    }

    // MARK: - Custom Section

    @ViewBuilder
    private var customSection: some View {
        Section {
            if store.customServers.isEmpty {
                customEmptyState
            } else {
                ForEach(store.customServers) { server in
                    customRow(server)
                }
            }

            // Add Connector button
            Button {
                showAddSheet = true
            } label: {
                Label("Add Connector", systemImage: "plus")
            }
        } header: {
            Text("Custom")
        } footer: {
            Text("Connectors let Klee talk to external tools and services — like browsing the web, reading files, or querying databases. Each connector is a small plugin (called an MCP server) that gives the AI new abilities beyond just chatting.")
        }
    }

    // MARK: - Built-in Row

    private func builtInRow(_ server: MCPServerConfig) -> some View {
        let status = manager.status(for: server.id)
        let definition = BuiltInConnector.find(by: server.id)
        let progress = manager.downloadProgress[server.id]
        let progressText = manager.downloadStatusText[server.id]

        return HStack(spacing: 10) {
            // Icon
            Image(systemName: definition?.icon ?? "puzzlepiece.extension")
                .foregroundStyle(.secondary)
                .frame(width: 20)

            // Server info
            VStack(alignment: .leading, spacing: 2) {
                Text(server.name)
                    .fontWeight(.medium)

                // Show download progress or normal description
                if let progressText {
                    HStack(spacing: 6) {
                        ProgressView(value: progress ?? 0)
                            .progressViewStyle(.linear)
                            .frame(maxWidth: 120)
                        Text(progressText)
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                } else {
                    Text(definition?.description ?? server.command)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Error indicator
                if case .error(let msg) = status {
                    Text(msg)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .lineLimit(1)
                }
            }

            Spacer()

            // Status dot (only when enabled)
            if server.isEnabled {
                statusDot(status)
            }

            // Toggle (the only control for built-in connectors)
            Toggle("", isOn: Binding(
                get: { server.isEnabled },
                set: { newValue in
                    store.toggleBuiltIn(id: server.id, enabled: newValue)

                    if newValue {
                        Task { await manager.start(server: server) }
                    } else {
                        manager.stop(id: server.id)
                    }
                }
            ))
            .toggleStyle(.switch)
            .labelsHidden()
            .controlSize(.small)
        }
        .contentShape(Rectangle())
    }

    // MARK: - Custom Row

    private func customRow(_ server: MCPServerConfig) -> some View {
        let status = manager.status(for: server.id)

        return HStack(spacing: 10) {
            // Status indicator dot
            statusDot(status)

            // Server info
            VStack(alignment: .leading, spacing: 2) {
                Text(server.name)
                    .fontWeight(.medium)
                Text(server.command)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                // Show error message if any
                if case .error(let msg) = status {
                    Text(msg)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .lineLimit(1)
                }
            }

            Spacer()

            // Enable/Disable toggle
            Toggle("", isOn: Binding(
                get: { server.isEnabled },
                set: { newValue in
                    var updated = server
                    updated.isEnabled = newValue
                    store.update(server: updated)

                    // Auto-start/stop based on toggle
                    if newValue {
                        Task { await manager.start(server: updated) }
                    } else {
                        manager.stop(id: server.id)
                    }
                }
            ))
            .toggleStyle(.switch)
            .labelsHidden()
            .controlSize(.small)

            // Edit button
            Button {
                editingServer = server
            } label: {
                Image(systemName: "pencil")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
            .help("Edit \(server.name)")

            // Delete button
            Button {
                serverToDelete = server
                showDeleteConfirm = true
            } label: {
                Image(systemName: "trash")
                    .foregroundStyle(.red.opacity(0.7))
            }
            .buttonStyle(.borderless)
            .help("Delete \(server.name)")
        }
        .contentShape(Rectangle())
    }

    // MARK: - Custom Empty State

    private var customEmptyState: some View {
        VStack(spacing: 8) {
            Text("No custom connectors yet.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Add third-party MCP servers to extend Klee's capabilities.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    // MARK: - Status Dot

    private func statusDot(_ status: MCPServerManager.MCPServerStatus) -> some View {
        Circle()
            .fill(statusColor(status))
            .frame(width: 8, height: 8)
            .overlay {
                if status == .starting {
                    ProgressView()
                        .controlSize(.mini)
                        .scaleEffect(0.5)
                }
            }
    }

    private func statusColor(_ status: MCPServerManager.MCPServerStatus) -> Color {
        switch status {
        case .stopped:  return .gray
        case .starting: return .yellow
        case .running:  return .green
        case .error:    return .red
        }
    }
}

// MARK: - Preview

#Preview {
    Form {
        MCPServerListView()
    }
    .formStyle(.grouped)
    .environment(MCPServerStore())
    .environment(MCPServerManager())
    .frame(width: 540, height: 500)
}
