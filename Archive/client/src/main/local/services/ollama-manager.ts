/**
 * OllamaManager - 智能 Ollama 集成管理器
 *
 * 功能：
 * - 优先检测并复用系统 Ollama（避免进程冲突）
 * - 必要时自动下载内嵌版本到 userData
 * - 精确进程管理（不影响用户系统 Ollama）
 * - 支持进度回调和来源追踪
 */

import { ElectronOllama } from 'electron-ollama'
import { app } from 'electron'
import path from 'path'
import * as fs from 'node:fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import { EMBEDDING_CONFIG } from '../../../../config/local.config'
import {
  detectPlatform,
  EmbeddedPlatform,
  EMBEDDED_OLLAMA_VERSION,
  ensureEmbeddedBinary,
  ensureEmbeddedModels,
  getEmbeddedDataPath,
  getEmbeddedExecutablePath,
} from './ollama-embedded-assets'

const execAsync = promisify(exec)

/**
 * Ollama 来源类型
 * - system: 用户已安装的系统 Ollama
 * - embedded: Klee 内嵌的 Ollama 版本
 * - none: 未初始化或初始化失败
 */
export type OllamaSource = 'system' | 'embedded' | 'none'

/**
 * 初始化进度回调
 */
export interface OllamaInitProgress {
  percent: number
  message: string
  source: OllamaSource
}

/**
 * 初始化结果
 */
export interface OllamaInitResult {
  source: OllamaSource
  url: string
}

export class OllamaManager {
  private ollama: ElectronOllama | null = null
  private readonly basePath: string
  private readonly platform: EmbeddedPlatform
  private ollamaSource: OllamaSource = 'none'
  private readonly ollamaUrl = 'http://localhost:11434'

  constructor() {
    this.basePath = path.join(app.getPath('userData'), 'ollama')
    this.platform = detectPlatform()
  }

  /**
   * T026: 初始化 Ollama（智能检测版本）
   *
   * 策略：
   * 1. 首先检测系统 Ollama（localhost:11434）
   * 2. 如果检测到，直接使用系统版本
   * 3. 如果未检测到，下载并启动内嵌版本
   *
   * @param onProgress - 可选的进度回调函数
   * @returns 初始化结果（包含来源和 URL）
   */
  async initialize(
    onProgress?: (progress: OllamaInitProgress) => void
  ): Promise<OllamaInitResult> {
    try {
      console.log('[OllamaManager] Starting initialization...')
      const ollamaInPath = await this.isOllamaInPath()
      console.log('[OllamaManager] PATH lookup for `ollama`:', ollamaInPath ? 'found' : 'not found')

      // T025.1: 检测系统 Ollama
      const systemOllamaAvailable = await this.detectSystemOllama()

      console.log(`[OllamaManager] System Ollama detection result: ${systemOllamaAvailable}`)

      if (systemOllamaAvailable) {
        this.ollamaSource = 'system'
        console.log('✅ Using system Ollama at http://localhost:11434')

        // T027: 发送进度事件
        onProgress?.({
          percent: 100,
          message: 'Connected to system Ollama',
          source: 'system',
        })

        return { source: 'system', url: this.ollamaUrl }
      }

      // 系统无 Ollama，使用内嵌版本
      console.log('🔄 System Ollama not found, preparing embedded bundle...')
      this.ollamaSource = 'embedded'

      await this.prepareEmbeddedBundle(onProgress)

      this.ollama = new ElectronOllama({ basePath: this.basePath })

      if (!(await this.ollama.isRunning())) {
        console.log('[OllamaManager] Launching embedded Ollama binary...')
        await this.ollama.serve(EMBEDDED_OLLAMA_VERSION, {
          serverLog: (message) => console.log('[EmbeddedOllama]', message),
        })
      }

      console.log('✅ Embedded Ollama server ready at http://localhost:11434')

      onProgress?.({
        percent: 100,
        message: 'Embedded Ollama ready',
        source: 'embedded',
      })

      return { source: 'embedded', url: this.ollamaUrl }
    } catch (error) {
      console.error('❌ Failed to initialize Ollama:', error)
      this.ollamaSource = 'none'
      throw error
    }
  }

  /**
   * T025.1: 检测系统是否已运行 Ollama
   *
   * 通过检查 localhost:11434/api/tags 是否有 Ollama API 响应来判断
   *
   * @returns 是否检测到系统 Ollama
   */
  private async detectSystemOllama(): Promise<boolean> {
    try {
      console.log('[OllamaManager] Detecting system Ollama at', this.ollamaUrl)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2秒超时

      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      console.log('[OllamaManager] Fetch response status:', response.status)

      if (response.ok) {
        // 验证返回的是 Ollama API 响应
        const data = await response.json()
        const hasModels = 'models' in data
        console.log('[OllamaManager] Response has models:', hasModels)
        return hasModels // Ollama /api/tags 返回 { models: [...] }
      }

      console.log('[OllamaManager] Response not OK')
      return false
    } catch (error) {
      // 网络错误、超时或连接被拒绝 → 系统无 Ollama
      console.log('[OllamaManager] Detection failed:', error)
      return false
    }
  }

