# Klee 新架构方案：SwiftUI + Ollama + OpenClaw

> 目标：打造一个类 Claude Desktop 体验的本地 AI Agent 桌面应用，完全本地运行，零 API 费用，数据不出本机。

---

## 一、产品定位

把 `ollama launch openclaw` 这条命令，包成一个漂亮的 Mac 原生 app，让普通用户也能使用本地 AI Agent。

**核心价值主张：**
- 下载即用，无需终端操作
- 完全本地运行，数据私密
- 借助 Ollama + OpenClaw 开源生态持续成长
- 原生 SwiftUI，体积小、性能好、Mac 系统深度整合

---

## 二、技术架构

```
Klee.app (SwiftUI)
├── UI 层：SwiftUI 原生界面（对话、设置、onboarding）
├── 进程管理层：Swift Process 管理两个子进程
│   ├── Ollama（Go binary，本地推理引擎，端口 11435）
│   └── OpenClaw Gateway（Node.js，AI Agent 运行时，WebSocket 端口 18789）
└── 通信层：URLSessionWebSocketTask 接入 OpenClaw Gateway
```

### App Bundle 结构

```
Klee.app/
└── Contents/
    └── Resources/
        ├── ollama              # Go binary，~56MB
        ├── node                # Node.js 22 官方 binary，~80MB
        └── openclaw/           # 预装好的 npm 目录（优化后 ~200MB）
            ├── node_modules/
            └── package.json
```

### App Bundle 体积预估

| 组件 | 体积 |
|------|------|
| Klee SwiftUI 本体 | ~10 MB |
| Ollama binary (arm64) | ~56 MB |
| Node.js 22 binary (arm64) | ~80 MB |
| OpenClaw node_modules（优化后） | ~200 MB |
| **总计** | **~350 MB** |
| DMG 压缩后 | **~220 MB** |

竞品参考：Claude Desktop ~400MB，Cursor ~500MB，350MB 完全可接受。

---

## 三、关键技术决策

### 为什么用 SwiftUI 而不是 Electron

| 对比项 | Electron（旧 Klee） | SwiftUI（新方案） |
|---|---|---|
| 包体积 | 200MB+ | 紧凑 |
| 内存占用 | 高 | 低 |
| macOS 整合 | 弱 | 深度原生 |
| 开发效率 | 一般 | Wei 的主场 |
| Apple Silicon 优化 | 有限 | 完整 Metal 加速 |

### 为什么放弃 RAG

Agent + 长上下文的组合比 RAG 更优雅：
- 不需要向量数据库、embedding 模型、chunk 策略
- 没有 Python 依赖、没有 LanceDB
- 技术栈极度简化

### 运行时选择：Node.js，不用 Bun

OpenClaw 官方文档明确标注：
- **Bun：不推荐用于 Gateway 生产运行时**（WhatsApp/Telegram 有 bug）
- 从 2026.2.26 起 Bun 全局安装路径会导致插件校验失败，gateway 拒绝启动
- **必须使用 Node >= 22**

### 为什么不用 pkg 打成单 binary

- `pkg` 对 Node 22 支持不稳定，已废弃
- SEA 不支持原生模块，nexe 不成熟，Bun compile 不兼容
- OpenClaw 有大量动态 require 和原生模块（better-sqlite3、sharp 等）
- UPX 压缩与 codesign 不兼容
- 直接打包 node binary + 源码目录更可靠（Raycast 同方案）

---

## 四、进程生命周期管理

### 启动流程

```swift
class ProcessManager: ObservableObject {
    private var ollamaProcess: Process?
    private var openclawProcess: Process?

    // Ollama uses non-default port to avoid conflict with user's existing Ollama
    private let ollamaPort: Int = 11435
    private let openclawPort: Int = 18789

    func startAll() async throws {
        // 0. Clean up stale processes from previous crash
        try await cleanupStaleProcesses()

        // 1. Check if user already has Ollama running on 11434
        let userOllamaRunning = await checkPort(11434)

        // 2. Start Ollama on our dedicated port (or reuse user's)
        try await startOllama(reuseExisting: userOllamaRunning)

        // 3. Poll until Ollama is ready
        try await waitForOllama()

        // 4. Start OpenClaw with Ollama address injected
        try await startOpenClaw()
    }

    private func waitForOllama() async throws {
        let url = URL(string: "http://127.0.0.1:\(ollamaPort)/")!
        for _ in 0..<30 {
            if let _ = try? await URLSession.shared.data(from: url) {
                return // Returns "Ollama is running"
            }
            try await Task.sleep(nanoseconds: 1_000_000_000)
        }
        throw AppError.ollamaStartTimeout
    }
}
```

