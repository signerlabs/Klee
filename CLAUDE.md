# CLAUDE.md

See README.md and klee-architecture-plan.md for full project details.

All comments and UI text must be in English (this is a public repo).

## Project Overview
Klee is a macOS-native local AI chat application powered by MLX Swift for inference, designed for non-developers with zero-configuration out-of-the-box experience.

## Development Constraints
- Xcode Scheme: `Klee`
- Deployment Target: macOS 15.0+
- Inference Engine: mlx-swift-lm (SPM dependency, in-process inference, no external subprocesses)
- Model Format: MLX safetensors (downloaded from HuggingFace mlx-community)
- Model Cache Path: `~/Library/Caches/models/{org}/{model-name}/`
- App Sandbox: Disabled (Phase 2 requires subprocess management)
- Hardened Runtime: Enabled
- Distribution: Developer ID direct distribution (not App Store)
- Do not run xcodebuild; macOS builds are tested by the developer in Xcode
- **All UI text and code comments must be in English**

## Directory Conventions
- Views go in View/ (ChatView, ModelManagerView)
- Service layer goes in Service/ (LLMService, ModelManager)
- Data models go in Model/ (AppState)
- Static data goes in Data/ (RecommendedModels)
- App entry point: KleeApp.swift, ContentView.swift

## Tech Stack
- SwiftUI + @Observable (not ObservableObject; project uses Swift 6 default MainActor isolation)
- mlx-swift-lm >= 2.30.0 (SPM dependency, includes MLXLLM, MLXLMCommon)
- Environment injection uses `@Environment(Type.self)` + `.environment()` (not @EnvironmentObject)
- HuggingFace mirror: default `hf-mirror.com` (configured in KleeApp.init)

## Phase Roadmap
- **Phase 1 (current)**: Local-only chat, MLX inference, model management
- **Phase 2**: OpenClaw Gateway integration (Node.js subprocess + WebSocket)
- **Phase 3**: Deep macOS integration, multimodal, Apple Foundation Models
