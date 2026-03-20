# Klee

A native macOS AI agent that runs entirely on your Mac. No cloud, no account, no subscription.

Klee uses [MLX](https://github.com/ml-explore/mlx-swift) to run large language models directly on Apple Silicon, so your conversations never leave your device.

## Features

- **100% local inference** -- your data stays on your Mac
- **No account or API key required** -- download and start chatting
- **One-click model download** -- pick a model, Klee handles the rest
- **Native tool calling** -- the AI can read/write files, search the web, and run shell commands
- **Vision support** -- attach images to your messages with supported VLM models
- **Web search** -- search the web via Jina AI (free API key, configurable in sidebar)
- **Streaming responses** -- tokens appear as they're generated
- **Inline thinking** -- see the model's reasoning process in a collapsible card
- **Platform modules** -- extend the AI with native Swift integrations (coming soon)
- **Lightweight** -- ~75MB native SwiftUI app, no Electron, no Docker, no background services

## System Requirements

| Requirement | Minimum |
|---|---|
| macOS | 15.0 (Sequoia) or later |
| Chip | Apple Silicon (M1 or later) |
| RAM | 16 GB (see model table below) |

More RAM unlocks larger, more capable models:

| RAM | Recommended Models |
|---|---|
| 16 GB | Qwen 3.5 9B, Qwen 3 8B, Gemma 3 12B, DeepSeek R1 8B |
| 32 GB | Qwen 3.5 27B, Qwen 3.5 35B (MoE) |
| 64 GB | Gemma 3 27B, DeepSeek R1 32B |
| 96 GB+ | Qwen 3.5 122B (MoE) |

## Install

Klee is distributed directly as a signed macOS app (Developer ID), not through the App Store.

1. Download the latest `.dmg` from [Releases](https://github.com/signerlabs/Klee/releases)
2. Drag **Klee** into your Applications folder
3. Open Klee -- if macOS shows a Gatekeeper warning, go to **System Settings > Privacy & Security** and click "Open Anyway"

## Usage

1. **Open Klee** -- the app detects your system RAM and shows compatible models
2. **Download a model** -- tap the download button next to any recommended model. Downloads resume automatically if interrupted
3. **Start chatting** -- select the downloaded model and type your message

The AI can help you with file operations, web lookups, and shell commands -- just ask naturally.

### Web Search Setup (Optional)

To enable web search:

1. Get a free API key at [jina.ai](https://jina.ai/?sui=apikey) (no credit card needed)
2. Click the sidebar toggle button (top-right)
3. Enable **Web Search** and paste your API key
4. Ask Klee to search for anything

Models are cached in `~/.klee/models/` and persist across app restarts.

## Supported Models

All models are 4-bit quantized variants from the [mlx-community](https://huggingface.co/mlx-community) on HuggingFace.

| Model | Size | Min RAM | Vision | HuggingFace ID |
|---|---|---|---|---|
| Qwen 3.5 9B | ~6 GB | 16 GB | Yes | `mlx-community/Qwen3.5-9B-4bit` |
| Qwen 3 8B | ~4.3 GB | 16 GB | | `mlx-community/Qwen3-8B-4bit` |
| Gemma 3 12B | ~8 GB | 16 GB | | `mlx-community/gemma-3-12b-it-qat-4bit` |
| DeepSeek R1 8B | ~4.6 GB | 16 GB | | `mlx-community/DeepSeek-R1-0528-Qwen3-8B-4bit` |
| Qwen 3.5 27B | ~16 GB | 32 GB | Yes | `mlx-community/Qwen3.5-27B-4bit` |
| Qwen 3.5 35B (MoE) | ~20 GB | 32 GB | Yes | `mlx-community/Qwen3.5-35B-A3B-4bit` |
| Gemma 3 27B | ~17 GB | 64 GB | | `mlx-community/gemma-3-27b-it-qat-4bit` |
| DeepSeek R1 32B | ~18 GB | 64 GB | | `mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit` |
| Qwen 3.5 122B (MoE) | ~70 GB | 96 GB | Yes | `mlx-community/Qwen3.5-122B-A10B-4bit` |

## Built-in Tools

Klee uses native tool calling (mlx-swift-lm ToolCall API) -- no MCP, no Node.js, no external processes.

| Tool | Description |
|---|---|
| `file_write` | Create or overwrite files |
| `file_read` | Read file contents |
| `file_list` | List directory contents |
| `file_delete` | Delete files |
| `web_search` | Search the web (requires Jina API key) |
| `web_fetch` | Fetch and extract webpage content |
| `shell_exec` | Execute shell commands (30s timeout) |

## Build from Source

Requires Xcode 16+ and macOS 15.0+.

```bash
git clone https://github.com/signerlabs/Klee.git
cd Klee
open Klee.xcodeproj
```

Select the **Klee** scheme, then build and run (Cmd+R). SPM dependency (mlx-swift-lm) will resolve automatically on first build.

## Acknowledgements

Klee was built with components and architecture from [ShipSwift](https://shipswift.app).

## License

MIT