### 环境变量配置

从系统环境继承后再追加，否则子进程会缺失 PATH/LANG 等关键变量：

```swift
// Ollama environment
var ollamaEnv = ProcessInfo.processInfo.environment
ollamaEnv["OLLAMA_HOST"] = "127.0.0.1:\(ollamaPort)"
ollamaEnv["OLLAMA_MODELS"] = kleeModelsPath  // ~/Library/Application Support/Klee/OllamaModels/
ollamaEnv["OLLAMA_KEEP_ALIVE"] = "10m"
ollamaEnv["OLLAMA_FLASH_ATTENTION"] = "1"
ollamaEnv["OLLAMA_MAX_LOADED_MODELS"] = "1"
ollamaProcess.environment = ollamaEnv

// OpenClaw environment
var openclawEnv = ProcessInfo.processInfo.environment
openclawEnv["OLLAMA_HOST"] = "http://127.0.0.1:\(ollamaPort)"
openclawEnv["HOME"] = NSHomeDirectory()
openclawEnv["OPENCLAW_GATEWAY_PORT"] = "\(openclawPort)"
openclawEnv["OPENCLAW_GATEWAY_TOKEN"] = generatedToken
openclawProcess.environment = openclawEnv
```

### Graceful Shutdown

```swift
// In AppDelegate
func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    // Return .terminateLater to allow async cleanup
    Task {
        await processManager.shutdownAll()
        NSApplication.shared.reply(toApplicationShouldTerminate: true)
    }
    return .terminateLater
}

// Tiered shutdown: SIGTERM -> wait 3s -> SIGINT -> wait 2s -> SIGKILL
func shutdownAll() async {
    // Unload model to release VRAM before stopping Ollama
    try? await sendOllamaKeepAlive(seconds: 0)

    for process in [openclawProcess, ollamaProcess].compactMap({ $0 }) {
        process.terminate()  // SIGTERM
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        if process.isRunning {
            process.interrupt()  // SIGINT
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }
        if process.isRunning {
            kill(process.processIdentifier, SIGKILL)
        }
    }
}
```

### 防孤儿进程机制

Force Quit 或 crash 时子进程不会收到 terminate 信号，需要保底措施：

1. **启动时清理**：检查端口 11435/18789 是否被残留进程占用，若是则 kill
2. **Watchdog 子进程**：启动一个轻量 shell script 监控父进程 PID

```swift
// Launch watchdog that monitors parent PID
func startWatchdog() {
    let parentPID = ProcessInfo.processInfo.processIdentifier
    let script = """
    while kill -0 \(parentPID) 2>/dev/null; do sleep 2; done
    kill \(ollamaProcess.processIdentifier) 2>/dev/null
    kill \(openclawProcess.processIdentifier) 2>/dev/null
    """
    // Run as background Process
}
```

---

## 五、WebSocket 通信

使用原生 `URLSessionWebSocketTask`（零依赖，支持 async/await）接入 OpenClaw Gateway：

```swift
let url = URL(string: "ws://127.0.0.1:\(openclawPort)")!
var request = URLRequest(url: url)
request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

let task = URLSession.shared.webSocketTask(with: request)
task.resume()

// API commands
// - chat.send: send a message
// - chat.history: get chat history
// - chat.inject: inject system prompt
```

---

## 六、推荐模型配置（按内存）

| 内存 | 推荐方案 |
|---|---|
| 8GB | 不建议纯本地，使用 Cloud API 模式 |
| 16GB | `qwen3:8b` 主模型 + `GLM-4.7-Flash` fallback |
| 32GB | `Devstral-24B`（14GB，稳定）或 `Qwen3-Coder:32B`（20GB，最强）|
| 64GB+ | `Qwen3-Coder:32B` + `GLM-4.7-Flash` 双模型轮换 |

**关键要求：** OpenClaw 最少需要 32K context，生产建议 65K+。7B 以下模型 tool calling 不稳定，不适合 agent 任务。

---

## 七、分发方式：Developer ID 直接分发

### 为什么不走 App Store

App Store 沙盒与这套架构根本不兼容：
1. **Sandbox 禁止 spawn 子进程执行任意代码**（Node.js 进程）
2. **OpenClaw 的核心能力**（shell 执行、文件读写、控制其他 app）全部被沙盒封死
3. Node.js runtime 类似 Java，会被 Apple 以"deprecated technology"拒绝

