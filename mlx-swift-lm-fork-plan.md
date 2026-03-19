# mlx-swift-lm Fork Plan

## Performance Gap Analysis

**Klee (mlx-swift-lm)**: 16.3 tok/s decode on Qwen3.5-9B-4bit (M4 Pro)
**Python mlx-lm**: ~55 tok/s on same model/hardware
**Gap**: 3.4x slower

## Root Cause Analysis: Where Does the 3.4x Gap Come From?

After systematic comparison of oMLX/mlx-lm (Python) vs mlx-swift-lm (Swift), the decode
speed gap is likely NOT a single root cause but a combination of:

### 1. AsyncStream Overhead per Token (Estimated: ~20-30% impact)
**Category**: B (fork) or C (upstream PR)

mlx-swift-lm wraps generation in a Task + AsyncStream (generateLoopTask). Each token:
- Goes through `TokenIterator.next()` -> synchronous `step()` -> `asyncEval()`
- Gets yielded through AsyncStream continuation
- Gets consumed by LLMService in another async loop
- Gets dispatched to MainActor for UI update

In contrast, Python mlx-lm's generate_step is a tight synchronous loop. oMLX's scheduler
runs `BatchGenerator.step()` on a single ThreadPoolExecutor thread, also avoiding async
overhead per token.

**Evidence**: The TokenIterator itself uses `asyncEval()` correctly for pipelining, but the
AsyncStream wrapper adds Task switching overhead. The `for token in iterator` loop in
`generateLoopTask` is synchronous and efficient, but the surrounding Task + continuation.yield
adds latency per token.

**Fork Action**: Investigate if `container.perform` + synchronous TokenIterator loop with
periodic `await Task.yield()` is faster than current AsyncStream approach.

### 2. SerialAccessContainer / AsyncMutex Lock Acquisition (Estimated: ~10-15% impact)
**Category**: B (fork)

Every `container.generate()` call goes through:
```
ModelContainer.generate() -> context.read {} -> AsyncMutex.withLock {}
```
The AsyncMutex acquires a lock for the ENTIRE prefill phase, then the generate function
returns an AsyncStream while still holding the lock (only released after prefill completes,
per the code comment).

For single-user Klee, this lock is uncontested but still has overhead from:
- Actor hop to AsyncMutex
- CheckedContinuation allocation when contested
- Potential task scheduling delays

**Fork Action**: For single-model single-user scenarios, provide a `performUnsafe` path
that bypasses the AsyncMutex entirely.

### 3. Sampling Strategy Overhead (Estimated: ~5-10% impact)
**Category**: A (Klee layer - FIXED)

Klee uses `temperature: 0.7` which triggers `CategoricalSampler`. This does:
```swift
categorical(logits * (1 / temp))
```

If temperature were 0.0, `ArgMaxSampler` would be used:
```swift
argMax(logits, axis: -1)
```

ArgMax is a single GPU op, while categorical requires random number generation + multinomial
sampling. For quality text generation 0.6-0.7 temperature is typical and should be kept.

**Klee Action**: Default to temperature 0.6 (mlx-swift-lm default) with topP 0.9 as
reasonable defaults. The real optimization here is NOT changing sampler, but ensuring
no unnecessary LogitProcessors are created (repetitionPenalty=nil by default is correct).

### 4. prefillStepSize Default (Estimated: ~5% impact on TTFT, indirect decode impact)
**Category**: A (Klee layer - FIXED)

mlx-swift-lm defaults to `prefillStepSize: 512`. Large prompts are processed in 512-token
chunks during prefill. oMLX's scheduler uses `prefill_step_size = 512` as well, but has
optimized boundary handling.

For Klee's typical chat prompts (< 512 tokens), this is already single-pass.

**Klee Action**: Keep 512 as default. For very long context, consider 1024.

### 5. KV Cache Quantization (Estimated: ~15-20% impact for long context)
**Category**: A (Klee layer - PARTIALLY IMPLEMENTABLE)

mlx-swift-lm supports KV cache quantization via `kvBits` and `kvGroupSize` parameters.
With `kvBits: 4` or `kvBits: 8`, the KV cache is quantized after each step via
`maybeQuantizeKVCache()`. This reduces memory pressure and can improve decode speed
for long contexts by reducing memory bandwidth requirements.

