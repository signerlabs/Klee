# Klee 模块化架构提案：CLI 模式集成方案

> 文档版本：v0.2 | 日期：2026-03-15 | 状态：Draft / 待讨论

---

## 1. 背景与目标

### 1.1 产品愿景

将 Klee 从一个"本地 AI 聊天应用"升级为**模块化的本地 AI Agent 平台**。用户下载 Klee 后，根据自己的需求启用功能模块（如小红书运营、B站管理、文件处理等），AI 自动调用对应模块完成任务。

### 1.2 核心约束

Klee 使用本地 MLX 模型推理，上下文窗口远小于云端模型：

| 模型 | 参数量 | 上下文窗口 | 对比 |
|------|--------|-----------|------|
| Qwen 3.5 9B (Klee 主力) | 9B | ~32K tokens | — |
| DeepSeek R1 8B | 8B | ~8-16K tokens | — |
| Gemma 3 12B | 12B | ~8K tokens | — |
| Claude Sonnet (云端) | — | 200K tokens | **6-25 倍** |

**上下文窗口是本地模型最稀缺的资源，模块化架构的首要设计原则是最小化上下文占用。**

### 1.3 当前状态

Klee 已实现 MCP（Model Context Protocol）工具集成，支持通过 MCP 服务器扩展能力。当前内置两个 MCP 连接器：Web Browser（Playwright）和 Filesystem。

---

## 2. 问题分析：为什么 MCP 模式不适合规模化扩展

### 2.1 上下文膨胀问题

MCP 协议要求在对话开始前将所有工具的 JSON Schema 完整注入上下文。行业基准测试数据：

| 指标 | MCP 模式 | CLI 模式 | 差距 |
|------|---------|---------|------|
| 26 个工具的 Schema 开销 | ~3,600 tokens | ~68 tokens | **53x** |
| 最简单任务总 Token 消耗 | 44,026 tokens | 1,365 tokens | **32x** |
| 5 个服务器 / 58 个工具 | ~55,000 tokens | ~0 | — |

> 数据来源：Scalekit 2026.03 基准测试、Anthropic 官方测试报告

**模拟场景：** Klee 接入 4 个功能模块（小红书、B站、微博、抖音），每模块约 15 个工具：

- MCP 方式：60 个工具 Schema ≈ **8,000-10,000 tokens**
  - 在 32K 上下文中占用 25-30%
  - 在 8K 模型中直接不可用
- CLI 方式：4 个模块的能力描述 ≈ **800 tokens**
  - 在 32K 上下文中占用 <3%
  - 在 8K 模型中仍有充裕空间

### 2.2 工具选择准确率下降

研究数据显示，工具数量超过 20 个时，模型的工具选择准确率显著下降。Fastn 的测试：

- 未优化的 MCP 工具：**68% 任务完成率，23% 幻觉率**
- 优化后：89% 完成率，8% 幻觉率

以上数据基于 GPT-4 / Claude 等大参数模型。**对 9B 本地模型而言，准确率会进一步恶化。**

CLI 天然回避此问题：LLM 在海量 shell 命令语料上训练过，生成 `xhs search "关键词" --json` 的可靠性远高于从 60 个 JSON Schema 中选择正确工具。

### 2.3 资源开销

| 资源 | MCP 模式 | CLI 模式 |
|------|---------|---------|
| 每个模块运行时内存 | Node.js 进程 + Chrome (~200-500MB) | 按需启动，执行后释放 (~10-50MB 峰值) |
| 依赖项 | Node.js + npx + Chromium | 仅 CLI 工具本身 |
| 进程管理复杂度 | 持久连接，需管理生命周期 | 无状态，执行完即退出 |

---

## 3. 提案：三层模块化架构

### 3.1 架构总览

