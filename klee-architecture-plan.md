# Klee 架构方案：SwiftUI + MLX Swift + OpenClaw

> 目标：打造一个类 Claude Desktop 体验的本地 AI 桌面应用，完全本地运行，零 API 费用，数据不出本机。

---

## 一、产品定位

一个 Mac 原生的本地 AI 聊天应用，让普通用户无需终端操作就能使用开源大模型。

**核心价值主张：**
- 下载即用，零配置，无需安装 Ollama / Python / 任何外部依赖
- 完全本地推理，数据私密
- Apple Silicon 原生优化，性能最优（MLX 引擎比 llama.cpp 快 21%-87%）
- 原生 SwiftUI，体积小、内存低、Mac 系统深度整合
- 后续通过 OpenClaw Gateway 获得 AI Agent 能力

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
Klee.app (SwiftUI macOS)
├── UI 层：SwiftUI 原生界面（对话、模型管理、设置、onboarding）
├── LLM 推理层：mlx-swift-lm（SPM 依赖，进程内推理）
│   ├── 模型加载（从 HuggingFace 下载，本地缓存）
│   ├── 流式推理（Metal GPU 加速）
│   └── 量化支持（3/4/5/6/8-bit）
└── Agent 层（Phase 2）：OpenClaw Gateway
    ├── Node.js 子进程管理
    └── WebSocket 通信
```

### App Bundle 结构

```
Klee.app/
└── Contents/
    ├── MacOS/
    │   └── Klee              # SwiftUI 主程序（含 MLX 引擎，静态链接）
    ├── Resources/
    │   └── (app resources)
    └── Frameworks/
        └── (MLX Metal shaders 等)
```

Phase 2 增加 OpenClaw 后：
```
Klee.app/
└── Contents/
    ├── MacOS/
    │   └── Klee
    ├── Resources/
    │   ├── node              # Node.js 22 binary，~80MB
    │   └── openclaw/         # 预装 npm 目录
    │       ├── node_modules/
    │       └── package.json
    └── Frameworks/
```

### App Bundle 体积预估

**Phase 1（纯聊天）：**

| 组件 | 体积 |
|------|------|
| Klee SwiftUI 本体 + MLX 引擎 | ~60 MB |
| Metal shaders (mlx.metallib) | ~10 MB |
| **总计** | **~70 MB** |
| DMG 压缩后 | **~40 MB** |

注意：模型文件不打包进 app，首次使用时按需下载到 `~/Library/Caches/huggingface/`。

**Phase 2（+OpenClaw Agent）：**

| 组件 | 体积 |
|------|------|
| Phase 1 全部 | ~70 MB |
| Node.js 22 binary (arm64) | ~80 MB |
| OpenClaw node_modules（优化后） | ~200 MB |
| **总计** | **~350 MB** |
| DMG 压缩后 | **~220 MB** |

竞品参考：Claude Desktop ~400MB，Cursor ~500MB，LM Studio ~300MB（Electron）。

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

class LLMService: ObservableObject {
    @Published var isLoading = false
    @Published var currentModel: String?

    private var model: ModelContainer?
    private var session: ChatSession?

    /// 加载模型（从 HuggingFace 下载或读取缓存）
    func loadModel(id: String) async throws {
        isLoading = true
        defer { isLoading = false }

        model = try await loadModel(id: id)  // e.g. "mlx-community/Qwen3-4B-4bit"
        session = ChatSession(model!)
        currentModel = id
    }

    /// 流式聊天
    func chat(prompt: String) -> AsyncStream<String> {
        AsyncStream { continuation in
            Task {
                guard let session else { return }
                for try await token in session.streamResponse(to: prompt) {
                    continuation.yield(token)
                }
                continuation.finish()
            }
        }
    }
}
```

### 模型管理

模型文件存储在 HuggingFace Hub 的标准缓存目录：`~/Library/Caches/huggingface/hub/`

