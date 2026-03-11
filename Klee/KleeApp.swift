//
//  KleeApp.swift
//  Klee
//
//  App entry point. Injects all service objects via SwiftUI Environment.
//

import SwiftUI

@main
struct KleeApp: App {
    @State private var llmService = LLMService()
    @State private var modelManager = ModelManager()
    @State private var downloadManager = DownloadManager()
    @State private var chatStore = ChatStore()
    @State private var mcpServerStore = MCPServerStore()
    @State private var mcpServerManager = MCPServerManager()
    @State private var mcpClientManager = MCPClientManager()

    init() {
        // HuggingFace mirror acceleration (uncomment for users in China)
        // LLMService.huggingFaceMirror = "https://hf-mirror.com"
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(llmService)
                .environment(modelManager)
                .environment(downloadManager)
                .environment(chatStore)
                .environment(mcpServerStore)
                .environment(mcpServerManager)
                .environment(mcpClientManager)
                // Auto-connect enabled MCP servers on app launch
                .task {
                    await autoConnectEnabledServers()
                }
                // Stop all MCP server subprocesses on app termination to prevent orphans
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
                    mcpServerManager.stopAll()
                }
        }
        .defaultSize(width: 960, height: 640)
        .commands {
            // Single-window app: remove the default "New Window" command
            CommandGroup(replacing: .newItem) {}
        }
    }

    // MARK: - Auto-Connect

    /// Start and connect all enabled MCP servers at app launch
    private func autoConnectEnabledServers() async {
        let enabledServers = mcpServerStore.servers.filter { $0.isEnabled }
        guard !enabledServers.isEmpty else { return }

        for server in enabledServers {
            await mcpServerManager.start(server: server)

            // Only connect if the server started successfully
            if mcpServerManager.status(for: server.id) == .running,
               let stdinPipe = mcpServerManager.stdinPipe(for: server.id),
               let stdoutPipe = mcpServerManager.stdoutPipe(for: server.id) {
                await mcpClientManager.connect(server: server, stdinPipe: stdinPipe, stdoutPipe: stdoutPipe)
            }
        }
    }
}