oMLX does NOT use KV cache quantization (relies on SSD paged cache instead).
Python mlx-lm supports it via `--kv-bits` flag.

**Klee Action**: Expose kvBits/kvGroupSize in GenerateParameters. For 9B models on
M4 Pro (24GB), 4-bit KV cache is aggressive but safe. Start with `kvBits: 8` for
negligible quality loss with meaningful memory bandwidth reduction.

### 6. Metal Pipeline Warmup (Estimated: ~5-10% impact on first generation)
**Category**: A (Klee layer - IMPLEMENTABLE)

oMLX doesn't explicitly warm up Metal pipelines, but its engine_core stays hot between
requests because the BatchGenerator and Metal stream persist. Klee creates a fresh
TokenIterator for each generation, which means Metal shader compilation / pipeline state
creation happens lazily.

**Klee Action**: After model load, run a single 2-token warmup generation to prime the
Metal pipeline (shader compilation, memory allocator warm-up).

### 7. Wired Memory Policy (Estimated: ~5-15% impact)
**Category**: A (Klee layer - IMPLEMENTABLE)

mlx-swift-lm has a sophisticated wired memory system (WiredMemoryTicket, WiredSumPolicy,
WiredBudgetPolicy). When a wired memory ticket is provided, `withWiredLimit` pins GPU
memory pages, preventing the OS from swapping them out. This can significantly improve
decode speed on memory-constrained systems.

**Klee Action**: After model load, measure memory with `WiredMemoryUtils.tune()` and
create a `WiredBudgetPolicy` ticket for all subsequent generations.

### 8. GatedDeltaNet advance() Bug (NOT applicable to Swift)
**Category**: D (not applicable)

oMLX patches `GatedDeltaNet.__call__` in Python mlx-lm to add `cache.advance(S)`.
The Swift port in Qwen35.swift needs to be checked separately, but this is a correctness
bug for batch_size > 1 with different prompt lengths. Klee uses batch_size = 1, so this
is NOT a performance issue for us.

**Fork Action**: Verify Qwen35.swift has correct advance() calls. If missing, it's a
correctness issue for future batch support but not a current perf bottleneck.

### 9. Continuous Batching / BatchGenerator (NOT applicable)
**Category**: D (server-only feature)

oMLX uses mlx-lm's `BatchGenerator` for continuous batching of multiple concurrent
requests. This is a server optimization that doesn't apply to Klee (single-user app).

### 10. SSD KV Cache / Prefix Cache (NOT applicable to Klee)
**Category**: D (server-only feature)

oMLX's paged SSD cache, prefix cache, and block-aware prefix cache are server
optimizations for handling many sequential requests with shared prompt prefixes.
Not relevant for a single-user chat app.

---

## Fork Priority Ranking

### Priority 1: AsyncStream Overhead Investigation
**Files to modify**:
- `Libraries/MLXLMCommon/Evaluate.swift` — generateLoopTask function
- `Libraries/MLXLMCommon/ModelContainer.swift` — generate method

**Approach**: Add a synchronous `generateSync()` path in ModelContainer that:
1. Acquires the lock once
2. Creates TokenIterator
3. Runs a tight `while let token = iterator.next()` loop
4. Calls a callback per token (not AsyncStream)
5. Releases lock

**Expected impact**: 15-25% decode speed improvement
**Risk**: Low — additive API, doesn't change existing behavior

### Priority 2: Single-User Lock Bypass
**Files to modify**:
- `Libraries/MLXLMCommon/Utilities/SerialAccessContainer.swift`
- `Libraries/MLXLMCommon/ModelContainer.swift`

**Approach**: Add `performDirect()` that accesses value without AsyncMutex when
the caller guarantees single-threaded access (which Klee does — all generation
is serialized through LLMService).

**Expected impact**: 5-10% decode speed improvement
**Risk**: Medium — misuse could cause data races. Must be documented as unsafe.

### Priority 3: KV Cache Quantization Tuning
**Files to modify**: None (already supported in GenerateParameters)

This is actually a Category A optimization — we just need to pass the right
parameters. See Klee-layer optimizations below.