```swift
class ModelManager: ObservableObject {
    @Published var availableModels: [ModelInfo] = []
    @Published var downloadProgress: [String: Double] = [:]

    /// 预定义的推荐模型列表
    static let recommendedModels: [ModelInfo] = [
        ModelInfo(id: "mlx-community/Qwen3-4B-4bit", name: "Qwen3 4B", size: "~2.5 GB", minRAM: 8),
        ModelInfo(id: "mlx-community/Llama-3.3-8B-Instruct-4bit", name: "Llama 3.3 8B", size: "~5 GB", minRAM: 16),
        ModelInfo(id: "mlx-community/Mistral-Small-24B-Instruct-2501-4bit", name: "Mistral Small 24B", size: "~12 GB", minRAM: 32),
        ModelInfo(id: "mlx-community/Qwen3-32B-4bit", name: "Qwen3 32B", size: "~18 GB", minRAM: 32),
    ]

    /// 检测系统内存，过滤可运行的模型
    func filterBySystemRAM() {
        let totalRAM = ProcessInfo.processInfo.physicalMemory / (1024 * 1024 * 1024)  // GB
        availableModels = Self.recommendedModels.filter { $0.minRAM <= totalRAM }
    }

    /// 下载模型（支持进度回调）
    func downloadModel(id: String) async throws {
        // mlx-swift-lm 的 loadModel 自带下载功能
        // 通过 HuggingFace Hub 下载，支持断点续传
    }

    /// 删除已缓存的模型
    func deleteModel(id: String) throws {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let modelDir = cacheDir.appendingPathComponent("huggingface/hub/models--\(id.replacingOccurrences(of: "/", with: "--"))")
        try FileManager.default.removeItem(at: modelDir)
    }
}
```

### 模型推荐策略（按内存）

| 系统内存 | 推荐模型 | 模型大小 | 预期速度 |
|---------|---------|---------|---------|
| 8GB | Qwen3-4B-4bit | ~2.5 GB | ~80 tok/s |
| 16GB | Llama-3.3-8B-4bit 或 Qwen3-8B-4bit | ~5 GB | ~60 tok/s |
| 32GB | Mistral-Small-24B-4bit 或 Qwen3-14B-4bit | ~12 GB | ~40 tok/s |
| 64GB+ | Qwen3-32B-4bit | ~18 GB | ~25 tok/s |

注意：MLX 利用统一内存，8GB Mac 也能跑 4B 模型，这是相比 Ollama 方案的重大改进（之前 8GB 被标为"不建议"）。

---

## 五、MCP Agent 层（Phase 2）

Phase 1 只做纯聊天，Phase 2 通过 MCP 协议获得 AI Agent 能力（Tool Calling、文件操作、Shell 执行、连接第三方服务等）。

### 架构决策：放弃 OpenClaw，改用 Swift MCP SDK + 内嵌 Node.js

**调研结论（2026-03）：**

| 方案 | 评估结果 |
|---|---|
| OpenClaw | ❌ 1.4GB node_modules，无法直接对接 MLX Swift（需 OpenAI 兼容 HTTP 桥接），过度工程化 |
| Bun 替代 Node.js | ❌ Playwright MCP 已确认无响应（Issue #25861），native addon 兼容率仅 34% |
| Swift MCP SDK + 内嵌 Node.js LTS | ✅ 100% npm 生态兼容，Swift 原生协议层，参考 Claude Desktop 架构 |

**Claude Desktop 参考：** Anthropic 采用内置 Node.js 的 `.mcpb` Desktop Extensions 格式实现零配置体验，Klee 沿用同样思路。

### 整体架构

```
Klee (SwiftUI)
  ├── modelcontextprotocol/swift-sdk (SPM)   ← MCP Client，纯 Swift，协议通信层
  ├── 内嵌 Node.js LTS binary (~80-100MB)    ← 运行社区 npm MCP Server
  └── MCP Server 管理 UI                     ← 用户配置 Server + 密钥，Klee 自动启动进程

Agent 调用链路：
  MLX 推理 → 检测 tool_call → Swift MCP Client → (stdio/HTTP) → MCP Server → 返回结果
                                                                               ↓
                                                                       追加到对话历史
                                                                               ↓
                                                                       MLX 再次推理
```

### Swift MCP Client SDK

- **仓库**：`modelcontextprotocol/swift-sdk` v0.11.0，官方维护，Apache 2.0
- **SPM 引入**：`.package(url: "https://github.com/modelcontextprotocol/swift-sdk.git", from: "0.11.0")`
- **要求**：Swift 6.0+，macOS 13+
- 同时支持 Client 和 Server，6 种传输层（stdio、HTTP SSE、InMemory 等）

核心 API：

```swift
import MCP

let client = Client(name: "Klee", version: "1.0")
let transport = StdioTransport()
try await client.connect(transport: transport)

// 获取可用工具列表
let (tools, _) = try await client.listTools()

// 调用工具
let (content, isError) = try await client.callTool(
    name: "stripe_list_payments",
    arguments: ["limit": 10]
)
```

### 内嵌 Node.js 运行时