  /**
   * T025.2: 获取当前使用的 Ollama 来源
   *
   * @returns 当前 Ollama 来源
   */
  getSource(): OllamaSource {
    return this.ollamaSource
  }

  private async prepareEmbeddedBundle(
    onProgress?: (progress: OllamaInitProgress) => void
  ): Promise<void> {
    const log = (message: string) => console.log(message)

    onProgress?.({
      percent: 20,
      message: 'Preparing embedded Ollama binary...',
      source: 'embedded',
    })

    const executablePath = await ensureEmbeddedBinary(this.basePath, this.platform, (message) =>
      log(`[OllamaManager] ${message}`)
    )
    console.log('[OllamaManager] Embedded Ollama binary ready at:', executablePath)

    onProgress?.({
      percent: 40,
      message: 'Preparing bundled embedding models...',
      source: 'embedded',
    })

    await ensureEmbeddedModels(
      this.basePath,
      [EMBEDDING_CONFIG.DEFAULT_MODEL],
      (message) => log(`[OllamaManager] ${message}`)
    )

    const dataPath = getEmbeddedDataPath(this.basePath)
    const modelsPath = path.join(dataPath, 'models')
    const tmpPath = path.join(dataPath, 'tmp')
    console.log('[OllamaManager] Embedded models directory prepared at:', modelsPath)

    await fs.mkdir(tmpPath, { recursive: true })

    if (!process.env.OLLAMA_HOME) {
      process.env.OLLAMA_HOME = dataPath
    }
    if (!process.env.OLLAMA_MODELS) {
      process.env.OLLAMA_MODELS = modelsPath
    }
    process.env.KLEE_EMBEDDED_OLLAMA_MODELS = modelsPath
    if (!process.env.OLLAMA_TMPDIR) {
      process.env.OLLAMA_TMPDIR = tmpPath
    }
    if (!process.env.OLLAMA_HOST) {
      process.env.OLLAMA_HOST = '127.0.0.1:11434'
    }

    process.env.KLEE_EMBEDDED_OLLAMA_HOME = dataPath
    process.env.KLEE_EMBEDDED_OLLAMA_BIN = executablePath

    console.log('[OllamaManager] Embedded environment configured', {
      OLLAMA_HOME: process.env.OLLAMA_HOME,
      OLLAMA_MODELS: process.env.OLLAMA_MODELS,
      OLLAMA_TMPDIR: process.env.OLLAMA_TMPDIR,
      EMBEDDED_BIN: process.env.KLEE_EMBEDDED_OLLAMA_BIN,
    })

    onProgress?.({
      percent: 60,
      message: 'Embedded assets ready, starting server...',
      source: 'embedded',
    })
  }

  private async isOllamaInPath(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        await execAsync('where ollama')
      } else {
        await execAsync('command -v ollama')
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * T028 & T028.1: 智能关闭 Ollama
   *
   * 策略：
   * - 如果使用系统 Ollama → 不关闭（避免影响用户）
   * - 如果使用内嵌 Ollama → 精确关闭（不误杀系统进程）
   *
   * 平台特定逻辑：
   * - macOS/Linux: 使用 pkill -f 过滤 basePath
   * - Windows: 使用 wmic 查询进程路径
   */
  async shutdown(): Promise<void> {
    // 如果使用系统 Ollama，不要关闭它
    if (this.ollamaSource === 'system') {
      console.log('ℹ️ Using system Ollama, skipping shutdown')
      return
    }

    // 只关闭内嵌的 Ollama
    if (this.ollamaSource !== 'embedded') {
      return
    }

    const embeddedExecutable = getEmbeddedExecutablePath(this.basePath, this.platform)
    console.log('[OllamaManager] Attempting to stop embedded Ollama', {
      executable: embeddedExecutable,
    })

    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        // macOS/Linux: 只杀掉从 basePath 启动的进程
        await execAsync(`pkill -f "${embeddedExecutable}"`)
      } else if (process.platform === 'win32') {
        // Windows: 通过进程路径过滤
        const escapedPath = embeddedExecutable.replace(/\\/g, '\\\\')
        const findCmd = `wmic process where "ExecutablePath='${escapedPath}'" get ProcessId`

        const { stdout } = await execAsync(findCmd)
        const pids = stdout
          .split('\n')
          .slice(1)
          .map((line) => line.trim())
          .filter(Boolean)

        for (const pid of pids) {
          await execAsync(`taskkill /F /PID ${pid}`)
        }
      }

      console.log('✅ Embedded Ollama shutdown complete')
    } catch (error) {
      // 进程可能已关闭，忽略错误
      console.log('ℹ️ Ollama process already terminated or not found', error)
    }
  }

  /**
   * 获取 Ollama API URL
   */
  getUrl(): string {
    return this.ollamaUrl
  }
}
