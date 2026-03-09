# CLAUDE.md

项目详情见 README.md 和 klee-architecture-plan.md。

## 项目简介
Klee 是一个 macOS 原生本地 AI 聊天应用，使用 MLX Swift 作为推理引擎，面向非开发人员，零配置开箱即用。

## 开发约束
- Xcode Scheme：`Klee`
- Deployment Target：macOS 15.0+
- 推理引擎：mlx-swift-lm（SPM 依赖，进程内推理，无外部子进程）
- 模型格式：MLX safetensors（从 HuggingFace mlx-community 下载）
- 模型缓存路径：`~/Library/Caches/huggingface/hub/`
- App Sandbox：关闭（Phase 2 需要子进程管理）
- Hardened Runtime：开启
- 分发方式：Developer ID 直接分发（非 App Store）
- 不执行 xcodebuild，iOS/macOS 构建由主公在 Xcode 中测试
- **UI 文案使用英文，代码注释使用中文**

## 目录约定
- 视图放 View/（ChatView、ModelManagerView）
- 服务层放 Service/（LLMService、ModelManager）
- 数据模型放 Model/（AppState）
- 应用入口：KleeApp.swift、ContentView.swift

## 技术栈
- SwiftUI + @Observable（非 ObservableObject，项目使用 Swift 6 默认 MainActor 隔离）
- mlx-swift-lm >= 2.30.0（SPM 依赖，含 MLXLLM、MLXLMCommon）
- 环境注入使用 `@Environment(Type.self)` + `.environment()`（非 @EnvironmentObject）
- HuggingFace 镜像：默认 `hf-mirror.com`（KleeApp.init 中配置）

## Phase 规划
- **Phase 1（当前）**：纯本地聊天，MLX 推理，模型管理
- **Phase 2**：OpenClaw Gateway 集成（Node.js 子进程 + WebSocket）
- **Phase 3**：macOS 深度整合、多模态、Apple Foundation Models
