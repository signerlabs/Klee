//
//  SidebarHoverButton.swift
//  Klee
//
//  A ViewModifier that gives sidebar buttons a hover highlight background.
//

import SwiftUI

// MARK: - Modifier

private struct SidebarHoverButtonModifier: ViewModifier {
    @State private var isHovering = false
    var cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content
            .buttonStyle(.plain)
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(Color.primary.opacity(isHovering ? 0.1 : 0))
            )
            .onHover { isHovering = $0 }
    }
}

// MARK: - View Extension

extension View {
    func sidebarHoverButton(cornerRadius: CGFloat = 8) -> some View {
        modifier(SidebarHoverButtonModifier(cornerRadius: cornerRadius))
    }
}
