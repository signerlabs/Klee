/**
 * Ollama Embedding Service
 *
 * 负责调用 Ollama API 生成文本的 embedding 向量
 * 支持单个文本和批量文本的 embedding 生成
 */

import { OLLAMA_CONFIG, EMBEDDING_CONFIG } from '../../../../config/local.config'
import { ensureModelFromBundle, getEmbeddedBasePath } from './ollama-embedded-assets'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Embedding 生成结果
 */
export interface EmbeddingResult {
  embedding: number[]
  model: string
}

/**
 * 批量 Embedding 进度回调
 */
export interface EmbeddingProgress {
  /** 当前已处理数量 */
  processed: number
  /** 总数量 */
  total: number
  /** 进度百分比 (0-100) */
  percent: number
}

/**
 * 批量 Embedding 配置
 */
export interface BatchEmbeddingConfig {
  /** 并发数 (默认: 1, 推荐使用串行避免 Ollama 崩溃) */
  concurrency?: number
  /** 进度回调函数 */
  onProgress?: (progress: EmbeddingProgress) => void
}

/**
 * 生成单个文本的 embedding
 *
 * @param text - 要生成 embedding 的文本
 * @param model - embedding 模型 (默认: nomic-embed-text)
 * @returns embedding 向量 (768维)
 * @throws Error 如果 API 调用失败或超时
 *
 * @example
 * ```typescript
 * const embedding = await generateEmbedding("Hello world")
 * console.log(embedding.length) // 768
 * ```
 */
export async function generateEmbedding(
  text: string,
  model: string = EMBEDDING_CONFIG.DEFAULT_MODEL
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_CONFIG.TIMEOUT)

  try {
    const response = await fetch(`${OLLAMA_CONFIG.API_URL}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: text,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Ollama API error: ${response.status} - ${error}`)
    }

    const data = await response.json() as EmbeddingResult

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from Ollama')
    }

    // 验证 embedding 维度
    const expectedDim = EMBEDDING_CONFIG.CHUNK_CONFIG.MAX_CHUNK_SIZE === 1000
      ? 768  // nomic-embed-text 维度
      : data.embedding.length

    if (data.embedding.length !== expectedDim && model === EMBEDDING_CONFIG.DEFAULT_MODEL) {
      console.warn(
        `[EmbeddingService] Unexpected embedding dimension: ${data.embedding.length}, expected: ${expectedDim}`
      )
    }

    return data.embedding

  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Embedding generation timeout after ${OLLAMA_CONFIG.TIMEOUT}ms`)
      }
      throw error
    }

    throw new Error('Unknown error generating embedding')
  }
}

/**
 * 批量生成 embeddings (带并发控制和进度回调)
 *
 * @param texts - 文本数组
 * @param config - 批量处理配置
 * @returns embedding 向量数组
 * @throws Error 如果任何一个 embedding 生成失败
 *
 * @example
 * ```typescript
 * const texts = ["chunk 1", "chunk 2", "chunk 3"]
 * const embeddings = await generateEmbeddingsBatch(texts, {
 *   concurrency: 1, // 推荐使用 1 避免 Ollama 崩溃
 *   onProgress: (progress) => {
 *     console.log(`Progress: ${progress.percent}%`)
 *   }
 * })
 * ```
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  config: BatchEmbeddingConfig = {}
): Promise<number[][]> {
  const {
    concurrency = 1, // 默认使用串行处理,避免 Ollama Metal 后端崩溃
    onProgress
  } = config

  if (texts.length === 0) {
    return []
  }

  const results: number[][] = []
  let processed = 0

  // 分批处理,控制并发数
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency)

    // 并行处理当前批次
    const batchResults = await Promise.all(
      batch.map(text => generateEmbedding(text))
    )

    results.push(...batchResults)
    processed += batch.length

    // 调用进度回调
    if (onProgress) {
      onProgress({
        processed,
        total: texts.length,
        percent: Math.round((processed / texts.length) * 100),
      })
    }
  }

  return results
}

/**
 * 带重试逻辑的 embedding 生成
 *
 * @param text - 要生成 embedding 的文本
 * @param maxRetries - 最大重试次数 (默认: 3)
 * @param retryDelay - 重试延迟 (毫秒, 使用指数退避)
 * @returns embedding 向量
 * @throws Error 如果所有重试都失败
 *
 * @example
 * ```typescript
 * const embedding = await generateEmbeddingWithRetry("Hello world", 3)
 * ```
 */
export async function generateEmbeddingWithRetry(
  text: string,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<number[]> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateEmbedding(text)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      if (attempt < maxRetries) {
        // 指数退避: 1s, 2s, 4s
        const delay = retryDelay * Math.pow(2, attempt)
        console.warn(
          `[EmbeddingService] Retry ${attempt + 1}/${maxRetries} after ${delay}ms. Error: ${lastError.message}`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw new Error(
    `Failed to generate embedding after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`
  )
}

/**
 * 批量生成 embeddings (带重试逻辑)
 *
 * @param texts - 文本数组
 * @param config - 批量处理配置
 * @param maxRetries - 每个文本的最大重试次数
 * @returns embedding 向量数组
 * @throws Error 如果任何一个 embedding 生成失败(重试后)
 */
export async function generateEmbeddingsBatchWithRetry(
  texts: string[],
  config: BatchEmbeddingConfig = {},
  maxRetries: number = 3
): Promise<number[][]> {
  const { onProgress } = config

  if (texts.length === 0) {
    return []
  }

  const results: number[][] = []
  let processed = 0

  // 完全串行处理（Ollama 不支持批量 embedding API）
  // 参考: https://ollama.com/blog/embedding-models
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]

    // 生成 embedding (带重试)
    const embedding = await generateEmbeddingWithRetry(text, maxRetries)
    results.push(embedding)
    processed++

    // 调用进度回调
    if (onProgress) {
      onProgress({
        processed,
        total: texts.length,
        percent: Math.round((processed / texts.length) * 100),
      })
    }

    // 在请求之间添加延迟,避免 Metal GPU 过载和 SIGTRAP 崩溃
    // 参考: https://github.com/ollama/ollama/issues/6094
    // Apple Silicon Metal GPU 需要更长的延迟来避免崩溃
    if (i < texts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // 1000ms 延迟（M4 Max 需要更长延迟）
    }
  }

  return results
}

/**
 * 验证 Ollama 服务是否可用
 *
 * @returns 服务是否可用
 */
export async function checkOllamaAvailability(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000) // 2秒超时

    const response = await fetch(`${OLLAMA_CONFIG.API_URL}/api/tags`, {
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response.ok

  } catch (error) {
    return false
  }
}

/**
 * 获取 Ollama 可用的模型列表
 *
 * @returns 模型名称数组
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.API_URL}/api/tags`)

    if (!response.ok) {
      throw new Error('Failed to fetch models')
    }

    const data = await response.json() as { models: Array<{ name: string }> }
    return data.models.map(m => m.name)

  } catch (error) {
    console.error('[EmbeddingService] Failed to get available models:', error)
    return []
  }
}

