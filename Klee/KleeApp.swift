//
//  KleeApp.swift
//  Klee
//
//  App entry point. Initializes ProcessManager (which owns WebSocketManager),
//  handles graceful shutdown on app termination.
//

import SwiftUI

@main
struct KleeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var processManager = ProcessManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(processManager)
                .environmentObject(processManager.wsManager)
                .onAppear {
                    appDelegate.processManager = processManager
                }
        }
        .defaultSize(width: 900, height: 600)
        .commands {
            // Remove the default "New Window" command — single-window app
            CommandGroup(replacing: .newItem) {}
        }
    }
}

// MARK: - App Delegate for Graceful Shutdown

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var processManager: ProcessManager?

    /// Called when user quits the app (Cmd+Q, menu, etc.).
    /// Returns .terminateLater to allow async cleanup before exit.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        Task { @MainActor in
            processManager?.wsManager.disconnect()
            await processManager?.shutdownAll()
            NSApplication.shared.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}