---

## Klee-Layer Optimizations (No Fork Needed)

These are implemented in LLMService.swift:

1. **Metal Pipeline Warmup** — 2-token warmup generation after model load
2. **GenerateParameters Tuning** — temperature 0.6, kvBits 8
3. **Wired Memory Policy** — measure and pin GPU memory via WiredBudgetPolicy
4. **Generation Info Extraction** — use mlx-swift-lm's built-in GenerateCompletionInfo
   instead of manual Date() timing for more accurate metrics

---

## Benchmark Plan

After each optimization, re-run with Qwen3.5-9B-4bit:
- Short prompt: "Hello" (baseline TTFT + decode)
- Medium prompt: ~200 tokens system prompt + question
- Long prompt: ~2000 tokens context + question

Measure: TTFT (ms), Decode speed (tok/s), Peak memory (MB)

---

## Timeline

1. **Klee-layer optimizations** (this PR): 1-2 days
2. **Fork + AsyncStream investigation**: 2-3 days
3. **Benchmarking**: 1 day
4. **Upstream PR if improvements confirmed**: 1 day

---

## Phase C: VLM Adapter Analysis (2026-03-18)

### 1. oMLX VLMModelAdapter Complete Analysis

oMLX's `VLMModelAdapter` (in `omlx/models/vlm.py`) is a `nn.Module` wrapper that
bridges a VLM model to mlx-lm's `BatchGenerator`. Here is a method-by-method
breakdown with Swift equivalents:

#### 1.1 `__init__(self, vlm_model)`
**Purpose**: Extracts `language_model` from the full VLM and stores reference to both.

```python
self._vlm_model = vlm_model
self._language_model = vlm_model.language_model
self._pending_embeds = None  # vision embeddings waiting for prefill
self._pending_kwargs = {}     # extra model kwargs (position_ids, etc.)
self._embed_offset = 0        # chunk offset for chunked prefill
```

**Swift equivalent**: In mlx-swift-lm's `Qwen35` (MLXVLM), the model already has:
```swift
@ModuleInfo(key: "language_model") fileprivate var languageModel: Qwen35Language.LanguageModel
```
This is `fileprivate` — not accessible from outside the Qwen35 module.

#### 1.2 `__call__(self, input_ids, cache, **kwargs)` — Three-Path Forward
**Purpose**: Dispatches between VLM prefill (with embeddings) and standard decode (token IDs only).

**Path 1 — Batched VLM** (`inputs_embeds` in kwargs): Forward to `language_model` with
pre-computed embeddings. Used by `_process_prompts()`.

**Path 2 — Legacy Single VLM** (`_pending_embeds` set): Slice embeddings for chunked
prefill via `_forward_with_embeddings()`.

**Path 3 — Standard Decode** (no embeddings): Direct token-ID-based call to `language_model`.
Includes `_set_position_state()` call for mRoPE models.

**Swift equivalent**: In mlx-swift-lm, this dispatch is handled entirely by the
`Qwen35.prepare()` and `Qwen35.callAsFunction()` methods:

- `prepare()` handles both image and text-only paths (see Section 2 below)
- `callAsFunction()` handles decode (token IDs only)

These are the `LanguageModel` protocol methods called by `TokenIterator`.

#### 1.3 `_IntOffsetCacheProxy`
**Purpose**: Wraps `BatchKVCache` to convert `mx.array` offsets to Python `int` for
mlx-vlm compatibility (mlx-vlm models use offset as slice index).

**Swift equivalent**: NOT NEEDED. mlx-swift-lm uses `KVCacheSimple`/`RotatingKVCache`/
`MambaCache`, which already expose `offset` as `Int`. No type mismatch exists.

#### 1.4 `clear_vlm_position_state()`
**Purpose**: Clears `_position_ids` and `_rope_deltas` on the language model before
text-only requests to prevent position contamination from prior VLM requests.

**Swift equivalent**: `Qwen35Language.LanguageModel.resetPositionState()`:
```swift
func resetPositionState() {
    precomputedPositionIds = nil
    ropeDeltas = nil
}
```
This is already called in `Qwen35.prepare()` (line 1149) when there are no pixel values:
```swift
} else {
    languageModel.resetPositionState()
}
```

