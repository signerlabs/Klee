/**
 * Ollama IPC Handlers - 处理 Ollama API 调用
 *
 * 功能：
 * - 获取已安装的模型列表
 * - 下载模型（流式下载）
 * - 其他 Ollama API 操作
 *
 * 注意：所有 Ollama API 调用必须在主进程中进行，避免渲染进程的 CSP 限制
 */

import { ipcMain, BrowserWindow } from 'electron'
import { OLLAMA_CHANNELS } from './channels'

/**
 * 默认 Ollama API 基础 URL
 */
const OLLAMA_API_BASE_URL = 'http://localhost:11434'

/**
 * 初始化 Ollama API 处理器
 */
export function initOllamaHandlers() {
  /**
   * ollama:list-models - 获取已安装的模型列表
   *
   * 返回：
   * - success: boolean
   * - data: Array<{ name: string, size: number, modified_at: string }>
   */
  ipcMain.handle(OLLAMA_CHANNELS.LIST_MODELS, async () => {
    try {
      console.log('[Ollama IPC] Fetching installed models from', OLLAMA_API_BASE_URL)

      const response = await fetch(`${OLLAMA_API_BASE_URL}/api/tags`, {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }

      const data = await response.json()
      const models = data.models || []

      console.log(`[Ollama IPC] Successfully fetched ${models.length} models`)

      return {
        success: true,
        data: models,
      }
    } catch (error) {
      console.error('[Ollama IPC] Failed to fetch models:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch models',
        data: [], // 返回空数组作为 fallback
      }
    }
  })

  /**
   * ollama:pull-model - 下载模型（流式下载）
   *
   * 参数：
   * - modelName: string - 模型名称（如 'llama3:8b'）
   *
   * 返回：
   * - success: boolean
   * - error: string (可选)
   *
   * 进度事件通过 'ollama:pull-progress' 发送到渲染进程
   */
  ipcMain.handle(OLLAMA_CHANNELS.PULL_MODEL, async (event, modelName: string) => {
    try {
      console.log(`[Ollama IPC] Starting model download: ${modelName}`)

      const response = await fetch(`${OLLAMA_API_BASE_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
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
              const errorMessage: string | undefined =
                typeof data.error === 'string'
                  ? data.error
                  : typeof data.message === 'string'
                    ? data.message
                    : undefined

              const computedPercent =
                data.total && data.completed
                  ? Math.round((data.completed / data.total) * 100)
                  : data.status === 'success'
                    ? 100
                    : 0

              // 发送进度事件到渲染进程
              const win = BrowserWindow.fromWebContents(event.sender)
              if (win && !win.isDestroyed()) {
                win.webContents.send(OLLAMA_CHANNELS.PULL_PROGRESS, {
                  modelName,
                  status: data.status,
                  digest: data.digest,
                  total: data.total,
                  completed: data.completed,
                  percent: computedPercent,
                  error: errorMessage,
                })
              }

              if (data.status === 'error' || errorMessage) {
                throw new Error(errorMessage || 'Failed to download model')
              }
            } catch (error) {
              console.error('[Ollama IPC] Failed to parse progress line:', line, error)
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      console.log(`[Ollama IPC] Successfully downloaded model: ${modelName}`)

      return { success: true }
    } catch (error) {
      console.error(`[Ollama IPC] Failed to download model ${modelName}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download model',
      }
    }
  })

  console.log('[Ollama Handlers] Registered Ollama API IPC handlers')
}
