//
//  KleeModule.swift
//  Klee
//
//  Data model for a platform module (e.g., XiaoHongShu, Douyin, Bilibili).
//

import Foundation

struct KleeModule: Identifiable, Codable, Equatable {
    let id: String              // "xiaohongshu", "douyin", "bilibili", "notion"
    let name: String            // "小红书", "抖音", "B站", "Notion"
    let icon: String            // SF Symbol name
    let skillPrompt: String     // Natural language capability description (~120 tokens)
    var isEnabled: Bool         // User toggle
    var isAuthenticated: Bool   // Whether login/auth is complete

    /// Whether this module's skill should be injected into the system prompt
    var shouldInjectSkill: Bool {
        isEnabled && isAuthenticated
    }
}
