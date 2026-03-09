/**
 * useOllamaSource Hook - 监听 Ollama 来源信息
 *
 * 功能：
 * - 监听主进程发送的 ollama-ready 事件
 * - 获取 Ollama 来源（system/embedded/none）
 * - 监听初始化进度
 */

import { useState, useEffect } from 'react'

/**
 * Ollama 来源类型
 */
export type OllamaSource = 'system' | 'embedded' | 'none'

/**
 * Ollama 初始化进度
 */
export interface OllamaInitProgress {
  percent: number
  message: string
  source: OllamaSource
}

/**
 * Ollama 就绪信息
 */
export interface OllamaReadyInfo {
  source: OllamaSource
  url: string
}

/**
 * Hook 返回值
 */
export interface UseOllamaSourceReturn {
  /** Ollama 来源 */
  source: OllamaSource
  /** Ollama API URL */
  url: string | null
  /** 是否正在初始化 */
  isInitializing: boolean
  /** 初始化进度（0-100） */
  progress: number
  /** 进度消息 */
  progressMessage: string
}

/**
 * useOllamaSource Hook
 *
 * @example
 * ```tsx
 * function OllamaStatus() {
 *   const { source, isInitializing, progress, progressMessage } = useOllamaSource()
 *
 *   return (
 *     <div>
 *       {isInitializing ? (
 *         <ProgressBar percent={progress} message={progressMessage} />
 *       ) : (
 *         <div>Using {source === 'system' ? 'System' : 'Embedded'} Ollama</div>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
export function useOllamaSource(): UseOllamaSourceReturn {
  const [source, setSource] = useState<OllamaSource>('none')
  const [url, setUrl] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('Initializing...')

  useEffect(() => {
    console.log('[useOllamaSource] Hook mounted, checking for Electron IPC...')

    // 检查 electron API 是否可用
    if (!window.electron?.ipcRenderer) {
      console.warn('[useOllamaSource] Electron IPC not available')
      setIsInitializing(false)
      return
    }

    console.log('[useOllamaSource] Electron IPC available, registering event listeners...')
    const { ipcRenderer } = window.electron

    // 设置初始化超时 (30秒)
    const initTimeout = setTimeout(() => {
      console.warn('[useOllamaSource] Initialization timeout after 30s')
      console.warn('[useOllamaSource] Current state:', { source, isInitializing, progress })
      setIsInitializing(false)
      setProgressMessage('Initialization timed out')
    }, 30000)

    // 监听初始化进度
    const handleProgress = (_event: unknown, data: OllamaInitProgress) => {
      console.log('[useOllamaSource] Progress:', data)
      setProgress(data.percent)
      setProgressMessage(data.message)
      setSource(data.source)
    }

    // 监听 Ollama 就绪事件
    const handleReady = (_event: unknown, data: OllamaReadyInfo) => {
      clearTimeout(initTimeout)
      setSource(data.source)
      setUrl(data.url)
      setIsInitializing(false)
      setProgress(100)
      setProgressMessage(
        data.source === 'system' ? 'Connected to System Ollama' : 'Embedded Ollama Ready'
      )

      console.log(`[useOllamaSource] Ollama ready: ${data.source} at ${data.url}`)
    }

    // 监听初始化失败事件
    const handleFailed = (_event: unknown, data: { error: string }) => {
      clearTimeout(initTimeout)
      console.error('[useOllamaSource] Initialization failed:', data.error)
      setIsInitializing(false)
      setProgressMessage('Initialization failed')
    }

    // 注册事件监听器
    ipcRenderer.on('ollama-init-progress', handleProgress)
    ipcRenderer.on('ollama-ready', handleReady)
    ipcRenderer.on('ollama-init-failed', handleFailed)

    // 🔧 修复竞态条件：主动请求当前状态
    // 如果 Ollama 已经初始化完成，主进程会立即响应
    console.log('[useOllamaSource] Requesting current Ollama status...')
    ipcRenderer.send('ollama-get-status')

    // 清理函数
    return () => {
      clearTimeout(initTimeout)
      ipcRenderer.removeListener('ollama-init-progress', handleProgress)
      ipcRenderer.removeListener('ollama-ready', handleReady)
      ipcRenderer.removeListener('ollama-init-failed', handleFailed)
    }
  }, [])

  return {
    source,
    url,
    isInitializing,
    progress,
    progressMessage,
  }
}