```
┌──────────────────────────────────────────────────────────┐
│  Klee App                                                │
│                                                          │
│  ┌─────────────┐   ┌───────────────┐   ┌──────────────┐ │
│  │ Module       │──▶│ Skill Layer   │──▶│ Local LLM    │ │
│  │ Manager      │   │ (Progressive  │   │ (MLX Swift)  │ │
│  │ (Enable/     │   │  Disclosure)  │   │              │ │
│  │  Disable)    │   └───────────────┘   └──────┬───────┘ │
│  └─────────────┘                               │         │
│                                         Generates CLI    │
│                                          command         │
│                                                │         │
│                                        ┌───────▼───────┐ │
│                                        │ CLI Executor   │ │
│                                        │ (Process API)  │ │
│                                        └───────┬───────┘ │
│                                                │         │
│       ┌────────────┬────────────┬──────────────┤         │
│       ▼            ▼            ▼              ▼         │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ xhs-cli │ │ bili-cli  │ │weibo-cli │ │  ......  │    │
│  │ (小红书) │ │ (B站)    │ │ (微博)    │ │          │    │
│  └─────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ MCP Layer (Reserved)                              │    │
│  │ Playwright / Filesystem / Other stateful tools    │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### 3.2 第一层：Module Manager（模块管理器）

管理模块的注册、安装状态检测、启用/禁用。

```swift
struct KleeModule: Codable, Identifiable {
    let id: String              // "xiaohongshu"
    let name: String            // "小红书"
    let icon: String            // "note.text" (SF Symbol)
    let cliTool: String         // "xhs"
    let installCommand: String  // "pip install xiaohongshu-cli"
    let skillPrompt: String     // 自然语言能力描述 (~200 tokens)
    var isEnabled: Bool
    var isInstalled: Bool       // 运行时检测
}
```

UI 呈现：类似现有 Settings → Connectors 的交互模式，增加安装引导。

### 3.3 第二层：Skill Layer（技能描述层）

每个模块对应一段精简的自然语言 Skill 描述，仅在模块启用时注入系统提示词。

**示例（小红书模块，约 200 tokens）：**

```
你可以通过 xhs 命令操作小红书，所有命令支持 --json 结构化输出。

核心命令：
- 搜索笔记: xhs search "关键词" --limit 10 --json
- 阅读笔记: xhs read <note-id> --json
- 发布图文: xhs publish --title "标题" --content "正文" --images a.jpg b.jpg
- 发布视频: xhs publish --title "标题" --content "正文" --video v.mp4
- 查看评论: xhs comments <note-id> --json
- 发表评论: xhs comment <note-id> "评论内容"
- 用户信息: xhs user <user-id> --json

搜索结果会缓存索引，可用 xhs read 3 直接访问第 3 条结果。
发布前请先确认用户意图和内容完整性。
```

**对比 MCP Schema 方式：** 同等功能的 MCP 工具定义约 1,500-2,000 tokens，CLI Skill 描述仅 ~200 tokens，**节省 85-90%**。

**渐进式加载策略：**

| 阶段 | 加载内容 | Token 开销 |
|------|---------|-----------|
| 未启用 | 不加载 | 0 |
| 已启用 | Skill Prompt | ~200/模块 |
| 执行时 | CLI 命令生成 + 输出解析 | 按需 |

### 3.4 第三层：CLI Executor（CLI 执行引擎）

负责执行 LLM 生成的 CLI 命令，解析输出，回传结果。

**统一输出协议：**

```json
{
    "ok": true,
    "schema_version": "1.0",
    "data": { ... },
    "error": null
}
```

所有接入 Klee 的 CLI 模块必须遵循此格式（`--json` 输出时）。

**执行流程：**

```
LLM 生成命令 → 安全校验（白名单） → Process 执行
→ 解析 JSON 输出 → 格式化展示 → 结果回传 LLM（如需后续推理）
```

**安全设计：**
- 命令白名单：仅允许执行已注册模块的 CLI 命令
- 危险操作拦截：涉及删除、发布等操作时弹窗确认
- 执行超时：默认 30 秒超时保护

### 3.5 MCP 层保留

现有 MCP 基础设施不废弃，继续用于需要持久连接的场景：

- Playwright 浏览器控制（需要 WebSocket 长连接）
- 文件系统监控
- 数据库连接

**决策原则：无状态操作 → CLI 模块；有状态/持久连接 → MCP。**

---

## 4. 对比总结

### 4.1 架构对比

| 维度 | 现有 MCP 方案 | CLI 模块方案（提案） |
|------|-------------|-------------------|
| 上下文开销/模块 | ~1,500-2,000 tokens | **~200 tokens** |
| 4 个模块总开销 | ~6,000-8,000 tokens | **~800 tokens** |
| 8K 上下文模型可用性 | 勉强（1-2个模块） | **充裕（4+个模块）** |
| 32K 上下文模型可用性 | 可用但紧张 | **宽裕** |
| 运行时内存/模块 | ~200-500MB（Node+Chrome） | **~10-50MB（峰值）** |
| 工具选择准确率 | 随工具数增加下降 | **稳定（LLM 原生 CLI 能力）** |
| 安装复杂度 | 需 Node.js + npx | **pip install 一条命令** |
| 调试能力 | MCP 协议层不透明 | **用户可终端直接运行验证** |
| 生态兼容 | 10+ MCP 客户端 | Klee 专属（CLI 本身通用） |

### 4.2 Token 预算对比（以 32K 上下文为例）

```
32,768 tokens 总预算

