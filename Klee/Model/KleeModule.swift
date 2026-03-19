//
//  KleeModule.swift
//  Klee
//
//  Data model for a configurable module (web search connectors, platform services, etc.).
//

import Foundation

/// How a module authenticates
enum ModuleAuthType: String, Codable {
    case apiKey   // User provides an API key (e.g., Jina, Notion)
    case login    // User logs in via QR/OAuth (e.g., XiaoHongShu, Douyin)
    case none     // No auth needed
}

struct KleeModule: Identifiable, Codable, Equatable {
    let id: String              // "web_search", "xiaohongshu", "douyin"
    let name: String            // "Web Search", "小红书", "抖音"
    let icon: String            // SF Symbol name
    let authType: ModuleAuthType
    let skillPrompt: String     // Natural language capability description (~120 tokens)
    var isEnabled: Bool
    var apiKey: String?         // For .apiKey auth type
    var isAuthenticated: Bool   // For .login auth type

    /// Whether this module is ready to use
    var isReady: Bool {
        guard isEnabled else { return false }
        switch authType {
        case .apiKey: return apiKey != nil && !apiKey!.isEmpty
        case .login: return isAuthenticated
        case .none: return true
        }
    }

    /// Whether this module's skill should be injected into the system prompt
    var shouldInjectSkill: Bool { isReady }

}
