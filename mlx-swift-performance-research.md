# mlx-swift-lm 性能问题调研报告

> 调研日期：2026-03-19
> 调研人：萧何
> 目的：评估 mlx-swift-lm 与 Python mlx-lm 的性能差距是否为已知问题、社区态度、以及 fork 策略建议

---

## 1. 问题概述

### Klee 实测数据
- **Qwen3.5-9B-4bit on M4 Pro**: Swift 16.3-19.9 tok/s vs Python ~55 tok/s，差距 2.8-3.4x

### 社区报告的性能差距

| 报告者 | 模型 | Swift | Python | 差距 | 硬件 | 来源 |
|--------|------|-------|--------|------|------|------|
| @neilmehta24 | Phi-3-mini-4k-4bit | 60 tok/s | 101 tok/s | 1.7x | 未明确 | [mlx-swift-examples#93](https://github.com/ml-explore/mlx-swift-examples/issues/93) |
| @dirvine | Qwen3.5-35B-A3B (MoE) | 11.7 tok/s | 85 tok/s | **7.3x** | M4 Max 96GB | [mlx-swift-lm#124](https://github.com/ml-explore/mlx-swift-lm/issues/124) |
| @dirvine | Qwen3-8B (Dense) | 52.8 tok/s | 70.2 tok/s | 1.33x | M4 Max 96GB | 同上 |
| @jimmycmlo | Qwen3-VL-4B-4bit | ~10 tok/s | 181 tok/s | **18x** | M4 Pro | [mlx-swift-lm#19](https://github.com/ml-explore/mlx-swift-lm/issues/19) |
| @robertmsale | Qwen3-Next-80B | 0.45 tok/s (Naive) / 47.8 tok/s (BPE) | ~40 tok/s | 93x / 0.84x | M1 Ultra 128GB | 同上 |
| @eduardosanzb | Qwen3-VL-4B-4bit | ~7-8s/frame | ~1.2s/frame | **6-7x** | M4 Max 128GB | 同上 |
| @scouzi1966 | GPT-OSS-120B | Swift << Python | — | 2-3x | M3 Ultra 512GB | 同上 |

**关键发现**：差距幅度因模型和根因不同而差异巨大 —— 从 Dense 模型的 1.3x 到 MoE 模型的 7.3x，缺失 Detokenizer 时甚至达 93x。

---

## 2. 已识别的根因分类

### 2.1 已修复的问题

| 根因 | 影响 | 修复 | 状态 |
|------|------|------|------|
| **NaiveStreamingDetokenizer O(n^2)** | 某些模型慢 10-100x | BPE/SPM detokenizer 移植 | [PR#66](https://github.com/ml-explore/mlx-swift-lm/pull/66) 关闭（部分合并到其他 PR），@robertmsale 贡献 |
| **Phi-3 JIT 启动 + detokenizer** | 首轮 1.7x 差距 | KVCache + async eval + NaiveStreamingDetokenizer | [mlx-swift-examples#109](https://github.com/ml-explore/mlx-swift-examples/pull/109)，2024-08 已合并 |
| **Qwen3.5 模型实现差异** | 类型上转换导致性能下降 | 修正 float 类型 | [PR#120](https://github.com/ml-explore/mlx-swift-lm/pull/120) + [PR#129](https://github.com/ml-explore/mlx-swift-lm/pull/129)，已合并 |
| **Wired Memory 未预分配** | 5-15% 差距，MoE 更严重 | WiredMemoryPolicy API | [PR#72](https://github.com/ml-explore/mlx-swift-lm/pull/72)，已合并 |
| **Model Loading** 性能 | 加载慢 | 优化加载路径 | [PR#34](https://github.com/ml-explore/mlx-swift-lm/pull/34)，已合并 |

### 2.2 当前已知但未修复的问题

| 根因 | 影响 | PR/Issue | 状态 |
|------|------|----------|------|
| **CPU<-GPU sync in penalty processors** | 启用 repetition/presence penalty 时 +35-65% | [PR#147](https://github.com/ml-explore/mlx-swift-lm/pull/147) | **OPEN**，未合并，无审查 |
| **MoE 模型特有的性能差距** | MoE 7.3x vs Dense 1.3x | [Issue#124](https://github.com/ml-explore/mlx-swift-lm/issues/124) | **OPEN**，维护者质疑分析但承认需调查 |
| **KV Cache COW 问题** | maybeQuantizeKVCache 导致 copy-on-write | [Issue#81](https://github.com/ml-explore/mlx-swift-lm/issues/81) | **OPEN** |
| **VLM 缺失 BPE detokenizer** | Qwen-VL 系列慢 10-100x | Issue#19 讨论中 | **OPEN**，@robertmsale 有 fork 但未正式合并 |

### 2.3 Klee 分析的结构性问题（未被上游讨论）

| 根因 | 估计影响 | 上游状态 |
|------|---------|---------|
| AsyncStream + Task 切换开销 | ~20-30% | **无人讨论** |
| SerialAccessContainer / AsyncMutex 锁开销 | ~10-15% | **无人讨论** |
| VLM mRoPE 文本路径冗余计算 | ~3-8% | **无人讨论** |

---

## 3. 维护者态度分析

### @davidkoski（主维护者，67 commits，Apple ML Research）

**态度：务实但保守，不认同外部的激进分析。**

关键立场（摘自 [Issue#124](https://github.com/ml-explore/mlx-swift-lm/issues/124) 的原话）：

> "I don't think most of the analysis is correct though. If this is all from an LLM then it is not helping."

> "The evalLock is required because mlx core is not thread safe. [...] There is very little lock contention in 'single stream' token generation."

> "That is not what this does. The GPU -> CPU sync happens with eval() or item(). This is doing asynchronous generation of tokens and passing the tokens back to another task. Compared to generating a token this is essentially free."

**他的真实怀疑（按可能性排序）**：
1. 模型实现差异（Python 和 Swift 之间的端口差异）
2. generate loop 中某些优化 Swift 尚未实现
3. 可能是 batch generation 差异
4. "something else (covers a lot!)"

**对修复的态度**：
- 愿意合并社区贡献的性能优化（已合并 PR#51, PR#72, PR#120, PR#129）
- 要求用 Instruments 做实际测量，而非代码审查推断
- 对 Wired Memory 持谨慎态度："I am not sure if the default should be on or off. For swift it might be linked into an iOS app and should not behave the same way."
- 提醒注意 Debug mode / Metal shader validator 的开销影响

### @awni（MLX 核心维护者）

在 [mlx-swift-examples#93](https://github.com/ml-explore/mlx-swift-examples/issues/93)（2024 年 7 月）中提出过具体建议：
- 实现 naive detokenizer + line break history chopping
- prompt splitting 优化
- rotating buffer for cache

后续未再参与 Swift 性能讨论，重心在 Python mlx-lm 和 MLX 核心。

### Apple 官方态度（WWDC25）

WWDC25 Session 298 "Explore large language models on Apple silicon with MLX" 中：
- **完全未提及 Swift vs Python 性能差距**
- 强调 "same workflow, same capabilities, but now fully native in Swift"
- 重点在功能等价性和开发体验，而非原始性能
- Apple 投入重心在 M5 Neural Accelerator（4x TTFT 提升），是硬件层面优化

**结论**：Apple 官方不认为（或不愿公开承认）Swift 端有性能问题。WWDC 的叙事是 "Swift == Python"，但社区实测数据反驳了这一点。

---

## 4. 社区生态与第三方方案

### 活跃贡献者

| 贡献者 | 角色 | 主要贡献 |
|--------|------|---------|
| @robertmsale | 社区 | BPE detokenizer, WiredMemoryPolicy, forProductionInference |
| @ronaldmannak | 社区 (PicoMLX) | GPT-OSS 优化, Qwen 同步 Python 实现, Continuous Batching [PR#150](https://github.com/ml-explore/mlx-swift-lm/pull/150) |
| @johnmai-dev | 社区 | Qwen3.5 支持 + 性能优化 [PR#120](https://github.com/ml-explore/mlx-swift-lm/pull/120) + [PR#129](https://github.com/ml-explore/mlx-swift-lm/pull/129) |
| @spokvulcan | 社区 | GPU-only penalty processors [PR#147](https://github.com/ml-explore/mlx-swift-lm/pull/147) |
| @DePasqualeOrg | 社区 | 模型加载优化, tokenizer 解耦 |
| @m13v | 用户 (fazm) | per-token sync 经验分享 |
| @scouzi1966 | 用户 (maclocal-api) | 自行封装优化的 MLX LLM 服务层 |

### 第三方 Fork / Wrapper

| 项目 | 作者 | 特点 |
|------|------|------|
| [robertmsale/mlx-swift-lm](https://github.com/robertmsale/mlx-swift-lm) (qwen3-next branch) | @robertmsale | BPE detokenizer, forProductionInference, wired memory |
| [scouzi1966/maclocal-api](https://github.com/scouzi1966/maclocal-api) | @scouzi1966 | Swift MLX wrapper，"tweaked performance to be closer to Python" |
| [m13v/fazm](https://github.com/m13v/fazm) | @m13v | macOS app，ChatProvider 封装，有 per-token batching 优化 |
| [lmstudio-ai/mlx-engine](https://github.com/lmstudio-ai/mlx-engine) | LM Studio | Python 封装，但展示了 MLX 的最佳实践 |

### 社区 Workarounds 汇总

1. **Release build + 关闭 debugger**：减少几个百分点开销
2. **Wired Memory 预分配**：`Memory.withWiredLimit(maxRecommendedWorkingSetSize)` — MoE 模型可能有显著效果
3. **MLX_METAL_PREALLOCATE=1**：预分配 Metal buffer pool
4. **正确的 Detokenizer**：BPE 模型必须使用 BPEStreamingDetokenizer（差距可达 100x）
5. **forProductionInference**：CPU load -> GPU move -> train(false)，确保 kernel 优化
6. **Cmlx -O3**：在 Package.swift 中添加 `.unsafeOptions(["-O3"])`

---

## 5. 上游修复时间线预估

### 短期内可能合并的（1-3 个月）

| PR | 内容 | 影响 | 可能性 |
|----|------|------|--------|
| [PR#147](https://github.com/ml-explore/mlx-swift-lm/pull/147) | GPU-only penalty processors | +35% (使用 penalty 时) | 中 — 代码质量好但无审查 |
| [PR#150](https://github.com/ml-explore/mlx-swift-lm/pull/150) | Continuous Batching | 服务端场景 | 低 — Draft 状态，96 commits |

### 中期可能改善的（3-6 个月）

- **模型实现差异修复**：@davidkoski 认为这是最可能的根因，随着新模型的端口会逐步修正
- **更好的 Detokenizer**：社区有成熟实现，合并只是时间问题

### 不太可能改变的

- **AsyncStream 架构**：这是 mlx-swift-lm 的设计选择，不太可能因性能原因重写
- **SerialAccessContainer / AsyncMutex**：必须保持线程安全，维护者明确表示这是必要的
- **默认 Wired Memory 策略**：维护者担心 iOS 兼容性，不会默认开启

### 无路线图的领域

- **没有官方 performance roadmap**：[Discussion#301](https://github.com/ml-explore/mlx/discussions/301) 问过，无团队回复
- **没有 benchmarking suite**：无 CI 中的性能回归检测
- **@awni 不再参与 Swift 端**：2024 年后未见性能相关的参与

---

## 6. 结论与建议

### 6.1 性能差距是已知问题吗？

**是的，但程度被低估。** 社区从 2024 年 7 月就开始报告（Issue#93），部分问题已修复（detokenizer, model 实现差异），但 Dense 模型仍有 ~1.3x 差距，MoE 模型更严重。维护者承认差距存在，但不完全认同社区对根因的分析。

### 6.2 上游会修复吗？

**部分会，但不会彻底解决。** 维护者愿意合并社区贡献的模型端口修复和 API 改进，但不会重构 AsyncStream 架构或 AsyncMutex 设计。Apple 官方（WWDC）的态度是 "Swift == Python"，不太可能投入大量资源专门优化 Swift 端的 token generation 速度。

### 6.3 Fork 策略建议

**推荐策略：轻量级 fork + 有选择地向上游提 PR。**

理由：

**Fork 的收益**：
- 可以绕过 AsyncStream 开销（估计 +20-30%）
- 可以添加 mRoPE fast-path（估计 +3-8%）
- 可以默认开启 Wired Memory（Klee 是唯一应用，不用考虑 iOS）
- 可以加入 PR#147 的 GPU-only penalty 优化（等不到合并）
- 综合预期提升：**30-50%**

**Fork 的风险**：
- 上游新模型支持需要手动 merge（mlx-swift-lm 活跃度高，2026 年已发布 6+ 个版本）
- 上游 API 变化可能导致冲突（但 Klee 只用 ModelContainer + generate 接口，面窄）
- 维护负担（但 Klee 只需要 LLM + VLM 生成功能，不需要 embeddings 等）

**具体实施建议**：

1. **Phase 1**（低风险，立即可做）：Klee 层优化，不 fork
   - 已完成：Metal warmup, GenerateParameters, Memory.cacheLimit
   - 待做：Wired Memory 预分配（使用上游已有 API）

2. **Phase 2**（中风险，1-2 周）：Fork + 精准优化
   - Fork `ml-explore/mlx-swift-lm`，创建 `klee` 分支
   - 添加同步 generate 路径（绕过 AsyncStream）
   - Cherry-pick PR#147（GPU-only penalties）
   - mRoPE fast-path（text-only 时跳过复杂 position 计算）

3. **Phase 3**（可选）：向上游提 PR
   - 将 PR#147 的方向扩展为更全面的 GPU-resident pipeline
   - 如果效果显著，向上游提 PR（但要做好被拒绝的准备，因为维护者不认为 AsyncStream 是瓶颈）

**不建议等待上游**：因为没有性能路线图，维护者重心在功能（新模型支持、tool calling）而非性能，且 AsyncStream 架构是设计决策不会改变。

---

## 7. 附录：关键链接

### GitHub Issues
- [mlx-swift-examples#93](https://github.com/ml-explore/mlx-swift-examples/issues/93) — Swift vs Python 性能差距的首次报告（2024-07，已关闭）
- [mlx-swift-lm#124](https://github.com/ml-explore/mlx-swift-lm/issues/124) — MoE 7.3x 差距 + evalLock 讨论（2026-02，OPEN）
- [mlx-swift-lm#19](https://github.com/ml-explore/mlx-swift-lm/issues/19) — Qwen3VL 慢速 + detokenizer 发现（2025-12，OPEN）
- [mlx-swift-lm#81](https://github.com/ml-explore/mlx-swift-lm/issues/81) — KV Cache COW 问题（OPEN）

### GitHub PRs（性能相关）
- [PR#147](https://github.com/ml-explore/mlx-swift-lm/pull/147) — GPU-only penalties（OPEN，+35% 提升）
- [PR#150](https://github.com/ml-explore/mlx-swift-lm/pull/150) — Continuous Batching（Draft）
- [PR#129](https://github.com/ml-explore/mlx-swift-lm/pull/129) — Qwen3.5 性能优化（已合并）
- [PR#120](https://github.com/ml-explore/mlx-swift-lm/pull/120) — Qwen3.5 MoE 支持（已合并）
- [PR#72](https://github.com/ml-explore/mlx-swift-lm/pull/72) — Wired Memory 控制（已合并）
- [PR#66](https://github.com/ml-explore/mlx-swift-lm/pull/66) — BPE detokenizer + forProductionInference（已关闭，部分功能合并）
- [PR#51](https://github.com/ml-explore/mlx-swift-lm/pull/51) — GPT-OSS 性能优化（已合并）
- [PR#34](https://github.com/ml-explore/mlx-swift-lm/pull/34) — 模型加载优化（已合并）

### Apple 官方
- [WWDC25 Session 298](https://developer.apple.com/videos/play/wwdc2025/298/) — Explore LLMs on Apple Silicon with MLX
- [Apple ML Research: M5 Neural Accelerators](https://machinelearning.apple.com/research/exploring-llms-mlx-m5) — 4x TTFT 提升
- [MLX Discussion#301](https://github.com/ml-explore/mlx/discussions/301) — MLX Roadmap?（无官方回复）

### 第三方参考
- [robertmsale/mlx-swift-lm](https://github.com/robertmsale/mlx-swift-lm) — BPE detokenizer fork
- [scouzi1966/maclocal-api](https://github.com/scouzi1966/maclocal-api) — 优化封装
- [m13v/fazm](https://github.com/m13v/fazm) — macOS app，per-token batching
- [lmstudio-ai/mlx-engine#101](https://github.com/lmstudio-ai/mlx-engine/issues/101) — MLX 大模型性能问题

### 仓库统计（截至 2026-03-19）
- mlx-swift-lm: 300 stars, 94 forks, 40 open issues
- 主维护者: @davidkoski (67 commits)
- 最近更新: 2026-03-12