MCP 方案（4个模块）:
├── 工具 Schema:     8,000 tokens  (24.4%)
├── 系统提示词:       500 tokens   (1.5%)
├── 对话历史:       16,000 tokens  (48.8%)  ← 约 10 轮对话
└── 模型生成空间:    8,268 tokens  (25.2%)

CLI 方案（4个模块）:
├── Skill 描述:       800 tokens   (2.4%)
├── 系统提示词:       500 tokens   (1.5%)
├── 对话历史:       22,000 tokens  (67.1%)  ← 约 15 轮对话
└── 模型生成空间:    9,468 tokens  (28.9%)
```

**CLI 方案多出约 37% 的可用上下文空间，直接转化为更长的对话轮数和更好的推理质量。**

---

## 5. 实施路线

### Phase 1：基础设施（预计 1-2 周）

- [ ] 新增 `ModuleManager` 服务（模块注册、状态检测、启用/禁用）
- [ ] 新增 `CLIExecutor` 服务（命令执行、输出解析、安全校验）
- [ ] 新增 Module 管理 UI（Settings 面板新增 Modules tab）
- [ ] 定义统一输出协议规范

### Phase 2：小红书模块试点（预计 1-2 周）

- [ ] 集成 xiaohongshu-cli（或自研轻量 CLI）
- [ ] 编写小红书模块的 Skill Prompt
- [ ] 实现 CLI 输出在 Klee UI 中的结构化展示（搜索结果列表、笔记详情等）
- [ ] 端到端测试：搜索 → 阅读 → 评论 → 发布完整流程

### Phase 3：模块生态扩展（持续）

- [ ] 发布模块开发规范（CLI 接口标准 + Skill Prompt 模板）
- [ ] 接入更多模块（B站、微博等）
- [ ] 模块市场 / 模块注册表（远期）

---

## 6. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| CLI 工具安装门槛 | 非技术用户不会用 pip | Klee 内嵌 Python runtime 或提供一键安装 |
| CLI 输出格式不统一 | 解析失败 | 制定严格的输出协议规范，提供 SDK/模板 |
| 逆向 API 类 CLI 的风控风险 | 账号封禁 | 模块声明风险等级，高风险模块需用户确认 |
| 本地模型生成错误命令 | 执行失败或意外操作 | 命令白名单 + 危险操作确认 + 参数校验 |
| 第三方 CLI 工具停止维护 | 模块不可用 | 模块状态标记系统 + 社区替代方案引导 |

---

## 7. 开放讨论点

1. **CLI 工具来源策略**：优先集成社区现有工具（如 xiaohongshu-cli），还是自研标准化 CLI 工具集？
2. **安装方式**：内嵌 Python runtime（增大包体约 30-50MB）vs 依赖用户系统环境？
3. **是否需要模块签名/审核机制**防止恶意模块？
4. **MCP 和 CLI 的边界**如何划分？是否有些场景两者都可以，需要统一决策标准？
5. **远期是否开放第三方模块提交**？如果是，需要什么样的审核和分发机制？

---

## 8. 补充议题：Swift 原生改写替代外部 CLI 依赖

### 8.1 问题

前述方案（Phase 2）依赖外部 Python CLI 工具（如 `xiaohongshu-cli`），用户需要安装 Python 环境。对于 Klee 的目标用户（非技术用户为主的 Mac 用户），这是一个显著的体验障碍。

**核心问题：能否用 Swift 改写 xiaohongshu-cli，直接内置到 Klee 中？**

### 8.2 xiaohongshu-cli 技术栈分析

经过对源码的完整审查（[GitHub: jackwener/xiaohongshu-cli](https://github.com/jackwener/xiaohongshu-cli)，Apache 2.0 协议）：

**项目结构：**

```
xhs_cli/
├── signing.py            # 薄封装层 → 调用 xhshow 库
├── creator_signing.py    # Creator API 签名 (MD5 + AES-128-CBC, ~50 行)
├── client.py             # HTTP 客户端 + 重试 + 反检测
├── cookies.py            # Cookie 管理 (browser-cookie3)
├── constants.py          # API 端点 + UA + 版本常量
├── exceptions.py         # 6 种错误类型
├── qr_login.py           # QR 二维码登录
├── formatter.py          # 输出格式化
└── commands/             # 6 个命令模块
    ├── auth.py           # 登录/登出/状态
    ├── reading.py        # 搜索/阅读/评论/用户
    ├── interactions.py   # 点赞/收藏/评论
    ├── social.py         # 关注/取关
    ├── creator.py        # 发布/管理笔记
    └── notifications.py  # 通知