#### 1.5 `set_pending_embeddings()` / `clear_pending_embeddings()`
**Purpose**: Registers pre-computed vision embeddings before `BatchGenerator.insert()` for
the server's batch processing pipeline.

**Swift equivalent**: NOT NEEDED. mlx-swift-lm processes VLM inputs synchronously in
`prepare()` — there is no batch scheduler that needs deferred embedding injection.
The vision encoder runs inline during `prepare()` and the merged embeddings are passed
directly to `languageModel()`.

#### 1.6 `get_input_embeddings()`
**Purpose**: Delegates to VLM model's vision encoder + embedding merge.

**Swift equivalent**: Handled directly in `Qwen35.prepare()`:
```swift
let textEmbeds = languageModel.model.embedTokens(inputIds)
let (visionHidden, _) = visionModel(pixelValues, gridTHW: frames)
let visionFeatures = visionHidden.asType(textEmbeds.dtype)
let (mergedEmbeds, _) = try mergeInputIdsWithImageFeatures(...)
```

#### 1.7 Properties: `layers`, `model_type`, `config`, `args`, `make_cache()`
**Purpose**: Expose language model internals for `BatchGenerator` cache creation.

**Swift equivalent**: Already exposed by `Qwen35` via `LanguageModel` protocol:
- `loraLayers` -> `languageModel.model.layers`
- `newCache()` -> `languageModel.makeCache()`
- `vocabularySize` -> `config.vocabSize`

### 2. mlx-swift-lm Pure Text Path Analysis: Does VLM Skip Vision Encoder?

**CONFIRMED: YES, the vision encoder IS already skipped for pure text input.**

Here is the exact code path in `MLXVLM/Models/Qwen35.swift`:

```swift
// Qwen35.prepare() — line 1104-1165
public func prepare(_ input: LMInput, cache: [any KVCache], windowSize _: Int?) throws -> PrepareResult {
    let inputIds = input.text.tokens

    var pixelValues: MLXArray?
    var imageFrames: [THW]?
    var videoFrames: [THW]?

    // Only extract pixels if LMInput.image or .video is non-nil
    if let image = input.image {
        pixelParts.append(image.pixels.asType(visionDType))
        imageFrames = image.frames
    }
    if let video = input.video {
        pixelParts.append(video.pixels.asType(visionDType))
        videoFrames = video.frames
    }

    if let pixelValues, let frames = combinedFrames(...).nilIfEmpty {
        // IMAGE PATH: run vision encoder, merge embeddings
        let textEmbeds = languageModel.model.embedTokens(inputIds)
        let (visionHidden, _) = visionModel(pixelValues, gridTHW: frames)
        // ... merge and compute
    } else {
        // TEXT-ONLY PATH: reset position state, skip vision entirely
        languageModel.resetPositionState()
    }

    // Both paths then call languageModel() for the actual forward pass
    let output = languageModel(inputIds, inputsEmbeds: inputEmbeddings, cache: typedCache, ...)
    return .logits(output)
}
```

And for decode steps, `callAsFunction()` (line 1167-1180) only passes token IDs:
```swift
public func callAsFunction(_ inputs: MLXArray, cache: [any KVCache]?) -> MLXArray {
    let result = languageModel(inputs, inputsEmbeds: nil, cache: typedCache,
        pixelValues: nil, imageGridTHW: nil, videoGridTHW: nil)
    return result.logits
}
```

**Conclusion**: When Klee sends text-only chat messages (no images), `LMInput.image` is
nil, so `pixelValues` is nil, and the code takes the `else` branch — vision encoder is
completely skipped. The decode path (`callAsFunction`) also passes nil for all vision
params. There is ZERO vision encoder overhead on pure text.

### 3. Why Is Klee Still 3.4x Slower Than Python?

Since the vision encoder is already bypassed for text, the 16.3 tok/s bottleneck is NOT
caused by unnecessary VLM overhead. The gap comes from the factors already identified in
the root cause analysis above (AsyncStream overhead, SerialAccessContainer locking, etc.).

**However, there is one VLM-specific overhead worth noting:**

