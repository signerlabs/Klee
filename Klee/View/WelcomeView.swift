//
//  WelcomeView.swift
//  Klee
//
//  Welcome / onboarding screen shown when no messages exist.
//  Displays a greeting, optional model-download prompt, and a centered input bar.
//

import SwiftUI

struct WelcomeView<InputBar: View>: View {
    let needsModelDownload: Bool
    let onOpenSettings: () -> Void
    @ViewBuilder let inputBar: () -> InputBar

    /// Time-based greeting text
    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good Morning"
        case 12..<17: return "Good Afternoon"
        case 17..<22: return "Good Evening"
        default: return "Good Night"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Greeting
            VStack(spacing: 16) {
                HStack(spacing: 20) {
                    Image(.kleeLogo)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 50)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Text(greeting)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(.primary)
                }

                Text("How can Klee help you today?")
                    .foregroundStyle(.secondary)

                if needsModelDownload {
                    // Onboarding: prompt to download a model
                    Text("Download a model to start chatting locally.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button {
                        onOpenSettings()
                    } label: {
                        Label("Download a Model", systemImage: "arrow.down.to.line")
                    }
                    .controlSize(.large)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
                }
            }

            Spacer()

            // Centered input bar
            inputBar()
                .frame(maxWidth: 800)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