```

**关键依赖链：**

```
xiaohongshu-cli
└── xhshow (纯 Python, MIT)     ← 核心签名算法
└── pycryptodome               ← AES-128-CBC (Creator API)
└── httpx                      ← HTTP 客户端
└── browser-cookie3            ← 浏览器 Cookie 提取
└── click / rich               ← CLI 框架 (Klee 不需要)
└── camoufox                   ← QR 登录浏览器 (可替代)
```

### 8.3 签名机制详解

**两套独立的签名系统：**

**① 主 API 签名（edith.xiaohongshu.com）**

由 [xhshow](https://github.com/Cloxl/xhshow) 库（纯 Python，MIT 协议）实现，生成 5 个 header：

| Header | 用途 |
|--------|------|
| `x-s` | 请求签名（核心） |
| `x-s-common` | 公共参数签名 |
| `x-t` | 毫秒时间戳 |
| `x-b3-traceid` | 分布式追踪 ID (16 字符) |
| `x-xray-traceid` | X-Ray 追踪 ID (32 字符) |

包含 session 模拟（GPU、屏幕分辨率等指纹一致性），无 JS 评估，无编译二进制。

**② Creator API 签名（creator.xiaohongshu.com）**

仅 ~50 行代码，算法完全透明：

```
输入: API路径 + JSON请求体
  → MD5 哈希
  → 拼接 x1(md5) + x2(固定位图) + x3(a1 cookie) + x4(时间戳)
  → Base64 编码
  → AES-128-CBC 加密 (密钥/IV 均为硬编码常量)
  → Hex 编码
  → 组装 JSON envelope
  → Base64 编码
  → 添加 "XYW_" 前缀
输出: x-s header + x-t header
```

### 8.4 各模块 Swift 改写难度评估

| 模块 | Python 实现 | Swift 对应方案 | 难度 | 代码量估算 |
|------|-----------|-------------|------|----------|
| **主 API 签名 (xhshow)** | 纯 Python 逆向算法 | CryptoKit + 自定义逻辑 | **中高** | ~500-800 行 |
| **Creator 签名** | MD5 + AES-128-CBC ~50 行 | CryptoKit (原生支持) | **低** | ~60 行 |
| **HTTP 客户端** | httpx | URLSession | **低** | ~200 行 |
| **重试 + 高斯抖动** | time.sleep + random.gauss | Task.sleep + 自定义分布 | **低** | ~50 行 |
| **Cookie 管理** | browser-cookie3 | macOS Security Framework / SQLite | **中** | ~150 行 |
| **API 端点封装** | 6 个 mixin 文件 | Swift Service methods | **低** | ~400 行 |
| **QR 登录** | camoufox 浏览器 | WKWebView / ASWebAuthenticationSession | **中** | ~200 行 |
| CLI 框架 (Click) | — | **不需要** (Klee 是 GUI) | — | 0 |
| 终端 UI (Rich) | — | **不需要** (Klee 自己渲染) | — | 0 |

**预估总工作量：~1,500-2,000 行 Swift 代码**（不含测试），主要工作量集中在 xhshow 签名算法移植。

### 8.5 Swift 原生方案 vs 外部 CLI 方案对比

| 维度 | 外部 CLI 方案 | Swift 原生改写 |
|------|-------------|--------------|
| **用户安装体验** | 需安装 Python + pip | **零配置，开箱即用** |
| **包体增加** | +30-50MB (嵌入 Python) 或依赖用户环境 | **~0** (编译进 Klee) |
| **运行时开销** | 启动 Python 进程 (~50-100ms) | **原生调用 (~0ms)** |
| **类型安全** | 解析 JSON 字符串输出 | **Swift struct 直接返回** |
| **错误处理** | 解析 CLI stderr | **Swift Error 原生 throw** |
| **UI 集成深度** | 需要中间解析层 | **直接绑定 SwiftUI** |
| **取消支持** | kill 子进程 | **Swift Task cancellation** |
| **调试体验** | 日志在外部进程 | **Xcode 断点 + 统一日志** |
| **LLM 集成** | LLM → 生成命令 → 执行 → 解析 | **LLM → 意图识别 → 直接调用方法** |
| **维护成本** | 跟进上游 Python 包更新 | 需自行跟进签名算法变更 |

### 8.6 架构升级：从 CLI 中间层到原生 Service

Swift 改写后，架构从三层简化为两层，**去掉了 CLI Executor 这个中间层**：

```
┌──────────────────────────────────────────────────────────┐
│  Klee App                                                │
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
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ MCP Layer (Reserved)                              │    │
│  │ Playwright / Filesystem / Other stateful tools    │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**LLM 与模块的交互方式对比：**

