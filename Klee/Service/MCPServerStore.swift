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
        servers.removeAll { $0.id == id }
        save()
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
