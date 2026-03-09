//
//  KleeApp.swift
//  Klee
//
//  应用入口。注入 LLMService 和 ModelManager 作为环境对象。
//  Phase 1 重构：移除 ProcessManager 和 AppDelegate（不再需要子进程管理）。
//

import SwiftUI

@main
struct KleeApp: App {
    @State private var llmService = LLMService()
    @State private var modelManager = ModelManager()

    init() {
        // 国内用户默认启用 HuggingFace 镜像加速
        // 后续可在设置界面让用户切换
        LLMService.huggingFaceMirror = "https://hf-mirror.com"
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(llmService)
                .environment(modelManager)
        }
        .defaultSize(width: 960, height: 640)
        .commands {
            // 单窗口应用，移除默认的「新建窗口」命令
            CommandGroup(replacing: .newItem) {}
        }
    }
}
