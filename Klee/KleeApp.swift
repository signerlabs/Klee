//
//  KleeApp.swift
//  Klee
//
//  App entry point. Injects LLMService and ModelManager as environment objects.
//  Phase 1 refactor: removed ProcessManager and AppDelegate (subprocess management no longer needed).
//

import SwiftUI

@main
struct KleeApp: App {
    @State private var llmService = LLMService()
    @State private var modelManager = ModelManager()
    @State private var downloadManager = DownloadManager()

    init() {
        // HuggingFace mirror acceleration (uncomment for users in China)
        // LLMService.huggingFaceMirror = "https://hf-mirror.com"
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(llmService)
                .environment(modelManager)
                .environment(downloadManager)
        }
        .defaultSize(width: 960, height: 640)
        .commands {
            // Single-window app: remove the default "New Window" command
            CommandGroup(replacing: .newItem) {}
        }
    }
}
