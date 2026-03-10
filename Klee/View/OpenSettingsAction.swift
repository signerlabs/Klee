//
//  OpenSettingsAction.swift
//  Klee
//
//  Environment action to open the Settings sheet from any descendant view.
//

import SwiftUI

/// Callable action that opens the Settings sheet.
struct OpenSettingsAction {
    private let handler: () -> Void

    init(_ handler: @escaping () -> Void) {
        self.handler = handler
    }

    func callAsFunction() {
        handler()
    }
}

// MARK: - Environment Key

private struct OpenSettingsActionKey: EnvironmentKey {
    static let defaultValue = OpenSettingsAction {}
}

extension EnvironmentValues {
    var openSettings: OpenSettingsAction {
        get { self[OpenSettingsActionKey.self] }
        set { self[OpenSettingsActionKey.self] = newValue }
    }
}
