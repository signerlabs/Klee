//
//  MCPServerListView.swift
//  Klee
//
//  Displays configured MCP servers with status indicators, toggle, and delete.
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
        @Bindable var store = store

        if store.servers.isEmpty {
            emptyState
        } else {
            serverList
        }

        // Add Server button
        Button {
            showAddSheet = true
        } label: {
            Label("Add Server", systemImage: "plus")
        }
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

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "server.rack")
                .font(.title2)
                .foregroundStyle(.quaternary)
            Text("No MCP servers configured")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Add one to enable Agent capabilities.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    // MARK: - Server List

    private var serverList: some View {
        ForEach(store.servers) { server in
            serverRow(server)
        }
    }

    // MARK: - Server Row

    private func serverRow(_ server: MCPServerConfig) -> some View {
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
        Section("MCP Servers") {
            MCPServerListView()
        }
    }
    .formStyle(.grouped)
    .environment(MCPServerStore())
    .environment(MCPServerManager())
    .frame(width: 540, height: 400)
}