```
外部 CLI 方案:
  LLM 生成 "xhs search 美食 --json"
  → Klee 解析命令字符串
  → Process 启动 Python
  → 等待 JSON 输出
  → 解析 JSON 字符串
  → 回传 LLM

Swift 原生方案:
  LLM 识别意图: search(keyword: "美食")
  → Klee 直接调用 XHSService.search("美食")
  → 返回 [Note] Swift 数组
  → 格式化为文本回传 LLM
```

**上下文开销进一步降低：** Skill 描述不再需要列出 CLI 命令语法，只需描述能力：

```
（优化后 Skill Prompt，约 120 tokens）

你可以操作小红书：搜索笔记、阅读内容、查看/发表评论、
点赞收藏、发布图文/视频笔记、查看通知。
发布前请确认用户意图和内容完整性。
搜索时默认返回 10 条结果。
```

### 8.7 最大风险与缓解

**风险：签名算法的持续维护**

小红书会不定期更新签名算法。Swift 版本需要跟进 xhshow 上游变更。

**缓解策略：**

| 策略 | 说明 |
|------|------|
| **签名模块独立封装** | 将签名逻辑封装为独立 Swift Package，可单独更新 |
| **交叉验证测试** | 编写测试用例，用相同输入分别调用 Python 和 Swift 实现，验证输出一致 |
| **降级方案** | 如签名短期无法跟进，可临时回退到"内嵌 xhshow Python 包"方式 |
| **社区同步** | 关注 xhshow 仓库的 commit，设置 GitHub Watch |

### 8.8 修订后的实施路线

```
Phase 1: 模块基础设施 (1-2 周)
├── ModuleManager 服务
├── Module 管理 UI
└── Skill Layer 注入机制

Phase 2: 小红书 Swift Service (2-3 周)         ← 修订
├── 移植 xhshow 签名算法到 Swift              ← 核心工作量
├── 移植 Creator 签名 (MD5 + AES-128-CBC)
├── 实现 XHSService (HTTP 客户端 + API 封装)
├── 实现 Cookie 管理 (Chrome Cookie 读取)
├── 实现 QR 登录 (WKWebView)
├── 编写签名交叉验证测试
└── UI 集成 (搜索结果、笔记详情、发布流程)

Phase 3: 模块生态扩展 (持续)
├── 总结 Swift Service 开发模式
├── 发布模块开发 SDK / 模板
├── 接入更多平台模块
└── 同时支持 Swift 原生模块和外部 CLI 模块
    (对无法改写 Swift 的场景保留 CLI 通道)
```

### 8.9 结论

**Swift 原生改写是 Klee 的最优解。** 理由：

1. **用户体验**：零安装、零配置、开箱即用，符合 Mac 原生应用的用户期望
2. **技术可行性**：签名核心 xhshow 是纯 Python + MIT 协议，无黑盒组件，可逐行移植
3. **集成深度**：Swift 原生 Service 可直接绑定 SwiftUI，省去 CLI 命令生成和 JSON 解析的中间层
4. **上下文效率**：Skill 描述从 ~200 tokens 进一步压缩到 ~120 tokens（无需描述 CLI 语法）
5. **包体零增长**：代码编译进 Klee，不增加任何外部依赖
6. **预估工作量**：~1,500-2,000 行 Swift 代码，核心难点在 xhshow 签名移植（2-3 周）

**唯一需要持续投入的是签名算法的跟进维护**，但通过独立封装 + 降级方案 + 交叉测试可以有效管控风险。

---

## 9. 开放讨论点（修订）

1. ~~**CLI 工具来源策略**~~ → **Swift 原生改写为首选方案，CLI 作为备选通道**
2. ~~**安装方式**~~ → **编译进 Klee，无需安装**
3. **签名算法维护机制**：如何建立 xhshow 上游变更的快速同步流程？
4. **是否需要模块签名/审核机制**防止恶意模块？（主要针对未来的第三方模块）
5. **MCP 和原生 Service 的边界**如何划分？建议：有状态/长连接 → MCP，无状态 API 调用 → Swift Service
6. **逆向 API 的法律合规性**：需要法务评估小红书 ToS 对自动化访问的限制
7. **模块混合模式**：是否同时支持 Swift 原生模块（核心平台）和外部 CLI 模块（长尾平台）？