The `LanguageModel.callAsFunction()` in `Qwen35Language.LanguageModel` (MLXVLM version,
line 914-1004) contains mRoPE position computation logic that runs on EVERY call:

```swift
func callAsFunction(_ inputs: MLXArray, ...) -> LMOutput {
    // Position ID computation — runs every decode step
    if positionIds == nil && (ropeMask == nil || ropeMask?.ndim == 2) {
        if (...) || ropeDeltas == nil || cache == nil {
            // Full position computation with getRopeIndex()
        } else {
            // Incremental position computation
            let delta = MLXArray(cacheOffset) + ropeDeltas
            // ... 20+ lines of MLXArray manipulation
        }
    }
    // Then the actual model forward pass
}
```

In contrast, the MLXLLM version (`Qwen35TextModel`) does NOT have this mRoPE overhead:
```swift
// MLXLLM/Models/Qwen35.swift — Qwen35TextModel.callAsFunction
public func callAsFunction(_ inputs: MLXArray, cache: [KVCache]?) -> MLXArray {
    model(inputs, cache: cache?.compactMap { $0 })
    // Direct call, no position ID computation
}
```

The MLXLLM `Qwen35TextModel.Model.callAsFunction` (line 531) uses standard positional
computation inside each layer's attention mechanism, not a pre-computation step.

**Impact estimate**: The mRoPE pre-computation in MLXVLM's `LanguageModel` creates
~10-20 extra `MLXArray` operations per decode step (broadcast, reshape, slice, add).
Each is a Metal kernel launch. On a 9B model generating at ~16 tok/s, this adds
~0.6-1.2ms per step — potentially 3-8% overhead compared to the MLXLLM path.

### 4. VLM Adapter Decision: NOT NEEDED at Klee Layer

**Final conclusion: A Klee-layer VLMAdapter wrapping ModelContainer is NOT needed.**

Reasons:
1. mlx-swift-lm's `Qwen35.prepare()` already handles the text-only path correctly
2. Vision encoder is fully skipped when no images are provided
3. Position state is properly reset between text-only and VLM requests
4. KV cache types work correctly without the `_IntOffsetCacheProxy` workaround
5. There is no batch scheduler requiring deferred embedding injection

oMLX's VLMModelAdapter exists because it needs to bridge mlx-vlm models to mlx-lm's
`BatchGenerator` — a server-specific concern. Klee uses `ModelContainer` which calls
`prepare()` and `callAsFunction()` directly via the `LanguageModel` protocol. The VLM
model already implements this protocol correctly.

### 5. The Real VLM-Related Optimization: Dual-Model Loading

The one optimization that WOULD help performance is loading the MLXLLM version
(`Qwen35Model`) for text-only use instead of the MLXVLM version (`Qwen35`). This
would eliminate:

- mRoPE position pre-computation per decode step
- `vision_tower` weight loading (saves ~600MB for Qwen3.5-9B)
- All VLM-specific code paths in the forward pass

**However, this is impractical for Klee** because:
- Klee needs to support both text and image input in the same session
- Switching models mid-conversation would lose the KV cache
- Loading two separate model containers doubles memory usage

**Feasible alternative**: If we fork mlx-swift-lm, we could add a fast-path in
`Qwen35Language.LanguageModel.callAsFunction()` that skips mRoPE pre-computation
when no vision tokens are present (detected by `precomputedPositionIds == nil` and
`ropeDeltas == nil` after `resetPositionState()`). This would make the MLXVLM's
text-only decode path as efficient as the MLXLLM version.

### 6. Fork Modification Details (If Pursued)

If we fork mlx-swift-lm to optimize the MLXVLM text-only path:

**File**: `Libraries/MLXVLM/Models/Qwen35.swift`
**Method**: `Qwen35Language.LanguageModel.callAsFunction()`
**Change**: After `resetPositionState()`, use simplified position computation for decode