**先例：** FreeChat 作者明确表示，为了进 App Store 专门放弃了 Ollama，改用直接集成 llama.cpp。

### Xcode 打包流程

**1. Signing 配置**
- Certificate：`Developer ID Application`（不是 Apple Distribution）
- App Sandbox：**关闭**
- Hardened Runtime：**开启**（公证硬性要求）

**2. 签名流程（由内到外，不用 --deep）**

Apple 不推荐 `--deep`，必须逐个签名，每个都加 `--options runtime --timestamp`：

```bash
IDENTITY="Developer ID Application: 你的名字 (TEAMID)"

# Step 1: Sign all native modules (.node files)
find Klee.app/Contents/Resources/openclaw/node_modules -name "*.node" \
  -exec codesign --force --sign "$IDENTITY" --options runtime --timestamp {} \;

# Step 2: Sign all dynamic libraries
find Klee.app/Contents/Resources/openclaw/node_modules -name "*.dylib" \
  -exec codesign --force --sign "$IDENTITY" --options runtime --timestamp {} \;

# Step 3: Sign ollama binary
codesign --force --sign "$IDENTITY" --options runtime --timestamp \
  Klee.app/Contents/Resources/ollama

# Step 4: Sign node binary (needs extra entitlements for JIT)
codesign --force --sign "$IDENTITY" --options runtime --timestamp \
  --entitlements node.entitlements \
  Klee.app/Contents/Resources/node

# Step 5: Sign the app bundle (last)
codesign --force --sign "$IDENTITY" --options runtime --timestamp \
  Klee.app
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

**3. Archive & 公证**
```
Product -> Archive
-> Distribute App
-> Direct Distribution
-> Upload to Apple's notarization service (Xcode auto, 1-5 min)
-> Export Notarized App
```

**4. 打包 DMG（DMG 也需要单独公证 + staple）**
```bash
brew install create-dmg

create-dmg \
  --volname "Klee" \
  --window-size 600 400 \
  --icon "Klee.app" 175 190 \
  --app-drop-link 425 190 \
  "Klee.dmg" \
  "Klee.app"

# Notarize the DMG
xcrun notarytool submit Klee.dmg --apple-id "you@email.com" \
  --team-id "TEAMID" --password "@keychain:AC_PASSWORD" --wait

# Staple the notarization ticket to DMG
xcrun stapler staple Klee.dmg
```

**用户体验：** 下载 dmg -> 拖入 Applications -> 首次打开确认弹窗（有签名不会出红色警告）-> 直接使用。

---

## 八、node_modules 优化

OpenClaw 全量 `npm install` 约 1.4 GB，含大量开发依赖和非必要原生模块。打包前必须优化：

```bash
# 1. Only install production dependencies
npm install --omit=dev

# 2. Mark heavy optional dependencies as optional in package.json
# node-llama-cpp (~600MB) and @napi-rs/canvas (~152MB) are not needed
# when using Ollama as the inference backend
# Set them as optionalDependencies and skip with --no-optional

# 3. Clean up test/docs/TypeScript source files
npx node-prune

# 4. Remove non-darwin-arm64 platform prebuilds
find node_modules -path "*/prebuilds/linux-*" -exec rm -rf {} +
find node_modules -path "*/prebuilds/win32-*" -exec rm -rf {} +
find node_modules -path "*/prebuilds/darwin-x64" -exec rm -rf {} +
```

**注意：** 原生模块（better-sqlite3 等）有 Node ABI 版本绑定，更新 OpenClaw 版本后需重新签名所有 `.node` 文件。

### 前置验证（在写 Swift 代码之前必须完成）

上述优化方案是理论推演，核心假设——删除 node-llama-cpp 和 @napi-rs/canvas 后 Gateway 仍能正常工作——**必须实际验证**。如果 OpenClaw 代码路径在初始化时硬引用了这两个包，删除后 app 会直接崩溃，200MB 的体积估算也不成立。

**验证步骤：**

```bash
# 0. Prerequisites: Ollama running locally, Node >= 22 installed
ollama serve &

# 1. Create a clean test directory
mkdir -p /tmp/klee-openclaw-test && cd /tmp/klee-openclaw-test

# 2. Install OpenClaw with production deps only
npm init -y
npm install openclaw --omit=dev

# 3. Record baseline size
du -sh node_modules  # Expected: ~800MB-1GB (no devDeps)

# 4. Remove the two heavy optional packages
rm -rf node_modules/node-llama-cpp
rm -rf node_modules/@napi-rs/canvas
# Also remove any dangling references
npm ls 2>&1 | grep "MISSING" || echo "No missing deps"