/**
 * Pull 进度回调
 */
export interface PullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
  percent?: number
}

/**
 * 确保模型可用 (如果不存在则自动拉取)
 *
 * @param model - 模型名称
 * @param onProgress - 可选的拉取进度回调
 * @returns 模型是否可用
 *
 * @example
 * ```typescript
 * const available = await ensureModelAvailable('nomic-embed-text')
 * if (available) {
 *   // 可以安全地使用模型
 * }
 * ```
 */
export async function ensureModelAvailable(
  model: string = EMBEDDING_CONFIG.DEFAULT_MODEL,
  onProgress?: (progress: PullProgress) => void
): Promise<boolean> {
  try {
    onProgress?.({
      status: 'checking-installed',
      percent: 0,
    })

    // 1. 检查模型是否已存在
    const availableModels = await getAvailableModels()
    const modelExists = availableModels.some(m =>
      m === model || m.startsWith(`${model}:`)
    )

    if (modelExists) {
      console.log(`[EmbeddingService] Model already available: ${model}`)
      onProgress?.({
        status: 'ready',
        percent: 100,
      })
      return true
    }

    // 2. 模型不存在,尝试从离线包导入
    console.log(`[EmbeddingService] Model not found via API, provisioning from bundle: ${model}`)
    onProgress?.({
      status: 'bundled-check',
      percent: 25,
    })

    const embeddedHome = process.env.KLEE_EMBEDDED_OLLAMA_HOME
    if (!embeddedHome) {
      console.warn(
        `[EmbeddingService] Embedded Ollama home not set; cannot provision model ${model} from bundle`
      )
      return false
    }

    const provisioned = await ensureModelFromBundle(
      getEmbeddedBasePath(),
      model,
      (message) => console.log(`[EmbeddingService] ${message}`)
    )

    if (!provisioned) {
      onProgress?.({
        status: 'bundled-copy-failed',
      })
      return false
    }

    onProgress?.({
      status: 'bundled-copy',
      percent: 50,
    })

    // 3. 重新检查 API，等待 Ollama 刷新索引
    const MAX_RETRY = 5
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      if (attempt > 0) {
        await delay(500)
      }

      const refreshed = await getAvailableModels()
      const nowExists = refreshed.some(m => m === model || m.startsWith(`${model}:`))

      if (nowExists) {
        console.log(`[EmbeddingService] Model is now available after provisioning: ${model}`)
        onProgress?.({
          status: 'ready',
          percent: 100,
        })
        return true
      }
    }

    console.error(`[EmbeddingService] Model ${model} provisioned but not registered by Ollama API`)
    return false

  } catch (error) {
    console.error('[EmbeddingService] Error ensuring model availability:', error)
    return false
  }
}
