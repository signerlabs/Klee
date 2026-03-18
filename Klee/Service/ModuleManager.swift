//
//  ModuleManager.swift
//  Klee
//
//  Manages platform modules: registration, enable/disable, authentication state.
//  Injected as @Environment(ModuleManager.self) throughout the app.
//

import Foundation
import Observation

@Observable
@MainActor
class ModuleManager {

    /// All registered modules
    private(set) var modules: [KleeModule] = []

    // Persistence path
    private let fileURL: URL = {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("Klee", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("modules.json")
    }()

    init() {
        load()
        injectBuiltInModules()
    }

    // MARK: - Module State

    func toggleModule(id: String, enabled: Bool) {
        guard let index = modules.firstIndex(where: { $0.id == id }) else { return }
        modules[index].isEnabled = enabled
        save()
    }

    func setAuthenticated(id: String, authenticated: Bool) {
        guard let index = modules.firstIndex(where: { $0.id == id }) else { return }
        modules[index].isAuthenticated = authenticated
        save()
    }

    /// Modules whose skills should be injected into the system prompt
    var activeModules: [KleeModule] {
        modules.filter { $0.shouldInjectSkill }
    }

    /// Combined skill prompt for all active modules
    var combinedSkillPrompt: String {
        let skills = activeModules.map { $0.skillPrompt }
        return skills.joined(separator: "\n\n")
    }

    // MARK: - Built-in Modules

    /// Static definitions for all known platform modules.
    /// These are placeholders — actual service implementations come later.
    static let builtInModules: [KleeModule] = [
        KleeModule(
            id: "xiaohongshu",
            name: "小红书",
            icon: "note.text",
            skillPrompt: "你可以操作小红书：搜索笔记、阅读内容、查看/发表评论、点赞收藏、发布图文/视频笔记、查看通知。发布前请确认用户意图和内容完整性。搜索时默认返回 10 条结果。",
            isEnabled: false,
            isAuthenticated: false
        ),
        // More modules will be added as they are implemented
    ]

    private func injectBuiltInModules() {
        let existingIds = Set(modules.map(\.id))
        var didChange = false
        for definition in Self.builtInModules {
            if !existingIds.contains(definition.id) {
                modules.append(definition)
                didChange = true
            }
        }
        if didChange { save() }
    }

    // MARK: - Persistence

    private func save() {
        do {
            let data = try JSONEncoder().encode(modules)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("[ModuleManager] Failed to save: \(error)")
        }
    }

    private func load() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            modules = try JSONDecoder().decode([KleeModule].self, from: data)
        } catch {
            print("[ModuleManager] Failed to load: \(error)")
        }
    }
}