- **版本**：Node.js LTS（当前 v22.x），仅 darwin-arm64
- **位置**：`Klee.app/Contents/Resources/node/bin/node`（~80-100MB）
- **用途**：运行通过 `npx` 分发的社区 MCP Server
- **不选 Bun 的原因**：Playwright MCP 等重 native addon 的 Server 在 Bun 下已确认失败

可接入的社区 MCP Server 示例：

| Server | 用途 | 启动命令 |
|---|---|---|
| `@playwright/mcp` | 浏览器自动化（控制浏览器、采集内容） | `npx @playwright/mcp` |
| `@notionhq/notion-mcp-server` | Notion 读写 | `npx @notionhq/notion-mcp-server` |
| `@stripe/agent-toolkit` | Stripe 收款查询 | `npx @stripe/agent-toolkit` |
| `@modelcontextprotocol/server-filesystem` | 本地文件操作 | `npx @modelcontextprotocol/server-filesystem` |
| AWS MCP Server | AWS 资源查询（Cognito、S3 等） | `npx @aws/aws-mcp-servers` |

### MCP Server 子进程管理

```swift
// 启动 MCP Server 子进程（以 Stripe 为例）
let process = Process()
process.executableURL = URL(fileURLWithPath: nodePath)  // 内嵌 Node.js
process.arguments = [npxPath, "-y", "@stripe/agent-toolkit"]

// Pipe heartbeat：父进程退出时子进程自动感知并退出
let (readPipe, writePipe) = Pipe.makePair()
process.standardOutput = /* MCP stdio transport */
// 子进程监控 readPipe 关闭事件，父进程持有 writePipe

try process.run()
```

### 防孤儿进程（Pipe Heartbeat 方案）

macOS 无 `prctl(PR_SET_PDEATHSIG)`，使用 pipe 监控替代：

```swift
// 父进程（Klee）持有 writePipe
// 子进程（MCP Server wrapper）定期检查 readPipe 是否关闭
// 无论 Klee 以何种方式退出（包括 SIGKILL），pipe 写端自动关闭
// 子进程检测到后自行退出——这是 VS Code / Claude Desktop 的同款方案
```

启动时清理残余：Klee 启动时扫描并终止上次遗留的孤儿进程（通过 PID 文件）。

### 签名要求

内嵌 Node.js 需要额外 entitlements：

```xml
<!-- node.entitlements -->
<key>com.apple.security.cs.allow-jit</key>
<true/>
```

所有内嵌二进制（node binary + MCP Server 的 .node native addon）必须用 Developer ID 统一签名后才能通过 notarization。

### App Bundle 体积估算

| 组件 | 体积 |
|---|---|
| Phase 1（SwiftUI + MLX） | ~70 MB |
| Node.js LTS darwin-arm64 binary | ~80-100 MB |
| **Phase 2 总计** | **~150-170 MB** |
| DMG 压缩后 | **~100-110 MB** |

对比 Claude Desktop ~400MB、LM Studio ~300MB，Klee 仍有明显体积优势。

---

## 六、分发方式：Developer ID 直接分发

### 为什么不走 App Store

Phase 2 的 OpenClaw 集成与 App Store 沙盒不兼容：
1. Sandbox 禁止 spawn 子进程执行任意代码（Node.js 进程）
2. OpenClaw 的核心能力（shell 执行、文件读写）全部被沙盒封死
3. Node.js runtime 会被 Apple 以 "deprecated technology" 拒绝

Phase 1 理论上可以走 App Store（无子进程），但为了 Phase 2 的一致性，从一开始就用 Developer ID 分发。

### Xcode 配置

- Certificate：`Developer ID Application`
- App Sandbox：**关闭**
- Hardened Runtime：**开启**（公证硬性要求）

### 签名流程

Phase 1 签名非常简单（没有外部二进制）：

```bash
IDENTITY="Developer ID Application: 你的名字 (TEAMID)"

# MLX 编译进 app，只需签名 app bundle 本身
codesign --force --sign "$IDENTITY" --options runtime --timestamp Klee.app
```

Phase 2 增加 Node.js + OpenClaw 后需逐个签名：

```bash
# 1. Sign native modules (.node files)
find Klee.app/Contents/Resources/openclaw/node_modules -name "*.node" \
  -exec codesign --force --sign "$IDENTITY" --options runtime --timestamp {} \;

# 2. Sign dynamic libraries
find Klee.app/Contents/Resources/openclaw/node_modules -name "*.dylib" \
  -exec codesign --force --sign "$IDENTITY" --options runtime --timestamp {} \;

# 3. Sign Node.js binary (needs JIT entitlements)
codesign --force --sign "$IDENTITY" --options runtime --timestamp \
  --entitlements node.entitlements \
  Klee.app/Contents/Resources/node

# 4. Sign app bundle (last)
codesign --force --sign "$IDENTITY" --options runtime --timestamp Klee.app
```

