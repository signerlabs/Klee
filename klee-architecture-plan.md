# Klee 架构方案：模块化本地 AI Agent 平台

> 目标：打造 Mac 原生的模块化本地 AI Agent 平台——用户下载即用，根据需求启用功能模块（小红书运营、B站管理等），AI 自动调用模块完成任务，数据不出本机。
>
> 文档版本：v1.0 | 更新日期：2026-03-18

---

## 一、产品定位

**从"本地聊天应用"升级为"模块化本地 AI Agent 平台"。**

用户下载 Klee 后，根据自己的需求启用功能模块（如小红书运营、B站管理、文件处理等），AI 自动调用对应模块完成任务。

**核心价值主张：**
- 下载即用，零配置，无需安装 Ollama / Python / 任何外部依赖
- 完全本地推理，数据私密
- Apple Silicon 原生优化，性能最优（MLX 引擎比 llama.cpp 快 21%-87%）
- 原生 SwiftUI，体积小、内存低、Mac 系统深度整合
- 模块化扩展：Swift 原生 Service，按需启用，无外部进程依赖

---

## 二、技术架构

### 核心引擎选择：MLX Swift

**为什么不用 Ollama：**

| 问题 | 说明 |
|------|------|
| 架构定位转变 | Ollama v0.10+ 转型为独立桌面产品（内置 GUI + Menu Bar），不再是可嵌入组件 |
| 进程管理复杂 | 需要管理子进程生命周期、防孤儿、Watchdog、端口冲突 |
| 签名/公证困难 | 外部二进制需单独签名、Gatekeeper/provenance 问题频发 |
| 性能开销 | HTTP API 中转层 + 独立进程内存开销，实测 20-40 tok/s |
| 版本追赶 | 每次 Ollama 架构变化都可能破坏嵌入方案 |

**为什么选 MLX Swift：**

| 优势 | 说明 |
|------|------|
| Apple 官方 | Apple ML Research 团队维护，WWDC 2025 两个专题 Session |
| 纯 Swift | SPM 依赖，编译进 app，无外部进程、无 Python |
| 性能最优 | Apple Silicon 统一内存零拷贝，~230 tok/s（M2 Ultra） |
| 零配置 | 用户无需安装任何东西 |
| 模型丰富 | mlx-community 122+ 模型集合，主流模型全覆盖 |
| 双平台 | 同一套代码可跑 macOS + iOS |

### 整体架构

```
┌──────────────────────────────────────────────────────────┐
│  Klee.app (SwiftUI macOS) — 纯 Swift，零外部进程         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  UI 层：SwiftUI 原生界面                            │  │
│  │  对话、模型管理、模块管理、设置、Inspector           │  │
│  └────────────────────────────────────────────────────┘  │
│                          │                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  LLM 推理层：mlx-swift-lm (SPM, 进程内推理)        │  │
│  │  模型加载 / 流式推理 / Metal GPU / 量化(3-8bit)     │  │
│  └────────────────────────────────────────────────────┘  │
│                          │                               │
│         ┌────────────────┴────────────────┐              │
│         ▼                                 ▼              │
│  ┌─────────────────────┐  ┌────────────────────────┐    │
│  │ Module Layer         │  │ Skill Layer             │    │
│  │ (Swift 原生 Service) │  │ (渐进式上下文注入)       │    │
│  │ XHS / Bili / Weibo   │  │ ~120 tokens/模块        │    │
│  └──────────┬──────────┘  └────────────────────────┘    │
│             │                                            │
│             ▼                                            │
│       URLSession (统一 HTTP 层)                           │
└──────────────────────────────────────────────────────────┘
```

### App Bundle 结构

```
Klee.app/
└── Contents/
    ├── MacOS/
    │   └── Klee              # SwiftUI 主程序（含 MLX 引擎 + 模块 Service，静态链接）
    ├── Resources/
    │   └── QwenChatTemplate.txt
    └── Frameworks/
        └── (MLX Metal shaders 等)
```

**不含任何外部运行时**——无 Node.js、无 Python、无子进程。所有模块能力编译进 Klee 本体。

### App Bundle 体积预估

| 组件 | 体积 |
|------|------|
| Klee SwiftUI 本体 + MLX 引擎 + 模块 Service | ~65 MB |
| Metal shaders (mlx.metallib) | ~10 MB |
| **总计** | **~75 MB** |
| DMG 压缩后 | **~40 MB** |

竞品参考：Swama ~30MB（仅 CLI），LM Studio ~300MB，Claude Desktop ~400MB，Cursor ~500MB。**Klee 是功能最完整的方案中体积最小的。**

模型文件不打包进 app，首次使用时按需下载到 `~/Library/Caches/models/`。

---

## 三、关键技术决策

### 为什么用 SwiftUI 而不是 Electron

| 对比项 | Electron（LM Studio / Jan） | SwiftUI（Klee） |
|---|---|---|
| 包体积 | 200MB+ 基础开销 | 紧凑 |
| 内存占用 | ~300MB 基础 | ~50MB 基础 |
| macOS 整合 | 弱 | 深度原生（Notification、Spotlight、Share） |
| Apple Silicon 优化 | 有限 | 完整 Metal 加速 + 统一内存 |
| 推理引擎嵌入 | 需要子进程/IPC | 直接链接，进程内调用 |

### 为什么放弃 RAG

Agent + 长上下文的组合比 RAG 更优雅：
- 不需要向量数据库、embedding 模型、chunk 策略
- 没有 Python 依赖、没有 LanceDB
- 技术栈极度简化

### MLX vs llama.cpp

| 对比项 | MLX Swift | llama.cpp |
|---|---|---|
| Apple Silicon 性能 | **最优**（~230 tok/s） | 良好（~150 tok/s） |
| Swift 集成 | 官方 SPM，原生 API | 需 C 桥接（unsafeFlags 问题） |
| 模型格式 | safetensors (MLX) | GGUF |
| 模型生态 | mlx-community 122+ 集合 | GGUF 最广泛（60+ 架构） |
| 维护方 | Apple ML Research | 社区 |
| Metal 优化 | 原生设计 | 后加的 Metal backend |

