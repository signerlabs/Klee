//
//  ThinkingIndicator.swift
//  Klee
//
//  Three bouncing dots waiting animation, used in chat UI to indicate AI is thinking.
//  Core logic derived from ShipSwift SWThinkingIndicator, adapted for macOS.
//

import SwiftUI

// MARK: - ThinkingIndicator

struct ThinkingIndicator: View {

    // MARK: - Configurable Parameters

    var dotSize: CGFloat = 5
    var dotColor: Color = .secondary
    var spacing: CGFloat = 3

    // MARK: - Body

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.3)) { timeline in
            let phase = Int(timeline.date.timeIntervalSinceReferenceDate / 0.3) % 3
            HStack(spacing: spacing) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(dotColor)
                        .frame(width: dotSize, height: dotSize)
                        .offset(y: phase == index ? -(dotSize * 0.6) : 0)
                        .animation(.easeInOut(duration: 0.2), value: phase)
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 20) {
        ThinkingIndicator()
        ThinkingIndicator(dotSize: 8, dotColor: .blue, spacing: 5)
    }
    .padding()
}