# 5. Record optimized size
du -sh node_modules  # Target: ~200-300MB

# 6. Run platform cleanup
find node_modules -path "*/prebuilds/linux-*" -exec rm -rf {} + 2>/dev/null
find node_modules -path "*/prebuilds/win32-*" -exec rm -rf {} + 2>/dev/null
find node_modules -path "*/prebuilds/darwin-x64" -exec rm -rf {} + 2>/dev/null

# 7. Run node-prune
npx node-prune

# 8. Record final size
du -sh node_modules  # This is the real number for App Bundle

# 9. Start OpenClaw Gateway pointing to local Ollama
OLLAMA_HOST=http://127.0.0.1:11434 npx openclaw gateway
# Expected: Gateway starts on port 18789

# 10. Smoke test: send a message via WebSocket
# Use websocat or a simple script to connect to ws://127.0.0.1:18789
# and send a chat.send command. Verify response comes back.
```

**判定标准：**

| 检查项 | 通过条件 |
|--------|---------|
| Gateway 启动 | 无 require 错误，监听 18789 |
| 聊天功能 | WebSocket 发消息能收到 LLM 回复 |
| node_modules 体积 | 优化后 ≤ 300MB |
| 无运行时报错 | 日志中无 MODULE_NOT_FOUND 错误 |

**如果验证失败：**
- 如果 Gateway 启动时报 `Cannot find module 'node-llama-cpp'`：尝试创建一个空的 stub 模块（`mkdir -p node_modules/node-llama-cpp && echo "module.exports = {}" > node_modules/node-llama-cpp/index.js`）
- 如果 stub 也不行：保留 node-llama-cpp，放弃该项优化，预期体积上调至 ~400-500MB
- 如果 @napi-rs/canvas 被硬引用：同理 stub 或保留
- 最终体积超过 500MB：仍可接受（Cursor 500MB），但需要更重视 Sparkle delta 更新

---

## 九、自动更新

### 为什么选 Sparkle 2.x

非 App Store 分发的 macOS app 没有系统级自动更新。Sparkle 是事实标准（Firefox、VLC、iTerm2、Figma 都用），2.x 版本完全支持 Swift/SPM。

其他方案不可行：
- 自己写更新逻辑：需要处理下载、校验、替换、权限提升，工作量大且容易出安全漏洞
- Electron autoUpdater：已弃用 Electron
- macOS Installer pkg：体验差，不适合拖拽安装的 app

### 集成方式

**SPM 添加依赖：**
```swift
// Package.swift or Xcode: File > Add Package Dependencies
// https://github.com/sparkle-project/Sparkle
// Version: 2.x (Up to Next Major)
```

**SwiftUI 集成：**
```swift
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

// Menu item view
struct CheckForUpdatesView: View {
    @ObservedObject private var checkForUpdatesViewModel: CheckForUpdatesViewModel
    let updater: SPUUpdater

    init(updater: SPUUpdater) {
        self.updater = updater
        self.checkForUpdatesViewModel = CheckForUpdatesViewModel(updater: updater)
    }

    var body: some View {
        Button("Check for Updates…", action: updater.checkForUpdates)
            .disabled(!checkForUpdatesViewModel.canCheckForUpdates)
    }
}
```

**Info.plist 配置：**
```xml
<key>SUFeedURL</key>
<string>https://klee.app/appcast.xml</string>

<key>SUPublicEDKey</key>
<string>YOUR_ED25519_PUBLIC_KEY</string>

<!-- Auto-check on launch (user can disable in Settings) -->
<key>SUEnableAutomaticChecks</key>
<true/>

<!-- Interval in seconds (default 24h = 86400) -->
<key>SUScheduledCheckInterval</key>
<integer>86400</integer>
```

### Delta 更新（关键）

对于 400-650MB 的 app，全量更新体验很差。Sparkle 的 delta 更新只下载版本间的差异：

**典型场景：**

| 更新内容 | 全量下载 | Delta 下载 |
|---------|---------|-----------|
| 只改了 SwiftUI 代码 | ~400MB | **~5-10MB** |
| 更新了 OpenClaw 版本 | ~400MB | **~50-100MB** |
| 更新了 Ollama binary | ~400MB | **~30-50MB** |
| 全部组件都更新 | ~400MB | ~300MB（此时接近全量） |

**生成 delta 更新包：**
```bash
# Sparkle ships with generate_appcast tool
# Place versioned .zip archives in a directory:
#   releases/
#     Klee-1.0.0.zip
#     Klee-1.0.1.zip
#     Klee-1.1.0.zip