**结论**：Klee 只做 Mac，MLX 是 Apple Silicon 上的最优选择。llama.cpp 的优势在跨平台，对我们无价值。

### Foundation Models Framework（macOS 26）

Apple 在 WWDC 2025 发布的系统内置 LLM API，3B 参数模型：
- **优点**：零依赖，3 行代码，系统内置
- **缺点**：只有 Apple 的 3B 模型，不可更换，能力有限
- **策略**：作为**补充功能**（摘要、分类等轻量任务），不作为核心聊天引擎

### 为什么不用 MCP 而用 Swift 原生 Service

本地模型上下文窗口远小于云端：

| 模型 | 上下文窗口 | 对比 |
|------|-----------|------|
| Qwen 3.5 9B (Klee 主力) | ~32K tokens | — |
| DeepSeek R1 8B | ~8-16K tokens | — |
| Claude Sonnet (云端) | 200K tokens | **6-25 倍** |

**上下文窗口是本地模型最稀缺的资源。** MCP 协议要求将工具 JSON Schema 完整注入上下文（26 个工具 ≈ 3,600 tokens），对本地模型是不可承受之重。Swift 原生 Service 通过 Skill 描述（~120 tokens/模块）实现同等能力，**上下文效率提升 30-50 倍**。详见第六章。

此外，移除 MCP 还带来：
- **体积减半**：去掉 Node.js 运行时（104MB），App 从 ~180MB 降至 ~75MB
- **签名简化**：不再需要 JIT entitlement，可能重回 App Store 分发
- **零进程管理**：无子进程生命周期、无孤儿进程问题
- **架构纯净**：纯 Swift 进程内调用，无 IPC 开销

---

## 四、MLX 推理层设计

### SPM 依赖

```swift
// Package.swift 或 Xcode: File > Add Package Dependencies
dependencies: [
    .package(url: "https://github.com/ml-explore/mlx-swift-lm", from: "2.30.0"),
]
```

只需引入 `mlx-swift-lm`，它会自动拉取底层的 `mlx-swift`。

### 核心推理代码

```swift
import MLXLMCommon

@Observable
class LLMService {
    private(set) var state: LLMState = .idle
    private(set) var currentModelId: String?
    private var modelContainer: ModelContainer?

    func loadModel(id: String) async { ... }

    func chat(messages: [ChatMessage], tools: [[String: any Sendable]]? = nil,
              images: [UserInput.Image] = []) -> AsyncStream<GenerationChunk> { ... }

    func stopGeneration() { ... }
    func unloadModel() { ... }
}
```

### 模型管理

模型文件存储在本地缓存目录：`~/Library/Caches/models/{org}/{model-name}/`

### 模型推荐策略（按内存）

| 系统内存 | 推荐模型 | 模型大小 | Vision |
|---------|---------|---------|--------|
| 16GB | Qwen 3.5 9B / Gemma 3 12B / DeepSeek R1 8B | ~4-8 GB | Qwen 3.5 支持 |
| 32GB | Qwen 3.5 27B / Qwen 3.5 35B (MoE) | ~16-20 GB | 支持 |
| 64GB | Gemma 3 27B / DeepSeek R1 32B | ~17-18 GB | — |
| 96GB+ | Qwen 3.5 122B (MoE) | ~70 GB | 支持 |

MLX 利用统一内存，16GB Mac 也能流畅跑 9B 模型。

---

## 五、MLX 推理性能优化：借鉴 oMLX

> **这是当前最高优先级。** 推理速度直接决定产品可用性。

### 5.1 问题背景

Klee 从 Qwen3-8B（纯文本 LLM）切换到 Qwen3.5-9B（原生多模态 VLM）后，推理速度严重下降：

**根因分析：**

| 因素 | 说明 | 影响程度 |
|------|------|---------|
| **架构差异** | Qwen3.5 使用 Gated DeltaNet 线性注意力（24 层）+ 标准注意力（8 层），MLX Metal kernel 刚合并支持 | **致命** |
| **VLM 管线开销** | 通过 VLMModelFactory 加载，即使纯文本也无条件加载 27 层 Vision Encoder (~300-400M 参数) | **高** |
| **Swift evalLock 瓶颈** | mlx-swift-lm 的全局 evalLock 串行化 GPU 操作，VLM/MoE 模型每次 forward 30-40 次操作（密集模型仅 8-10 次），锁开销放大 3-4 倍 | **高** |
| **dtype 退化** | Gated DeltaNet 的 input_embeddings dtype 不匹配时速度下降 2.7x | **中** |
| **缓存类型混合** | Qwen3.5 混合 KVCache（标准注意力层）+ ArraysCache（DeltaNet 层），复杂度高于纯 KVCache 模型 | **中** |

**实测数据（来自 GitHub Issues）：**

| 模型 | Swift (mlx-swift-lm) | Python (mlx-lm) | 差距 |
|------|----------------------|------------------|------|
| Qwen3-8B（密集 LLM） | ~52.8 tok/s | ~70.2 tok/s | 1.3x |
| Qwen3.5-35B-A3B（MoE VLM） | 11.7 tok/s | 85 tok/s | **7.3x** |
| Qwen3VL-4B（VLM） | ~10 tok/s | ~55 tok/s | **5.5x** |

**结论：Qwen3.5 在 MLX Swift 上处于早期适配阶段，性能差距是系统性的。**

### 5.2 oMLX 的优化思路