---

## 10. MLX 推理优化：借鉴 oMLX 方案优化 Qwen3.5 多模态推理

### 10.1 问题背景

Klee 从 Qwen3-8B（纯文本 LLM）切换到 Qwen3.5-9B（原生多模态 VLM）后，推理速度严重下降，从"丝滑"变为"不可用"。

**根因分析：**

| 因素 | 说明 | 影响程度 |
|------|------|---------|
| **架构差异** | Qwen3.5 使用 Gated DeltaNet 线性注意力（24 层）+ 标准注意力（8 层），是全新机制，MLX Metal kernel 刚合并支持 | **致命** |
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

### 10.2 oMLX 的优化思路

[oMLX](https://github.com/jundot/omlx)（Apache 2.0，~42,900 行 Python）是目前对 Qwen3.5 在 MLX 上优化最积极的项目（v0.2.14-0.2.17 连续发版修复 Qwen3.5 问题）。其核心优化分为三个层次：

#### 层次一：推理引擎层优化

**① Gated DeltaNet 的 `cache.advance()` 修复**

mlx-lm 的 `GatedDeltaNet.__call__()` 缺少 `cache.advance(S)` 调用，导致 batch_size > 1 时 SSM mask 错误、数值发散。oMLX 通过 monkey-patch 在 forward 后注入：

```python
# omlx/patches/gated_delta_advance.py
def patched_call(self, inputs, mask=None, cache=None):
    result = original_call(self, inputs, mask=mask, cache=cache)
    if cache is not None:
        cache.advance(inputs.shape[1])
    return result
```

**② VLMModelAdapter：将 VLM 伪装成 LLM 接口**

oMLX 不是用 VLM 管线跑所有请求，而是用 `VLMModelAdapter` 包装 VLM 的 `language_model` 部分，向生成引擎暴露标准 LLM 接口。三种前向路径：

- **纯文本请求**：仅调用 `language_model`，跳过视觉编码器
- **有图片请求**：先运行视觉编码器生成 `inputs_embeds`，再传给 `language_model`
- **批量 VLM**：左填充的 embeddings batch 与 token padding 对齐

**③ 混合缓存类型处理**

Qwen3.5 的 24 层 DeltaNet 用 ArraysCache（不可切片），8 层标准注意力用 KVCache（可切片）。oMLX 的 `BoundarySnapshotBatchGenerator` 在预填充每个块边界（256 token）对 ArraysCache 做快照保存到 SSD，避免 O(n²) 内存增长。

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

### 10.3 Klee 可借鉴的优化方案

基于 oMLX 的思路，结合 Klee 作为 Swift 原生应用的特点，提出以下优化方案：

#### 方案 A：双模型通道（短期，立即可做）

**核心思想**：纯文本推理走 LLMModelFactory，多模态推理走 VLMModelFactory，不用 VLM 管线跑纯文本。

```swift
// LLMService.swift - 双通道加载策略
func loadModel(id: String, forceVLM: Bool = false) async {
    let modelInfo = findModelInfo(id)

    if modelInfo.supportsVision && forceVLM {
        // 多模态模式：通过 VLMModelFactory 加载完整 VLM
        container = try await VLMModelFactory.shared.loadContainer(...)
    } else {
        // 纯文本模式：尝试 LLMModelFactory（更快，更少内存）
        // 对于 Qwen3.5 纯文本变体（如 nightmedia/Qwen3.5-*-Text-*）
        container = try await LLMModelFactory.shared.loadContainer(...)
    }
}
```

**配套**：推荐模型列表增加纯文本变体：

```swift
// Qwen3.5 纯文本变体（去除视觉编码器，用 MLXLLM 加载）
ModelInfo(
    id: "mlx-community/Qwen3.5-9B-Text-4bit",  // 待社区发布
    name: "Qwen 3.5 9B (Text)",
    size: "~5 GB",
    minRAM: 16,
    supportsVision: false  // 走 LLM 通道
),
// Qwen3.5 多模态变体（保留）
ModelInfo(
    id: "mlx-community/Qwen3.5-9B-4bit",
    name: "Qwen 3.5 9B (Vision)",
    size: "~6 GB",
    minRAM: 16,
    supportsVision: true   // 走 VLM 通道
),
```

**预期收益**：纯文本场景恢复到接近 Qwen3-8B 的速度，节省 ~1GB 内存。

#### 方案 B：VLM Adapter 模式（中期，参考 oMLX 和 LM Studio）

参考 oMLX 的 `VLMModelAdapter` 和 LM Studio 的 `VisionAddOns` 方案，将视觉编码器作为懒加载模块：

```swift
/// VLM adapter: wraps VLM's language_model with a standard LLM interface
class VLMAdapter {
    private let vlmContainer: ModelContainer
    private var visionEncoderLoaded = false

    /// Text-only inference: bypass vision encoder entirely
    func generateText(input: LMInput) async -> AsyncStream<GenerationChunk> {
        // Route directly to language_model, skip vision tower
        ...
    }

    /// Multimodal inference: run vision encoder + language model
    func generateWithImages(input: LMInput, images: [UserInput.Image]) async -> AsyncStream<GenerationChunk> {
        // 1. Run vision encoder on images → pixel embeddings
        // 2. Merge with text embeddings
        // 3. Run language model
        ...
    }
}
```

**关键点**：当前 mlx-swift-lm 的 VLMModelFactory 会无条件加载视觉编码器权重。真正的优化需要：
1. 上游 mlx-swift-lm 支持 lazy loading vision tower
2. 或者 fork mlx-swift-lm，在 Qwen35.swift 中将 `visionModel` 改为 optional / lazy init

**预期收益**：单一模型文件同时服务纯文本和多模态请求，纯文本时零视觉开销。

#### 方案 C：SSD KV 缓存（中长期，收益最大）

Klee 作为 Agent 平台，对话上下文中大量前缀是重复的（系统提示 + Skill 描述 + 工具定义）。借鉴 oMLX 的三级 KV 缓存设计：

```
┌─────────────────────────────────────────────────┐
│  KV Cache 三级缓存 (Swift 实现)                    │
│                                                   │
│  L1: GPU Metal Buffer (活跃推理)                   │
│      - 当前请求的 KV cache blocks                   │
│      - Copy-on-Write 前缀共享                      │
│                                                   │
│  L2: RAM (热缓存)                                  │
│      - 最近使用的 blocks                           │
│      - LRU 驱逐到 L3                              │
│                                                   │
│  L3: SSD (冷缓存，~/Library/Caches/kv-cache/)      │
│      - safetensors 格式持久化                      │
│      - 链式哈希索引：SHA-256(parent + tokens + model)│
│      - 跨会话 / 跨重启恢复                         │
│      - 后台异步写入 (DispatchQueue)                 │
└─────────────────────────────────────────────────┘
```

**Klee 特有场景的收益分析**：

| 场景 | 无 KV 缓存 | 有 SSD KV 缓存 | 加速比 |
|------|-----------|---------------|--------|
| 新对话（相同模块配置） | 全量 prefill 系统提示 + Skill 描述 (~1,300 tokens) | 从 SSD 恢复前缀 | **~10x TTFT** |
| 同一对话续聊 | 每轮重新 prefill 全部历史 | 仅增量 prefill 新消息 | **~5-20x TTFT** |
| 切换模型后切回 | 完全重算 | 从 SSD 恢复完整 KV 状态 | **极大** |
| Agent 工具调用循环 | 每次工具返回后重新 prefill | 前缀命中，仅处理工具输出 | **~3-5x TTFT** |

**实现路径**：

```swift
/// Block-level KV cache with SSD persistence
struct KVCacheBlock: Identifiable {
    let id: UUID
    let blockHash: Data          // SHA-256(parentHash + tokenIds + modelId)
    let tokenIds: [Int]          // tokens in this block (256 per block)
    let layerData: [String: MLXArray]  // per-layer KV tensors
    var refCount: Int            // Copy-on-Write reference counting
}

protocol TieredKVCacheManager {
    /// Look up cached blocks by prefix hash chain
    func findCachedPrefix(tokens: [Int], modelId: String) -> (blocks: [KVCacheBlock], matchedLength: Int)

    /// Persist blocks to SSD asynchronously
    func persistToSSD(blocks: [KVCacheBlock]) async

    /// Restore blocks from SSD cache
    func restoreFromSSD(blockHash: Data) async -> KVCacheBlock?
}
```

**注意**：此方案需要深入修改 mlx-swift-lm 的 generate 管线，与 `ModelContainer.prepare()` / `ModelContainer.generate()` 的交互需要仔细设计。建议 fork mlx-swift-lm 实现。

#### 方案 D：Gated DeltaNet 专项修复（短期，需确认依赖版本）

检查当前 Klee 使用的 mlx-swift-lm 版本是否包含以下关键 PR：

| PR | 内容 | 状态 |
|----|------|------|
| **#120** | Qwen3.5 模型支持 | 需确认 |
| **#129** | Gated DeltaNet Metal kernel 性能优化 | **必须包含** |
| **#124 讨论** | evalLock 串行化瓶颈 | 待上游修复 |

```swift
// Package.swift - 确保依赖指向包含优化的版本
dependencies: [
    .package(
        url: "https://github.com/ml-explore/mlx-swift-lm",
        from: "x.y.z"  // 必须 >= 包含 PR #129 的版本
    ),
]
```

同时参考 oMLX 的 `cache.advance()` 修复，检查 Swift 端是否有同样的问题。

### 10.4 实施路线

```
Phase 0: 依赖升级 + 诊断（1-2 天）                    ← 立即
├── 升级 mlx-swift-lm 到包含 PR #129 的最新版本
├── 添加 tok/s 诊断日志（prefill vs decode 分别计时）
├── 确认 Gated DeltaNet Metal kernel 是否生效
└── 对比升级前后的 tok/s 数据

Phase 1: 双模型通道（1 周）                           ← 短期
├── LLMService 支持 LLM/VLM 双通道加载
├── RecommendedModels 增加纯文本变体
├── UI 上区分 "Text" / "Vision" 模式
└── 用户可选择：纯文本高速 vs 多模态

Phase 2: VLM Adapter 模式（2-3 周）                   ← 中期
├── Fork mlx-swift-lm，修改 Qwen35.swift
├── 视觉编码器改为 lazy init
├── 实现 VLMAdapter（统一接口，按需路由）
└── 纯文本请求跳过视觉编码器

Phase 3: SSD KV 缓存（4-6 周）                       ← 中长期，收益最大
├── 实现 KVCacheBlock 数据结构
├── 实现链式哈希前缀匹配
├── 实现 SSD 持久化层（safetensors 格式）
├── 集成到 LLMService 的 generate 管线
├── 实现 Copy-on-Write + LRU 驱逐
└── Agent 工具调用场景端到端测试

Phase 4: 贡献上游（持续）
├── 将 VLM adapter / lazy vision loader 提交给 mlx-swift-lm
├── 将 KV cache 方案提交给 mlx-swift-examples
└── 在 GitHub Issues 中推动 evalLock 优化
```

### 10.5 替代方案：直接集成 oMLX 作为推理后端

如果自行优化 MLX Swift 推理引擎的工作量过大，可以考虑**让 Klee 通过 OpenAI 兼容 API 调用 oMLX 服务**，而非 in-process 推理：

```
┌─────────────┐     HTTP API      ┌──────────────┐
│  Klee App   │ ──────────────▶   │  oMLX Server │
│  (SwiftUI)  │   localhost:8000  │  (Python/MLX) │
│             │ ◀──────────────   │  + SSD Cache  │
└─────────────┘    SSE Stream     └──────────────┘
```

**优点**：
- 立即获得 oMLX 的所有优化（SSD KV 缓存、连续批处理、Qwen3.5 专项修复）
- 零 Swift 推理引擎开发工作量
- oMLX 社区持续维护和优化

**缺点**：
- 用户需额外安装 oMLX（`brew install omlx` 或下载 .dmg）
- 增加架构复杂度（进程间通信 vs in-process）
- 失去"开箱即用、零依赖"的产品优势

**建议**：短期可作为高级用户的可选后端（Settings → Inference Backend: MLX Built-in / oMLX Server），长期仍以内置推理为主。

### 10.6 小结

| 方案 | 投入 | 收益 | 优先级 |
|------|------|------|--------|
| **D: 依赖升级 + DeltaNet 修复** | 1-2 天 | 可能有显著提升 | **P0** |
| **A: 双模型通道** | 1 周 | 纯文本恢复到 Qwen3 速度 | **P0** |
| **B: VLM Adapter** | 2-3 周 | 单模型兼顾文本和视觉 | P1 |
| **C: SSD KV 缓存** | 4-6 周 | Agent 场景 TTFT 降低 5-20x | P1 |
| **oMLX 后端集成** | 3-5 天 | 高级用户立即可用 | P2 |

**核心原则：先确保纯文本推理恢复到可用状态（方案 D + A），再逐步引入高级优化（方案 B + C）。**

---

*本文档供内部技术讨论使用，欢迎补充和质疑。*
