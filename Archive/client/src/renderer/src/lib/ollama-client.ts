/**
 * Ollama Client Configuration
 *
 * 为 Private Mode 配置 Ollama provider（AI SDK）
 *
 * 特点：
 * - 连接到本地 Ollama 服务（localhost:11434）
 * - 支持系统 Ollama 和 electron-ollama 内嵌版本
 * - 提供类型安全的模型配置
 *
 * 注意：所有配置都从 @config/local.config 导入，确保统一管理
 */

import { createOllama } from 'ollama-ai-provider-v2'
import { OLLAMA_CONFIG, CHAT_CONFIG, EMBEDDING_CONFIG } from '@config/local.config'
import { localLLMModels } from '@config/models'

/**
 * 创建 Ollama provider 实例
 *
 * 用于 AI SDK 的 streamText 和 generateText
 */
export const ollama = createOllama({
  baseURL: OLLAMA_CONFIG.API_BASE_URL,
})

/**
 * 推荐的默认模型
 *
 * 从 local.config.ts 导入，确保配置统一管理
 */
export const DEFAULT_MODEL = CHAT_CONFIG.DEFAULT_MODEL

/**
 * 推荐的嵌入模型
 */
export const DEFAULT_EMBEDDING_MODEL = EMBEDDING_CONFIG.DEFAULT_MODEL

/**
 * 获取模型的显示名称
 *
 * 从 models.ts 的 localLLMModels 数组中查找
 */
export function getModelDisplayName(modelId: string): string {
  const model = localLLMModels.find((m) => m.model === modelId)
  return model?.name || modelId
}

/**
 * 获取模型的描述
 *
 * 从 models.ts 的 localLLMModels 数组中查找
 */
export function getModelDescription(modelId: string): string {
  const model = localLLMModels.find((m) => m.model === modelId)
  return model?.description || 'No description available'
}

/**
 * 获取模型的大小（GB）
 *
 * 从 models.ts 的 localLLMModels 数组中查找
 */
export function getModelSize(modelId: string): number {
  const model = localLLMModels.find((m) => m.model === modelId)
  return model?.size || 0
}

/**
 * 格式化模型大小为可读字符串
 */
export function formatModelSize(sizeInGB: number): string {
  if (sizeInGB < 1) {
    return `${Math.round(sizeInGB * 1024)} MB`
  }
  return `${sizeInGB.toFixed(1)} GB`
}

/**
 * 检查 Ollama 是否可用
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.API_BASE_URL}/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 秒超时
    })
    return response.ok
  } catch (error) {
    console.error('[Ollama] Connection check failed:', error)
    return false
  }
}

/**
 * 获取已安装的模型列表
 *
 * 注意：此函数通过 IPC 调用主进程的 Ollama API，避免渲染进程的 CSP 限制
 */
export async function getInstalledModels(): Promise<
  Array<{
    name: string
    size: number
    modified_at: string
  }>
> {
  try {
    // 检查是否在 Electron 环境
    if (typeof window !== 'undefined' && window.api?.ollama?.listModels) {
      const result = await window.api.ollama.listModels()

      if (result.success) {
        return result.data || []
      } else {
        console.error('[Ollama] Failed to fetch models via IPC:', result.error)
        return []
      }
    }

    // Fallback: 如果不在 Electron 环境（如开发模式），直接调用 API
    console.warn('[Ollama] Running in non-Electron environment, using direct API')
    const response = await fetch(`${OLLAMA_CONFIG.API_BASE_URL}/tags`, {
      method: 'GET',
    })

    if (!response.ok) {
      throw new Error('Failed to fetch models from Ollama')
    }

    const data = await response.json()
    return data.models || []
  } catch (error) {
    console.error('[Ollama] Failed to fetch models:', error)
    return []
  }
}

/**
 * Ollama 下载进度
 *
 * 来自 Ollama API `/api/pull` 的 NDJSON 响应
 */
export interface OllamaDownloadProgress {
  /** 当前状态 */
  status:
    | 'pulling manifest'
    | 'downloading digestname'
    | 'verifying sha256 digest'
    | 'writing manifest'
    | 'removing any unused layers'
    | 'success'
    | 'error'

  /** 当前下载的 blob digest（可选） */
  digest?: string

  /** 总字节数 */
  total?: number

  /** 已下载字节数 */
  completed?: number

  /** 进度百分比（0-100） */
  percent: number

  /** 错误信息（如果状态为 error） */
  error?: string
}

/**
 * 下载模型（流式下载，支持进度回调）
 *
 * @param modelName - 模型名称（如 'llama3:8b'）
 * @param onProgress - 进度回调函数
 * @param signal - AbortSignal 用于取消下载
 */
export async function pullOllamaModel(
  modelName: string,
  onProgress: (progress: OllamaDownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  // 检查是否在 Electron 环境
  if (typeof window !== 'undefined' && window.api?.ollama?.pullModel) {
    // 监听进度事件
    const removeListener = window.api.ollama.onPullProgress?.((progress) => {
      // 只处理当前模型的进度
      if (progress.modelName === modelName) {
        const percent =
          typeof progress.percent === 'number'
            ? progress.percent
            : progress.status === 'success'
              ? 100
              : 0

        onProgress({
          status: progress.status as any,
          digest: undefined,
          total: progress.total,
          completed: progress.completed,
          percent,
          error: progress.error,
        })
      }
    })

    if (signal?.aborted) {
      removeListener?.()
      throw new DOMException('The operation was aborted', 'AbortError')
    }

    let cleanupAbortListener: (() => void) | undefined
    const abortPromise =
      signal &&
      new Promise<never>((_, reject) => {
        const abortHandler = () => {
          cleanupAbortListener?.()
          cleanupAbortListener = undefined
          removeListener?.()
          reject(new DOMException('The operation was aborted', 'AbortError'))
        }

        cleanupAbortListener = () => signal.removeEventListener('abort', abortHandler)
        signal.addEventListener('abort', abortHandler, { once: true })
      })

    try {
      // 调用 IPC 下载模型
      const pullPromise = window.api.ollama.pullModel(modelName)
      const result = abortPromise
        ? await Promise.race([pullPromise, abortPromise])
        : await pullPromise

      if (!result.success) {
        throw new Error(result.error || 'Failed to download model')
      }

      return
    } finally {
      cleanupAbortListener?.()
      cleanupAbortListener = undefined
      removeListener?.()
    }
  }

  // Fallback: 如果不在 Electron 环境（如开发模式），直接调用 API
  console.warn('[Ollama] Running in non-Electron environment, using direct API')
  const response = await fetch(`${OLLAMA_CONFIG.API_BASE_URL}/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to pull model: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const data = JSON.parse(line)

          const percent =
            data.total && data.completed
              ? Math.round((data.completed / data.total) * 100)
              : data.status === 'success'
                ? 100
                : 0

          onProgress({
            status: data.status,
            digest: data.digest,
            total: data.total,
            completed: data.completed,
            percent,
            error:
              typeof data.error === 'string'
                ? data.error
                : typeof data.message === 'string'
                  ? data.message
                  : undefined,
          })

          if (data.status === 'error' || data.error) {
            throw new Error(
              (typeof data.error === 'string' && data.error) ||
                (typeof data.message === 'string' && data.message) ||
                'Failed to download model'
            )
          }
        } catch (error) {
          console.error('[Ollama] Failed to parse progress line:', line, error)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