[oMLX](https://github.com/jundot/omlx)（Apache 2.0，~42,900 行 Python）是目前对 Qwen3.5 在 MLX 上优化最积极的项目。其核心优化分为三个层次：

#### 层次一：推理引擎层优化

**① Gated DeltaNet 的 `cache.advance()` 修复**

mlx-lm 的 `GatedDeltaNet.__call__()` 缺少 `cache.advance(S)` 调用，导致 batch_size > 1 时 SSM mask 错误、数值发散。oMLX 通过 monkey-patch 在 forward 后注入修复。

**② VLMModelAdapter：将 VLM 伪装成 LLM 接口**

oMLX 不是用 VLM 管线跑所有请求，而是用 `VLMModelAdapter` 包装 VLM 的 `language_model` 部分，向生成引擎暴露标准 LLM 接口。三种前向路径：

- **纯文本请求**：仅调用 `language_model`，跳过视觉编码器
- **有图片请求**：先运行视觉编码器生成 `inputs_embeds`，再传给 `language_model`
- **批量 VLM**：左填充的 embeddings batch 与 token padding 对齐

**③ 混合缓存类型处理**

Qwen3.5 的 24 层 DeltaNet 用 ArraysCache（不可切片），8 层标准注意力用 KVCache（可切片）。oMLX 的 `BoundarySnapshotBatchGenerator` 在预填充每个块边界（256 token）对 ArraysCache 做快照保存到 SSD。

#### 层次二：KV 缓存层优化

**三级分页 SSD KV 缓存（oMLX 最大亮点）：**

```
GPU 块缓存 (活跃推理)
    ↕ LRU 驱逐 / 按需恢复
RAM 热缓存 (写回式)
    ↕ 异步写入 / LRU 驱逐
SSD 冷缓存 (safetensors 持久化，跨重启恢复)
```

关键设计：
- **链式哈希前缀匹配**：`block_hash = SHA-256(parent_hash + token_ids + model_name)`，类似区块链，实现精准的前缀复用
- **Copy-on-Write**：多请求共享相同前缀的块（引用计数），修改时才复制
- **异步写入**：推理线程提取原始字节 → 后台线程写磁盘（避免 Metal API 跨线程段错误）
- **跨重启恢复**：服务器启动时扫描 SSD 目录重建索引

**效果：已缓存的长上下文首 token 延迟从 30-90 秒降至 <5 秒。**

#### 层次三：系统级优化

- **全局单线程 Metal 执行器**：避免 command buffer 竞争
- **内联内存检查**：prefill 循环中每个 chunk 边界调用 `mx.get_active_memory()`（~20ns），超限立即中止
- **Metal kernel 保活**：空闲时定期运行轻量前向传递，防止 Metal pipeline 状态被驱逐
- **连续批处理**：Scheduler + BatchGenerator，8 并发下达 4.14x 加速

### 5.3 Klee 优化方案

#### 方案 D：依赖升级 + 性能诊断（P0，已完成）

**当前依赖状态（2026-03-18 确认）：**

Klee 的 mlx-swift-lm pin 在 **main 分支 commit `bc3c20e`**，已包含以下关键 PR：

| PR | 内容 | 状态 |
|----|------|------|
| **#120** | Qwen3.5 + Qwen3.5 MoE 模型支持 | **已包含** |
| **#129** | Gated DeltaNet Metal kernel 性能优化 | **已包含** |
| **#133** | Qwen3.5 tool calling 修复 | **已包含** |
| **#135** | `qwen3_5_text` 模型类型支持 | **已包含** |
| **#141** | topK, minP, penalty 参数 | **已包含**（最新 commit） |
| **#124 讨论** | evalLock 串行化瓶颈 | **待上游修复** |

**GatedDeltaNet `cache.advance()` 调查结论：**

oMLX 发现 Python 端 `GatedDeltaNet.__call__()` 缺少 `cache.advance(S)` 调用，导致 batch_size > 1 时 SSM mask 错误。Swift 端（`MambaCache` 继承 `ArraysCache`）也**没有 `advance()` 方法**。但 Klee 目前仅做 batch_size=1 的单用户推理，此问题暂不影响。若未来做连续批处理需注意。

**性能诊断已添加：** LLMService.chat() 现在记录并打印以下指标：
- TTFT (Time to First Token / prefill time) in ms
- Decode speed (tok/s, 不含 prefill)
- Total tokens / total time / overall tok/s

#### ~~方案 B：VLM Adapter 模式~~（分析完成，结论：Klee 层不需要）

> **霍去病分析结论（2026-03-18）：mlx-swift-lm 的 `Qwen35.prepare()` 已经在纯文本时跳过视觉编码器。**
> 详见 `mlx-swift-lm-fork-plan.md` 第 2-4 节。

分析发现：
1. `Qwen35.prepare()` 的 text-only 分支已跳过 `visionModel`，视觉编码器零开销
2. `callAsFunction()` decode 路径对所有 vision 参数传 nil
3. oMLX 的 `VLMModelAdapter` 是为服务端 `BatchGenerator` 桥接而设计，Klee 直接用 `ModelContainer` + `LanguageModel` 协议，无需额外适配

**唯一残留开销**：MLXVLM 的 `Qwen35Language.LanguageModel.callAsFunction()` 中 mRoPE 位置预计算（~10-20 个 MLXArray 操作/步），比 MLXLLM 的 `Qwen35TextModel` 多 3-8% 开销。此优化已纳入 fork 计划（方案 C-fork）。

**~~方案 A：双模型通道~~**（已废弃）

oMLX 证实维护 LLM/VLM 双通道加载没有必要。

#### 方案 C：SSD KV 缓存（P1，4-6 周，收益最大）

Klee 作为 Agent 平台，对话上下文中大量前缀是重复的（系统提示 + Skill 描述 + 工具定义）：

```
┌─────────────────────────────────────────────────┐
│  KV Cache 三级缓存 (Swift 实现)                    │
│                                                   │
│  L1: GPU Metal Buffer (活跃推理)                   │
│      - 当前请求的 KV cache blocks                   │
│      - Copy-on-Write 前缀共享                      │
│                                                   │
│  L2: RAM (热缓存)                                  │
│      - 最近使用的 blocks, LRU 驱逐到 L3            │
│                                                   │
│  L3: SSD (冷缓存, ~/Library/Caches/kv-cache/)      │
│      - safetensors 格式持久化                      │
│      - 链式哈希索引 SHA-256(parent + tokens + model)│
│      - 跨会话 / 跨重启恢复                         │
│      - 后台异步写入 (DispatchQueue)                 │
└─────────────────────────────────────────────────┘
```

**Klee Agent 场景的收益分析**：

| 场景 | 无 KV 缓存 | 有 SSD KV 缓存 | 加速比 |
|------|-----------|---------------|--------|
| 新对话（相同模块配置） | 全量 prefill ~1,300 tokens | 从 SSD 恢复前缀 | **~10x TTFT** |
| 同一对话续聊 | 每轮重新 prefill 全部历史 | 仅增量 prefill 新消息 | **~5-20x TTFT** |
| Agent 工具调用循环 | 每次工具返回后重新 prefill | 前缀命中，仅处理工具输出 | **~3-5x TTFT** |

**Qwen3.5 混合缓存注意事项**：Qwen3.5 的 24 层 DeltaNet 用 `MambaCache`（`ArraysCache`，不可切片），8 层标准注意力用 `KVCacheSimple`（可切片）。SSD 缓存实现需同时处理两种缓存类型。参考 oMLX 的 `BoundarySnapshotBatchGenerator` 在 prefill 块边界做 ArraysCache 快照。

#### 替代方案：oMLX 作为可选推理后端

如自行优化工作量过大，可让 Klee 通过 OpenAI 兼容 API 调用 oMLX 服务：

```
┌─────────────┐     HTTP API      ┌──────────────┐
│  Klee App   │ ──────────────▶   │  oMLX Server │
│  (SwiftUI)  │   localhost:8000  │  (Python/MLX) │
│             │ ◀──────────────   │  + SSD Cache  │
└─────────────┘    SSE Stream     └──────────────┘
```

**建议**：短期可作为高级用户的可选后端（Settings → Inference Backend），长期仍以内置推理为主。

### 5.4 优化方案优先级

| 方案 | 投入 | 收益 | 优先级 |
|------|------|------|--------|
| **D: 依赖升级 + 性能诊断** | 1-2 天 | 已确认 PR 全部包含 | **P0（已完成）** |
| **C-engine: Metal warmup + 参数调优** | 1-2 天 | Metal 预热 + 精确指标 | **P0（已完成）** |
| ~~**B: VLM Adapter**~~ | — | 分析证实不需要 | **已关闭** |
| **C-fork: mlx-swift-lm fork** | 2-3 周 | AsyncStream -20~30% + mRoPE -3~8% | **P0** |
| **SSD KV 缓存** | 4-6 周 | Agent 场景 TTFT 降低 5-20x | P1 |
| **oMLX 后端集成** | 3-5 天 | 高级用户立即可用 | P2 |

**核心原则：mlx-swift-lm fork 是下一步最重要的优化（AsyncStream + mRoPE），然后是 SSD KV 缓存。**

---

## 六、模块化 Agent 架构

> **这是第二优先级。** 性能可用后，用小红书模块验证整个模块化方案。

### 6.1 为什么 MCP 模式不适合规模化扩展

MCP 协议要求在对话开始前将所有工具的 JSON Schema 完整注入上下文：

| 指标 | MCP 模式 | CLI/原生模式 | 差距 |
|------|---------|------------|------|
| 26 个工具的 Schema 开销 | ~3,600 tokens | ~68 tokens | **53x** |
| 最简单任务总 Token 消耗 | 44,026 tokens | 1,365 tokens | **32x** |
| 5 个服务器 / 58 个工具 | ~55,000 tokens | ~0 | — |

> 数据来源：Scalekit 2026.03 基准测试、Anthropic 官方测试报告

**模拟场景：** Klee 接入 4 个功能模块（小红书、B站、微博、抖音），每模块约 15 个工具：

- MCP 方式：60 个工具 Schema ≈ **8,000-10,000 tokens**（32K 上下文占 25-30%）
- 原生 Skill 方式：4 个模块能力描述 ≈ **480 tokens**（32K 上下文占 <2%）

**工具选择准确率问题：** 工具数量超过 20 个时，模型工具选择准确率显著下降。以上数据基于 GPT-4 / Claude 等大参数模型，**对 9B 本地模型会进一步恶化**。

**Token 预算对比（32K 上下文）：**

```
MCP 方案（4个模块）:
├── 工具 Schema:     8,000 tokens  (24.4%)
├── 系统提示词:       500 tokens   (1.5%)
├── 对话历史:       16,000 tokens  (48.8%)  ← 约 10 轮对话
└── 模型生成空间:    8,268 tokens  (25.2%)

Swift 原生方案（4个模块）:
├── Skill 描述:       480 tokens   (1.5%)
├── 系统提示词:       500 tokens   (1.5%)
├── 对话历史:       22,500 tokens  (68.7%)  ← 约 15 轮对话
└── 模型生成空间:    9,288 tokens  (28.4%)
```

**原生方案多出约 40% 的可用上下文空间。**

### 6.2 Swift 原生 Service 架构

**所有模块能力均通过 Swift 原生 Service 实现，无外部进程依赖。**

LLM 识别意图后直接调用 Swift Service 方法：

```
┌──────────────────────────────────────────────────────────┐
│  Klee App — 纯 Swift，零外部进程                          │
│                                                          │
│  ┌─────────────┐   ┌───────────────┐   ┌──────────────┐ │
│  │ Module       │──▶│ Skill Layer   │──▶│ Local LLM    │ │
│  │ Manager      │   │ (Progressive  │   │ (MLX Swift)  │ │
│  │ (Enable/     │   │  Disclosure)  │   │              │ │
│  │  Disable)    │   └───────────────┘   └──────┬───────┘ │
│  └─────────────┘                               │         │
│                                          Intent Router    │
│                                          (意图识别)       │
│                                                │         │
│       ┌────────────┬────────────┬──────────────┤         │
│       ▼            ▼            ▼              ▼         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ XHS      │ │ Bili     │ │ Weibo    │ │  ......  │   │
│  │ Service  │ │ Service  │ │ Service  │ │          │   │
│  │ (Swift)  │ │ (Swift)  │ │ (Swift)  │ │          │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│       │            │            │              │         │
│       └────────────┴────────────┴──────────────┘         │
│                        URLSession                        │
│                     (统一 HTTP 层)                        │
└──────────────────────────────────────────────────────────┘
```

**LLM 与模块的交互方式：**

```
Swift 原生方案:
  LLM 识别意图: search(keyword: "美食")
  → Klee 直接调用 XHSService.search("美食")
  → 返回 [Note] Swift 数组
  → 格式化为文本回传 LLM
```

### 6.3 两层能力模型：内置能力 + 平台模块

#### 内置能力（默认开启，无需配置）

文件读写和网页获取是 Klee 的基础能力，**不作为模块呈现**，Skill 描述直接写死在系统提示词中：

```
你是 Klee，一个运行在 macOS 上的本地 AI 助手。
你可以读写本地文件（桌面、文档、下载等目录），也可以获取网页内容。
```

这些能力通过 Swift 原生 API 实现（FileManager、URLSession），无需用户操作，无需登录。

#### 平台模块（用户手动开启，需要登录）

小红书、抖音、B站等平台模块**需要用户主动启用**，原因：
- **登录前置**：未登录的模块注入 Skill 描述只会导致 LLM 识别意图后执行失败
- **意图精准**：用户只用 3 个平台就只注入 3 个 Skill（360 tokens），减少歧义
- **法律风险**：逆向 API 模块需用户主动选择启用
- **首次体验**：新用户先聊天，不需要看到一堆平台模块

```swift
struct KleeModule: Codable, Identifiable {
    let id: String              // "xiaohongshu"
    let name: String            // "小红书"
    let icon: String            // "note.text" (SF Symbol)
    let skillPrompt: String     // 自然语言能力描述 (~120 tokens)
    var isEnabled: Bool         // 用户手动开启
    var isAuthenticated: Bool   // 是否已完成登录
}
```

UI 呈现：**Settings → Modules**（替代原 Connectors 面板），更像 iPhone 设置里的账号管理——开启时触发登录流程。

#### 上下文成本分析

| 场景 | 注入内容 | Token 开销 | 占 32K 比例 |
|------|---------|-----------|-----------|
| 纯聊天（无模块） | 内置能力描述 | ~60 tokens | 0.2% |
| 开启 3 个平台模块 | 内置 + 3×Skill | ~420 tokens | 1.3% |
| 开启 10 个平台模块 | 内置 + 10×Skill | ~1,260 tokens | 3.8% |
| 开启 20 个平台模块 | 内置 + 20×Skill | ~2,460 tokens | 7.5% |

对比 MCP 的 4 个模块就占 25%，**Swift Skill 模式即使 20 个模块全开也不到 8%**。上下文不是限制因素，模块 toggle 的意义在于**管理登录状态和用户意图**。

### 6.4 Skill Layer（技能描述层）

每个平台模块对应一段精简的自然语言 Skill 描述，仅在模块**已启用且已登录**时注入系统提示词。

**示例（小红书模块 Skill Prompt，约 120 tokens）：**

```
你可以操作小红书：搜索笔记、阅读内容、查看/发表评论、
点赞收藏、发布图文/视频笔记、查看通知。
发布前请确认用户意图和内容完整性。
搜索时默认返回 10 条结果。
```

**渐进式加载策略：**

| 阶段 | 加载内容 | Token 开销 |
|------|---------|-----------|
| 未启用 | 不加载 | 0 |
| 已启用但未登录 | 不加载（避免执行失败） | 0 |
| 已启用且已登录 | Skill Prompt | ~120/模块 |
| 执行时 | 意图识别 + 方法调用 | 按需 |

### 6.5 小红书模块技术方案（试点）

#### 技术栈分析

经过对 [xiaohongshu-cli](https://github.com/jackwener/xiaohongshu-cli)（Apache 2.0）源码的完整审查：

**两套独立签名系统：**

**① 主 API 签名（edith.xiaohongshu.com）**

由 [xhshow](https://github.com/Cloxl/xhshow)（纯 Python，MIT 协议）实现，生成 `x-s` / `x-s-common` / `x-t` / `x-b3-traceid` / `x-xray-traceid` 五个 header。包含 session 模拟（GPU、屏幕分辨率等指纹一致性），无 JS 评估，无编译二进制。

**② Creator API 签名（creator.xiaohongshu.com）**

仅 ~50 行代码：`MD5 → 拼接 → Base64 → AES-128-CBC → Hex → Base64 → "XYW_" 前缀`。密钥/IV 均为硬编码常量。

#### Swift 改写难度评估

| 模块 | Python 实现 | Swift 方案 | 难度 | 代码量 |
|------|-----------|-----------|------|--------|
| **主 API 签名 (xhshow)** | 纯 Python 逆向算法 | CryptoKit + 自定义逻辑 | **中高** | ~500-800 行 |
| **Creator 签名** | MD5 + AES-128-CBC ~50 行 | CryptoKit (原生支持) | **低** | ~60 行 |
| **HTTP 客户端** | httpx | URLSession | **低** | ~200 行 |
| **重试 + 高斯抖动** | time.sleep + random.gauss | Task.sleep + 自定义分布 | **低** | ~50 行 |
| **Cookie 管理** | browser-cookie3 | macOS Security Framework / SQLite | **中** | ~150 行 |
| **API 端点封装** | 6 个 mixin 文件 | Swift Service methods | **低** | ~400 行 |
| **QR 登录** | camoufox 浏览器 | WKWebView / ASWebAuth | **中** | ~200 行 |

**预估总工作量：~1,500-2,000 行 Swift 代码**，主要工作量在 xhshow 签名算法移植。

#### 为什么 Swift 原生改写是最优解

| 维度 | 外部 CLI 方案 | Swift 原生改写 |
|------|-------------|--------------|
| **用户安装体验** | 需安装 Python + pip | **零配置，开箱即用** |
| **包体增加** | +30-50MB (嵌入 Python) | **~0** (编译进 Klee) |
| **运行时开销** | 启动 Python 进程 (~50-100ms) | **原生调用 (~0ms)** |
| **类型安全** | 解析 JSON 字符串输出 | **Swift struct 直接返回** |
| **UI 集成深度** | 需要中间解析层 | **直接绑定 SwiftUI** |
| **LLM 集成** | LLM → 生成命令 → 执行 → 解析 | **LLM → 意图识别 → 直接调用方法** |

#### 签名维护风险缓解

| 策略 | 说明 |
|------|------|
| **签名模块独立封装** | 将签名逻辑封装为独立 Swift Package，可单独更新 |
| **交叉验证测试** | 编写测试用例，用相同输入分别调用 Python 和 Swift 实现，验证输出一致 |
| **降级方案** | 如签名短期无法跟进，可临时回退到"内嵌 xhshow Python 包"方式 |
| **社区同步** | 关注 xhshow 仓库的 commit，设置 GitHub Watch |

---

## 七、为什么移除 MCP + Node.js

Klee v1.x 曾实现了完整的 MCP Agent 层（Swift MCP Client + 内嵌 Node.js LTS + Connector UI）。经过实际使用和架构评估，决定**完全移除**：

| 问题 | 说明 |
|------|------|
| **体积代价** | Node.js 运行时占 App 58%（104MB / 180MB），移除后 App 仅 ~75MB |
| **上下文浪费** | MCP 工具 Schema 注入消耗 3,600+ tokens，Swift Skill 描述仅需 ~120 tokens |
| **签名复杂** | Node.js 需要 `allow-jit` 等高危 entitlement，阻止 App Store 分发 |
| **进程管理** | 子进程生命周期、Pipe Heartbeat、孤儿进程 — 增加 ~650 行代码和运维复杂度 |
| **架构方向** | 模块化路线确定为 Swift 原生 Service，MCP 成为冗余中间层 |
| **实际使用** | 仅 2 个内置 Connector（Filesystem / Playwright），均可 Swift 原生替代 |

**替代方案**：
- Filesystem → `FileManager` 原生实现（~200 行 Swift）
- Web 内容获取 → `URLSession` + HTML 解析（无需 Playwright 控制浏览器）
- 所有模块能力 → Swift 原生 Service（编译进 App，零进程开销）

**代码清理范围**（待执行）：

| 操作 | 文件/目录 | 说明 |
|------|----------|------|
| **删除** | `Service/MCPClientManager.swift` | MCP 客户端 |
| **删除** | `Service/MCPServerManager.swift` | MCP 子进程管理 |
| **删除** | `Service/MCPServerStore.swift` | MCP 配置持久化 |
| **删除** | `Model/MCPServerConfig.swift` | MCP 配置模型（含 BuiltInConnector） |
| **删除** | `View/MCPServerListView.swift` | Connectors 列表 UI |
| **删除** | `View/MCPServerEditView.swift` | Connector 编辑表单 |
| **删除** | `View/InspectorView.swift` | 右侧 Inspector 面板（思考/工具调用） |
| **删除** | `Resources/node/` | Node.js 运行时（释放 104MB） |
| **移除** | SPM 依赖 `modelcontextprotocol/swift-sdk` | MCP Swift SDK |
| 简化 | `KleeApp.swift` | 移除 MCP 相关 Environment 注入和 autoConnect |
| 简化 | `ChatViewModel.swift` | 移除 tool calling 循环 |
| **改造** | `ChatView.swift` | 思考内容（`<think>`）改为内联渲染（正式回复前显示，回复后折叠） |
| **改造** | `SettingsView.swift` | 移除 Connectors 面板，Settings 仅保留 Models + About |
| **新建** | `View/ChatConfigView.swift` | 右侧配置面板（模型选择 + 模块 toggle），替代 InspectorView |
| **新建** | `View/ThinkingBlockView.swift` | 内联可折叠思考块（中间聊天栏内） |
| **新建** | `View/ModuleListView.swift` | 模块列表 + toggle（嵌入 ChatConfigView） |
| **新建** | `Service/ModuleManager.swift` | 模块注册、启用/禁用、登录状态管理 |
| **新建** | `Model/KleeModule.swift` | 模块数据模型（替代 MCPServerConfig） |

---

## 八、竞品分析

### 全球本地推理桌面客户端格局（2026 Q1）

| 产品 | 框架 | 推理引擎 | 模块化 | App 体积 | 开源 |
|------|------|---------|--------|---------|------|
| **Klee** | **SwiftUI 原生** | **MLX Swift** | **Swift 原生 Service** | **~75 MB** | 是 |
| LM Studio | Electron | llama.cpp + MLX | ❌ | ~300 MB | 部分 |
| Jan.ai | Electron | Cortex.cpp | ❌ | ~250 MB | AGPLv3 |
| Swama | SwiftUI 菜单栏 | **MLX Swift** | ❌ | ~30 MB (仅 CLI) | MIT |
| oMLX | Python CLI | **MLX** (优化版) | ❌ | — | Apache 2.0 |
| GPT4All | Qt/QML | llama.cpp | ❌ | ~200 MB | MIT |
| Cherry Studio | Electron | 桥接 Ollama | ❌ | ~300 MB | 是 |

**Klee 的独特定位：全球唯一同时具备 MLX Swift 原生推理 + SwiftUI 原生 UI + Swift 原生模块化平台的本地 AI 客户端。纯 Swift 零外部依赖，~75MB 体积。**

### 关键竞品详解

**LM Studio（最强竞品）**
- 内嵌 mlx-engine + MCP Host，功能最全面
- 致命弱点：Electron，macOS 原生体验差，内存 ~300MB+
- 融资 $19.3M，有能力推出原生版——**Klee 最大威胁**

**Swama（技术路线最接近）**
- 纯 Swift + MLX Swift，但仅是 API 服务端（无 Chat UI、无 MCP）

**oMLX（推理优化参考）**
- 对 Qwen3.5 优化最积极，SSD KV 缓存是亮点
- 仅 Python CLI 服务端，无 GUI

### 时间窗口

MLX + 模块化的纯原生 SwiftUI 组合，市场空白期约 **6-12 个月**。

---

## 九、战略优势：借助开源生态成长

**做交付层，不做基础层。**

| 上游项目 | Klee 受益 |
|---|---|
| MLX Swift 更新 | 推理性能持续提升，新模型架构自动支持 |
| mlx-community 模型转换 | 用户可选模型越来越多 |
| Apple Silicon 硬件迭代 | M5 Neural Accelerators 额外加速 19-27% |
| oMLX 优化方案 | 可移植的推理优化思路（SSD KV 缓存、VLM Adapter） |
| 开源模型进步 | 相同硬件效果越来越好 |
| Apple Foundation Models（macOS 26+） | 可作为轻量任务的补充引擎 |

---

## 十、分发与自动更新

> **这是第三优先级。** 功能开发完成后再执行。

### 分发方式选择

移除 Node.js 后，Klee 成为纯 Swift 应用，**App Store 分发重新成为可能**：

| 方式 | 优点 | 缺点 | 适用阶段 |
|------|------|------|---------|
| **App Store** | 自动更新、信任度高、触达广 | 审核周期、30% 分成（如有 IAP） | 长期目标 |
| **Developer ID** | 快速迭代、无审核 | 需自建更新机制 | 早期阶段 |

**建议**：早期用 Developer ID 快速迭代，稳定后上 App Store。

### Xcode 配置

- Certificate：`Developer ID Application`（早期）/ App Store（后期）
- App Sandbox：**可开启**（移除 Node.js 后无子进程限制，仅需文件读写权限）
- Hardened Runtime：**开启**

### 签名流程

移除 Node.js 后签名极其简单（无需 JIT entitlement）：

```bash
IDENTITY="Developer ID Application: 你的名字 (TEAMID)"
codesign --force --sign "$IDENTITY" --options runtime --timestamp Klee.app
```

### 公证与 DMG 打包

```bash
# 打包 DMG
create-dmg --volname "Klee" --window-size 600 400 \
  --icon "Klee.app" 175 190 --app-drop-link 425 190 \
  "Klee.dmg" "Klee.app"

# 公证
xcrun notarytool submit Klee.dmg --apple-id "you@email.com" \
  --team-id "TEAMID" --password "@keychain:AC_PASSWORD" --wait

# Staple
xcrun stapler staple Klee.dmg
```

### Sparkle 2.x 自动更新

```swift
import Sparkle

@main
struct KleeApp: App {
    private let updaterController: SPUStandardUpdaterController
    init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil
        )
    }
    var body: some Scene {
        WindowGroup { HomeView() }
        .commands {
            CommandGroup(after: .appInfo) {
                CheckForUpdatesView(updater: updaterController.updater)
            }
        }
    }
}
```

Info.plist：`SUFeedURL` → `https://klee.app/appcast.xml`，`SUScheduledCheckInterval` → 86400。

---

## 十一、风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| Qwen3.5 MLX Swift 性能差距 | 推理不可用 | VLM Adapter + SSD KV 缓存 + 紧跟上游 PR |
| 签名算法变更 | 小红书模块失效 | 独立封装 + 交叉验证 + 降级方案 |
| 逆向 API 风控风险 | 账号封禁 | 模块声明风险等级，高风险操作用户确认 |
| 本地模型生成错误意图 | 执行失败/意外操作 | 意图白名单 + 危险操作确认 + 参数校验 |
| LM Studio 推出原生 macOS 版 | 竞争加剧 | 加速模块化差异点，抢占垂直场景 |
| evalLock 瓶颈待上游修复 | VLM/MoE 性能受限 | 提交 PR / fork 临时修复 |

---

## 十二、下一步行动

### 已完成

- [x] **Phase 1**：本地聊天（MLX 推理、模型管理、对话历史、Settings）
- [x] **Phase 3**：多模态 VLM（Qwen 3.5 图像输入）
- [x] **架构重构**：DownloadManager 拆分、依赖注入改造、View 拆分、错误类型统一
- [x] **Phase A**：MCP/Node.js 移除 + UI 重构 → App 从 ~180MB 降至 ~75MB
  - MCP 代码全部清除，Node.js 运行时删除
  - 右侧边栏：Inspector → ChatConfigView（模型选择 + 模块 toggle）
  - 思考过程（`<think>`）：改为聊天区内联 card（max height 200，可滚动）
  - Settings：移除 Connectors，仅保留 Models + About
  - 新增 ModuleManager + KleeModule（平台模块基础设施）
  - 对话标题：直接截取用户首条消息（不再调 LLM）

### 当前路线图（按优先级排序）

```
═══════════════════════════════════════════════════════════
 P0  性能优化 — 让推理速度回到可用状态
═══════════════════════════════════════════════════════════

Phase B: 依赖升级 + 诊断（1-2 天）[已完成 2026-03-18]
├── [x] 确认 mlx-swift-lm 已包含 PR #120/#129/#133/#135/#141
├── [x] 添加 TTFT / decode speed / total 诊断日志
├── [x] 确认 Gated DeltaNet Metal kernel 已包含
├── [x] 调查 cache.advance() 问题（batch=1 暂不影响）
└── [ ] 主公在真机上跑 Qwen3.5 对比诊断数据

Phase C: MLX 推理优化 [已完成 2026-03-18]
├── [x] Engine layer: Metal warmup, GenerateParameters tuning, Memory.cacheLimit
├── [x] Accurate metrics: GenerateCompletionInfo 替代手动 Date() 计时
├── [x] VLM Adapter 分析: 结论 — Klee 层不需要（mlx-swift-lm 已跳过视觉编码器）
├── [x] mRoPE 开销量化: MLXVLM 文本路径比 MLXLLM 多 3-8% 位置计算开销
└── [ ] 主公在真机上跑 Qwen3.5 对比 Phase B/C 前后诊断数据

═══════════════════════════════════════════════════════════
 P1  模块化开发 — 小红书模块验证方案（当前重点）
═══════════════════════════════════════════════════════════

Phase D: 模块基础设施（1-2 周）
├── Skill Layer 注入机制（渐进式上下文）
├── Intent Router（LLM 意图 → Service 方法映射）
└── 完善 Module 管理 UI

Phase E: 小红书 Swift Service（2-3 周）
├── 移植 xhshow 签名算法到 Swift（核心工作量）
├── 移植 Creator 签名 (MD5 + AES-128-CBC)
├── 实现 XHSService (URLSession + API 封装)
├── 实现 Cookie 管理 + QR 登录 (WKWebView)
├── 签名交叉验证测试
└── UI 集成（搜索结果、笔记详情、发布流程）

═══════════════════════════════════════════════════════════
 P2  分发
═══════════════════════════════════════════════════════════

Phase F: 分发准备（1-2 周）
├── Developer ID 签名 + Notarization（签名极简，一行命令）
├── DMG 打包脚本
├── 集成 Sparkle 2.x 自动更新
├── GitHub Actions CI/CD（tag → build → sign → upload）
└── 评估 App Store 分发可行性（App Sandbox 兼容性测试）

═══════════════════════════════════════════════════════════
 P3  生态扩展 + 深度整合
═══════════════════════════════════════════════════════════

Phase G: 模块生态扩展（持续）
├── 总结 Swift Service 开发模式
├── 发布模块开发 SDK / 模板
├── 接入更多平台模块（B站、微博、抖音等）
└── 模块市场 / 注册表（远期）

Phase H: macOS 深度整合
├── Spotlight 集成（对话标题可搜索）
├── Share Extension（接收文本/图片直接进入对话）
├── 全局快捷键唤起（类 Raycast）
├── 菜单栏模式（setActivationPolicy(.accessory)）
├── Apple Foundation Models 集成（macOS 26+）
└── SwiftData 迁移 + 跨设备同步

═══════════════════════════════════════════════════════════
 长期观察  mlx-swift-lm 性能跟踪
═══════════════════════════════════════════════════════════

mlx-swift-lm fork 暂不执行。社区调研结论（2026-03-19）：
├── AsyncStream/AsyncMutex 架构是上游刻意设计，不被视为 bug
├── Apple 官方无性能优化路线图
├── PR#147（+35%）已提交未审查，合并时间不确定
├── 当前 19.9 tok/s 可用，差距来自 Swift 异步调度开销
├── 策略：跟踪上游更新，有实质性改善时升级依赖即可
└── 详见 mlx-swift-performance-research.md
```

---

## 附录 A：MLX 模型格式与转换

```bash
pip install mlx-lm
mlx_lm.convert --hf-path Qwen/Qwen3-8B --mlx-path ./Qwen3-8B-4bit --quantize --q-bits 4
```

## 附录 B：参考项目

**本地源码**（已 clone 到 `../6-1-Klee Reference/`，可直接阅读）：

| 本地路径 | 项目 | 说明 |
|---------|------|------|
| `../6-1-Klee Reference/omlx/` | [jundot/omlx](https://github.com/jundot/omlx) | MLX 推理优化：SSD KV 缓存、Qwen3.5 GatedDeltaNet 修复、VLMModelAdapter |
| `../6-1-Klee Reference/xhs-cli/` | [jackwener/xiaohongshu-cli](https://github.com/jackwener/xiaohongshu-cli) | 小红书 API 逆向：签名算法（xhshow）、HTTP 客户端、Cookie 管理、QR 登录 |

**在线参考**：

| 项目 | 说明 |
|------|------|
| [ml-explore/mlx-swift-examples](https://github.com/ml-explore/mlx-swift-examples) | Apple 官方示例 |
| [ml-explore/mlx-swift-lm](https://github.com/ml-explore/mlx-swift-lm) | MLX Swift 推理库 |
| [Trans-N-ai/swama](https://github.com/Trans-N-ai/swama) | 纯 Swift MLX 推理引擎 |
| [Cloxl/xhshow](https://github.com/Cloxl/xhshow) | 小红书签名核心库（MIT） |

## 附录 C：调研来源

- [MLX Swift GitHub](https://github.com/ml-explore/mlx-swift) / [MLX Swift LM](https://github.com/ml-explore/mlx-swift-lm)
- [WWDC 2025 Session 298 - Explore LLM on Apple Silicon with MLX](https://developer.apple.com/videos/play/wwdc2025/298/)
- [WWDC 2025 Session 315 - Get started with MLX](https://developer.apple.com/videos/play/wwdc2025/315/)
- [MLX vs llama.cpp Benchmark Paper (arXiv:2511.05502)](https://arxiv.org/abs/2511.05502)
- [Apple Foundation Models Framework](https://developer.apple.com/documentation/FoundationModels)
- [Scalekit MCP Benchmark 2026.03](https://scalekit.com/blog/mcp-benchmark)
- [oMLX Architecture Documentation](https://github.com/jundot/omlx/tree/main/docs)

## 附录 D：开放讨论点

1. **签名算法维护机制**：如何建立 xhshow 上游变更的快速同步流程？
2. **逆向 API 的法律合规性**：需法务评估小红书 ToS 对自动化访问的限制
3. **App Store 分发可行性**：移除 Node.js 后 Sandbox 兼容性需实测验证
4. **是否需要模块签名/审核机制**防止恶意第三方模块？（远期）
5. ~~**MCP 和原生 Service 的边界**~~：已决定全部使用 Swift 原生 Service，移除 MCP