# generate_appcast auto-creates delta patches between consecutive versions
./Sparkle/bin/generate_appcast releases/

# Output:
#   releases/
#     Klee-1.0.0.zip
#     Klee-1.0.1.zip
#     Klee-1.0.0-1.0.1.delta    <- auto-generated
#     Klee-1.1.0.zip
#     Klee-1.0.1-1.1.0.delta    <- auto-generated
#     appcast.xml                <- auto-generated feed
```

Sparkle 客户端会优先尝试下载 delta，失败时 fallback 到全量。

### 发布服务器

不需要专门的后端，只需要静态文件托管：

- **GitHub Releases**：免费，适合开源/早期阶段。把 `.zip` + `.delta` + `appcast.xml` 作为 release assets
- **CDN（CloudFlare R2 / S3）**：适合用户量大时。R2 免出站流量费

**发版流程：**
1. Xcode Archive → Export Notarized App
2. `zip -ry Klee-x.y.z.zip Klee.app`
3. 放入 releases 目录，运行 `generate_appcast`
4. 上传 `.zip` + `.delta` + `appcast.xml` 到托管服务
5. 用户 app 自动检测到新版本，提示更新

### EdDSA 密钥管理

```bash
# Generate key pair (only once, keep private key safe!)
./Sparkle/bin/generate_keys

# Output:
#   Private key saved to Keychain (item: "Sparkle EdDSA")
#   Public key: <base64 string>  <- put this in Info.plist as SUPublicEDKey

# Export private key for CI (store as secret)
./Sparkle/bin/generate_keys --export-private-key
```

**安全要点：**
- 私钥存 macOS Keychain，CI 环境用 secret 注入
- 公钥编译进 app（Info.plist），客户端用它验证更新包签名
- 即使有人劫持了 CDN，没有私钥也无法推送恶意更新

---

## 十、战略优势：借助开源生态成长

这套方案的核心战略是：**做交付层，不做基础层**。

| 上游项目 | 你的受益 |
|---|---|
| Ollama 推理优化 | 同等硬件速度持续提升，Metal 加速自动获得 |
| Ollama 新模型支持 | 用户可选模型越来越多 |
| OpenClaw 新 Skill | agent 能力不断扩展，ClawHub 已有 5700+ skills |
| OpenClaw 稳定性修复 | app 稳定性自动提升 |
| 开源模型进步 | 相同硬件效果越来越好，用户感知 app 越来越聪明 |

---

## 十一、竞争风险与护城河

**主要风险：** OpenClaw 官方已发布 macOS Companion App Beta（menubar app，macOS 14+，Universal Binary），功能包括聊天面板、全局快捷键、原生通知。差异化空间被压缩。

**Klee 的差异化：**

| 能力 | Companion App | Klee |
|------|--------------|------|
| 内置 Ollama | 需自行安装 | 开箱即用 |
| 内置 OpenClaw | 需自行安装 Node.js + npm | 开箱即用 |
| 中文 onboarding | 无 | 模型推荐、内存适配 |
| 安装门槛 | 需终端操作 | 拖入 Applications 即可 |
| 目标用户 | 开发者 | 普通用户也能用 |

**真正的护城河：**
- **中文用户体验**：界面、onboarding、文档全中文，懂国内用户习惯
- **更低上手门槛**：比官方更精心设计的引导流程
- **垂直场景深耕**：针对特定用户群（开发者/内容创作者）的定制化

---

## 十二、下一步行动

### Phase 0：验证（阻塞后续所有工作）
- [ ] **执行第八章「前置验证」**：确认删除 node-llama-cpp / @napi-rs/canvas 后 Gateway 能正常启动和聊天
- [ ] 记录真实的 node_modules 优化后体积，更新本文档的体积预估

### Phase 1：项目搭建
- [ ] 搭建 SwiftUI 项目基础结构
- [ ] 实现 Ollama 进程管理（端口隔离 + 复用检测 + watchdog）
- [ ] 打通 OpenClaw 进程启动与配置自动注入
- [ ] 用 URLSessionWebSocketTask 接入 OpenClaw Gateway（端口 18789）

### Phase 2：功能完善
- [ ] 设计 onboarding 流程（模型选择、首次配置）
- [ ] node_modules 优化打包脚本（基于 Phase 0 验证结果）
- [ ] 集成 Sparkle 2.x 自动更新

### Phase 3：分发
- [ ] Developer ID 签名（逐个签名 + entitlements）+ Notarization 流程验证
- [ ] 打包 dmg（含 dmg 公证 + staple），内测分发
