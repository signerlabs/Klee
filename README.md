# Klee

A native macOS AI chat app that runs entirely on your Mac. No cloud, no account, no subscription.

Klee uses [MLX](https://github.com/ml-explore/mlx-swift) to run large language models directly on Apple Silicon, so your conversations never leave your device.

## Features

- **100% local inference** -- your data stays on your Mac
- **No account or API key required** -- download and start chatting
- **One-click model download** -- pick a model, Klee handles the rest
- **Streaming responses** -- tokens appear as they're generated
- **Lightweight** -- native SwiftUI app, no Electron, no Docker, no background services

## System Requirements

| Requirement | Minimum |
|---|---|
| macOS | 15.0 (Sequoia) or later |
| Chip | Apple Silicon (M1 or later) |
| RAM | 8 GB (see model table below) |

More RAM unlocks larger, more capable models:

| RAM | Recommended Models |
|---|---|
| 8 GB | Gemma 3 4B, Qwen3 4B, Phi 4 Mini |
| 16 GB | Qwen3 8B, Gemma 3 12B, DeepSeek R1 8B |
| 32 GB | Qwen3 14B, Qwen3 30B (MoE) |
| 64 GB+ | Gemma 3 27B, DeepSeek R1 32B |

## Install

Klee is distributed directly as a signed macOS app (Developer ID), not through the App Store.

1. Download the latest `.dmg` from [Releases](https://github.com/signerlabs/Klee/releases)
2. Drag **Klee** into your Applications folder
3. Open Klee -- if macOS shows a Gatekeeper warning, go to **System Settings > Privacy & Security** and click "Open Anyway"

## Usage

1. **Open Klee** -- the app detects your system RAM and shows compatible models
2. **Download a model** -- tap the download button next to any recommended model. Downloads resume automatically if interrupted
3. **Start chatting** -- select the downloaded model and type your message

Models are cached in `~/Library/Caches/models/` and persist across app restarts.

## Supported Models

All models are 4-bit quantized variants from the [mlx-community](https://huggingface.co/mlx-community) on HuggingFace.

| Model | Size | Min RAM | HuggingFace ID |
|---|---|---|---|
| Gemma 3 4B | ~3 GB | 8 GB | `mlx-community/gemma-3-4b-it-qat-4bit` |
| Qwen3 4B | ~2.5 GB | 8 GB | `mlx-community/Qwen3-4B-4bit` |
| Phi 4 Mini | ~2.2 GB | 8 GB | `mlx-community/Phi-4-mini-instruct-4bit` |
| Qwen3 8B | ~5 GB | 16 GB | `mlx-community/Qwen3-8B-4bit` |
| Gemma 3 12B | ~8 GB | 16 GB | `mlx-community/gemma-3-12b-it-qat-4bit` |
| DeepSeek R1 8B | ~4.6 GB | 16 GB | `mlx-community/DeepSeek-R1-0528-Qwen3-8B-4bit` |
| Qwen3 14B | ~8 GB | 32 GB | `mlx-community/Qwen3-14B-4bit` |
| Qwen3 30B (MoE) | ~17 GB | 32 GB | `mlx-community/Qwen3-30B-A3B-4bit` |
| Gemma 3 27B | ~17 GB | 64 GB | `mlx-community/gemma-3-27b-it-qat-4bit` |
| DeepSeek R1 32B | ~18 GB | 64 GB | `mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit` |

## Build from Source

Requires Xcode 16+ and macOS 15.0+.

```bash
git clone https://github.com/signerlabs/Klee.git
cd Klee
open Klee.xcodeproj
```

Select the **Klee** scheme, then build and run (Cmd+R). SPM dependencies (mlx-swift-lm) will resolve automatically on first build.

## License

MIT
