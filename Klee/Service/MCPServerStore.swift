//
//  MCPServerStore.swift
//  Klee
//
//  Persists MCP server configurations to disk (JSON).
//  Injected as @Environment(MCPServerStore.self) throughout the app.
//

import Foundation
import Observation

@Observable
@MainActor
class MCPServerStore {

    // MARK: - Observable State

    var servers: [MCPServerConfig] = []

    /// Built-in connectors (read-only definition + current enabled state)
    var builtInServers: [MCPServerConfig] {
        servers.filter { $0.isBuiltIn }
    }

    /// Custom (user-installed) connectors
    var customServers: [MCPServerConfig] {
        servers.filter { !$0.isBuiltIn }
    }

    // MARK: - Persistence Path

    private let fileURL: URL = {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("Klee", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("mcp-servers.json")
    }()

    // MARK: - Init

    init() {
        load()
        injectBuiltInConnectors()
    }

    // MARK: - CRUD

    func add(server: MCPServerConfig) {
        servers.append(server)
        save()
    }

    func update(server: MCPServerConfig) {
        guard let index = servers.firstIndex(where: { $0.id == server.id }) else { return }
        servers[index] = server
        save()
    }

    func delete(id: UUID) {
        // Prevent deletion of built-in connectors
        guard servers.first(where: { $0.id == id })?.isBuiltIn != true else { return }
        servers.removeAll { $0.id == id }
        save()
    }

    /// Toggle only the enabled state of a built-in connector (name/command/args are immutable)
    func toggleBuiltIn(id: UUID, enabled: Bool) {
        guard let index = servers.firstIndex(where: { $0.id == id && $0.isBuiltIn }) else { return }
        servers[index].isEnabled = enabled
        save()
    }

    // MARK: - Built-in Injection

    /// Ensure all official built-in connectors exist in the persisted list.
    /// Only adds missing ones; preserves user's enabled/disabled state for existing ones.
    private func injectBuiltInConnectors() {
        let existingIDs = Set(servers.map(\.id))
        var didChange = false

        // Remove built-in connectors that are no longer in the official list
        let validBuiltInIDs = Set(BuiltInConnector.all.map(\.id))
        let staleCount = servers.count
        servers.removeAll { $0.isBuiltIn && !validBuiltInIDs.contains($0.id) }
        if servers.count != staleCount { didChange = true }

        for definition in BuiltInConnector.all {
            if !existingIDs.contains(definition.id) {
                // Insert built-in connectors at the beginning
                servers.insert(definition.toConfig(enabled: true), at: 0)
                didChange = true
            } else {
                // Update name/command/args in case the definition changed across app versions,
                // but preserve the user's enabled/disabled preference
                if let index = servers.firstIndex(where: { $0.id == definition.id }) {
                    let wasEnabled = servers[index].isEnabled
                    var updated = definition.toConfig(enabled: wasEnabled)
                    updated.env = servers[index].env  // Preserve user-added env vars
                    if servers[index] != updated {
                        servers[index] = updated
                        didChange = true
                    }
                }
            }
        }

        if didChange {
            save()
        }
    }

    // MARK: - Persistence

    private func save() {
        do {
            let data = try JSONEncoder().encode(servers)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("[MCPServerStore] Failed to save: \(error)")
        }
    }

    private func load() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            servers = try JSONDecoder().decode([MCPServerConfig].self, from: data)
        } catch {
            print("[MCPServerStore] Failed to load: \(error)")
        }
    }
}