```swift
// Current code (line 940-988): always computes mRoPE positions
var positionIds = providedPositionIds
if positionIds == nil && (ropeMask == nil || ropeMask?.ndim == 2) {
    // Complex mRoPE computation with getRopeIndex, ropeDeltas, etc.
}

// Proposed optimization: skip mRoPE for text-only decode
var positionIds = providedPositionIds
if positionIds == nil && (ropeMask == nil || ropeMask?.ndim == 2) {
    if precomputedPositionIds == nil && ropeDeltas == nil {
        // Text-only path: use simple sequential positions (no mRoPE needed)
        // This matches MLXLLM behavior where each layer computes its own RoPE
        let seqLength = inputs.dim(1)
        let batchSize = inputs.dim(0)
        var cacheOffset = 0
        if let cache, let faCache = cache[model.faIdx] {
            cacheOffset = faCache.offset
        }
        let base = MLXArray(cacheOffset ..< (cacheOffset + seqLength))
        positionIds = broadcast(
            base[.newAxis, .newAxis, 0...],
            to: [3, batchSize, seqLength]
        )
    } else {
        // VLM path: use existing mRoPE computation (unchanged)
        // ... existing code ...
    }
}
```

**Estimated impact**: 3-8% decode speed improvement for text-only VLM inference
**Risk**: Low — only affects text-only path, VLM image path unchanged

### 7. oMLX Patches Applicability to Swift

#### GatedDeltaNet `advance()` Patch
**oMLX applies**: Monkey-patches `GatedDeltaNet.__call__` to add `cache.advance(S)` after
each forward pass. This is a correctness fix for batch_size > 1 with different prompt lengths.

**Swift status**: Needs verification. The MLXVLM Qwen35 uses `MambaCache` for linear
layers but the `GatedDeltaNet` equivalent in Swift (`gatedDeltaOps`) processes all
timesteps in a Python-like loop. The cache advance may or may not be handled by the
`MambaCache` implementation.

**Action**: Not a performance concern for Klee (batch_size=1), but should be verified
for correctness if multi-request support is ever added.

#### IndexCache Patch
**oMLX applies**: For DeepSeek-V3.2 and GLM-MoE-DSA models only (not Qwen3.5).
**Swift status**: Not applicable to Qwen3.5.

### 8. enable_thinking Parameter and Its Impact

oMLX passes `enable_thinking` to the chat template's `apply_chat_template()` call.
For Qwen3.5, this controls whether `<think>` blocks are generated.

In Klee's current implementation, `enable_thinking` is not explicitly passed. The
Qwen3.5 chat template defaults to `enable_thinking=True` when the parameter is absent.
This means Klee already generates thinking tokens, which are then:
1. Stripped from the final display by `ThinkingBlockView`
2. Still consume decode time (generating `<think>...</think>` content)

**Performance impact of thinking**: Thinking tokens can be 2-10x the length of the
actual response. If the model generates 100 thinking tokens + 50 response tokens, the
user-visible decode speed appears much lower because they only see 50 tokens' worth of
output in the time it took to generate 150.

**Klee action**: This is NOT a model-layer concern. The chat template configuration
(enable_thinking=true/false) should be a user-facing setting in ChatConfigView. This
is already supported by mlx-swift-lm's tokenizer template system.

### Summary Table: oMLX VLMModelAdapter Methods vs mlx-swift-lm

| oMLX Method | Purpose | Swift Equivalent | Needed? |
|---|---|---|---|
| `__init__` | Extract language_model | Qwen35.languageModel | Already exists |
| `__call__` (3 paths) | Dispatch forward | prepare() + callAsFunction() | Already exists |
| `_IntOffsetCacheProxy` | Fix offset type mismatch | N/A (no mismatch) | No |
| `clear_vlm_position_state` | Reset mRoPE state | resetPositionState() | Already exists |
| `set_pending_embeddings` | Deferred VLM injection | N/A (sync prepare) | No |
| `get_input_embeddings` | Vision encode + merge | Inline in prepare() | Already exists |
| `layers` property | Cache creation | loraLayers / newCache() | Already exists |
| `make_cache()` | Create KV caches | newCache(parameters:) | Already exists |

**Bottom line**: All functionality that oMLX's VLMModelAdapter provides is already
implemented in mlx-swift-lm's `Qwen35` (MLXVLM) class. No Klee-layer adapter is needed.
The 3.4x performance gap comes from general Swift async/concurrency overhead and
Metal pipeline efficiency, not from VLM-specific issues.