**Node.js entitlements (node.entitlements):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
```

### 公证与 DMG 打包

```bash
# Archive & Notarize
# Product -> Archive -> Distribute App -> Direct Distribution -> Upload

# 打包 DMG
brew install create-dmg
create-dmg \
  --volname "Klee" \
  --window-size 600 400 \
  --icon "Klee.app" 175 190 \
  --app-drop-link 425 190 \
  "Klee.dmg" \
  "Klee.app"

# 公证 DMG
xcrun notarytool submit Klee.dmg --apple-id "you@email.com" \
  --team-id "TEAMID" --password "@keychain:AC_PASSWORD" --wait

# Staple
xcrun stapler staple Klee.dmg
```

---

## 七、自动更新（Sparkle 2.x）

非 App Store 分发的 macOS app 没有系统级自动更新。Sparkle 是事实标准（Firefox、VLC、iTerm2、Figma 都用）。

### 集成方式

```swift
// Xcode: File > Add Package Dependencies
// https://github.com/sparkle-project/Sparkle (2.x)

import Sparkle

@main
struct KleeApp: App {
    private let updaterController: SPUStandardUpdaterController

    init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .commands {
            CommandGroup(after: .appInfo) {
                CheckForUpdatesView(updater: updaterController.updater)
            }
        }
    }
}
```

### Info.plist 配置

```xml
<key>SUFeedURL</key>
<string>https://klee.app/appcast.xml</string>

<key>SUPublicEDKey</key>
<string>YOUR_ED25519_PUBLIC_KEY</string>

<key>SUEnableAutomaticChecks</key>
<true/>

<key>SUScheduledCheckInterval</key>
<integer>86400</integer>
```

### Delta 更新

Phase 1 体积小（~70MB），全量更新也可接受。Phase 2 体积增大后 delta 更新价值凸显：

| 更新内容 | 全量下载 | Delta 下载 |
|---------|---------|-----------|
| 只改了 SwiftUI 代码 | ~350MB | **~5-10MB** |
| 更新了 OpenClaw 版本 | ~350MB | **~50-100MB** |
| MLX 引擎更新 | ~350MB | **~30MB** |

```bash
# 生成 delta 更新包
./Sparkle/bin/generate_appcast releases/
```

### 发布服务器

- **GitHub Releases**：免费，适合早期阶段
- **CDN（CloudFlare R2 / S3）**：适合用户量大时

---

## 八、竞品分析

| 产品 | 框架 | 推理引擎 | 嵌入方式 | 零配置 | 开源 |
|------|------|---------|---------|--------|------|
| **Klee** | **SwiftUI 原生** | **MLX** | **SPM 编译链接** | **是** | 是 |
| LM Studio | Electron | llama.cpp + MLX | 内嵌 | 是 | 否 |
| Jan.ai | Electron | Cortex.cpp (llama.cpp) | 内嵌子进程 | 是 | 是 |
| GPT4All | Qt/QML | llama.cpp | 编译链接 | 是 | 是 |
| Enchanted | SwiftUI | 无（Ollama 客户端） | 不嵌入 | **否** | 是 |
| Ollama App | Go + Web | 自研引擎 | 独立应用 | 是 | 是 |

**Klee 的独特定位：唯一使用 MLX + SwiftUI 原生的零配置本地 LLM 应用。**

### 差异化优势

1. **性能**：MLX 在 Apple Silicon 上比所有竞品的 llama.cpp 快 21%-87%
2. **体积**：Phase 1 仅 ~70MB，竞品普遍 300MB+
3. **内存**：无 Electron/Qt 运行时开销，更多内存留给模型
4. **原生体验**：SwiftUI 深度整合 macOS（通知、Spotlight、Share Extension）
5. **中文优化**：界面、onboarding、模型推荐全中文

---

## 九、战略优势：借助开源生态成长

**做交付层，不做基础层。**

| 上游项目 | Klee 受益 |
|---|---|
| MLX Swift 更新 | 推理性能持续提升，新模型架构自动支持 |
| mlx-community 模型转换 | 用户可选模型越来越多 |
| Apple Silicon 硬件迭代 | M5 Neural Accelerators 额外加速 19-27% |
| OpenClaw 新 Skill（Phase 2） | Agent 能力不断扩展 |
| 开源模型进步 | 相同硬件效果越来越好 |
| Apple Foundation Models（macOS 26+） | 可作为轻量任务的补充引擎 |

---

## 十、下一步行动

### Phase 1：本地聊天 ✅ 已完成

**目标**：用户下载 Klee → 选模型 → 自动下载 → 开始聊天

- [x] 重构现有代码：移除 Ollama ProcessManager，引入 mlx-swift-lm SPM 依赖
- [x] 实现 LLMService：模型加载、流式推理、模型切换
- [x] 实现 ModelManager：推荐模型列表、下载进度、缓存管理、RAM 兼容性提示
- [x] 重构 ChatView + ChatViewModel：对接 MLX 流式输出，`<think>` 标签渲染
- [x] 重构 ModelManagerView：HuggingFace 模型列表、下载/删除，10 个主流模型
- [x] Onboarding 流程：检测内存 → 推荐模型 → 引导下载 → 首次对话
- [x] 聊天记录持久化（ChatStore，JSON 文件存储，按对话分文件）
- [x] 侧边栏聊天历史：AI 自动生成标题、重命名、删除、空对话清理
- [x] 模型加载错误提示（内联 Banner + Open Settings 跳转）
- [x] Settings 页面：设备信息、模型管理、About、Apps Built with ShipSwift

### Distribution：签名与发布（功能开发完成后执行）

- [ ] 集成 Sparkle 2.x 自动更新
- [ ] Developer ID 签名 + Notarization + DMG 打包

### Phase 2：MCP Agent（当前重点）

- [ ] 引入 `modelcontextprotocol/swift-sdk` SPM 依赖
- [ ] 实现 MCPClientManager：连接管理、工具列表缓存、callTool 调用
- [ ] ChatViewModel 集成 MCP tool calling 循环（检测 tool_call → 执行 → 结果注入对话）
- [ ] 打包 Node.js LTS darwin-arm64 binary 到 app bundle
- [ ] 实现 MCPServerManager：子进程启动/停止、Pipe Heartbeat 防孤儿、PID 文件清理
- [ ] MCP Server 配置 UI：添加/删除 Server、填写密钥/token、连接状态显示
- [ ] Agent UI：tool_call 执行过程展示、需要用户确认的操作（Shell 执行等）审批
- [ ] 更新签名流程（Node.js entitlements：allow-jit）

### Phase 3：深度整合

- [ ] macOS 系统整合：Spotlight、Share Extension、全局快捷键
- [ ] Apple Foundation Models 集成（macOS 26+，轻量任务分流）
- [ ] 多模态支持（VLM，图片输入）
- [ ] 对话历史持久化（SwiftData）
- [ ] 垂直场景定制（开发者 / 内容创作者模式）

---

## 附录 A：MLX 模型格式与转换

大部分主流模型在 mlx-community 已有现成的 MLX 格式版本。如需自行转换：

```bash
pip install mlx-lm

# 将任何 HuggingFace 模型转为 MLX 格式 + 量化
mlx_lm.convert \
  --hf-path Qwen/Qwen3-8B \
  --mlx-path ./Qwen3-8B-4bit \
  --quantize --q-bits 4
```

## 附录 B：参考项目

| 项目 | 说明 |
|------|------|
| [ml-explore/mlx-swift-examples](https://github.com/ml-explore/mlx-swift-examples) | Apple 官方示例，含 LLMEval、MLXChatExample |
| [preternatural-explore/mlx-swift-chat](https://github.com/preternatural-explore/mlx-swift-chat) | 完整 SwiftUI 聊天 App |
| [Trans-N-ai/swama](https://github.com/Trans-N-ai/swama) | 纯 Swift MLX 推理引擎 + OpenAI 兼容 API |
| [gluonfield/enchanted](https://github.com/gluonfield/enchanted) | SwiftUI 多平台 Ollama 客户端（UI 参考） |

## 附录 C：调研来源

- [MLX Swift GitHub](https://github.com/ml-explore/mlx-swift) / [MLX Swift LM](https://github.com/ml-explore/mlx-swift-lm)
- [WWDC 2025 Session 298 - Explore LLM on Apple Silicon with MLX](https://developer.apple.com/videos/play/wwdc2025/298/)
- [WWDC 2025 Session 315 - Get started with MLX](https://developer.apple.com/videos/play/wwdc2025/315/)
- [MLX vs llama.cpp Benchmark Paper (arXiv:2511.05502)](https://arxiv.org/abs/2511.05502)
- [Ollama v0.17.7 Release Notes](https://github.com/ollama/ollama/releases)
- [Apple Foundation Models Framework](https://developer.apple.com/documentation/FoundationModels)
- [mlx-community on HuggingFace](https://huggingface.co/mlx-community)
