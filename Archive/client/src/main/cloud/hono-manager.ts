/**
 * Hono 服务器管理器 - Cloud Mode
 *
 * 功能:
 * - 在独立的子进程中启动 Hono 服务器
 * - 监控服务器健康状态
 * - 优雅关闭服务器
 * - 日志管理
 */

import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { app } from 'electron'

export interface HonoManagerConfig {
  serverUrl?: string
  healthCheckPath?: string
  maxStartupTime?: number // 最大启动等待时间（毫秒）
}

export class HonoManager {
  private serverProcess: ChildProcess | null = null
  private readonly serverUrl: string
  private readonly healthCheckPath: string
  private readonly maxStartupTime: number

  constructor(config: HonoManagerConfig = {}) {
    this.serverUrl = config.serverUrl || 'http://localhost:3000'
    this.healthCheckPath = config.healthCheckPath || '/api/health'
    this.maxStartupTime = config.maxStartupTime || 30000 // 默认 30 秒
  }

  /**
   * 启动 Hono 服务器
   *
   * 策略：
   * 1. 定位 server/ 目录的入口文件
   * 2. 使用 spawn 在子进程中启动 Node.js 服务器
   * 3. 监听服务器日志
   * 4. 轮询健康检查直到服务器就绪
   */
  async start(): Promise<void> {
    console.log('[HonoManager] Starting Hono server...')

    try {
      // 定位服务器入口文件
      const serverPath = this.resolveServerPath()
      console.log('[HonoManager] Server path:', serverPath)

      // 启动子进程
      this.serverProcess = spawn('node', [serverPath], {
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'development',
        },
        stdio: ['ignore', 'pipe', 'pipe'], // 捕获 stdout/stderr
        detached: false, // 不分离进程，确保主进程退出时子进程也退出
      })

      // 监听服务器输出
      this.setupLogging()

      // 处理进程错误
      this.serverProcess.on('error', (error) => {
        console.error('[HonoManager] Failed to start server process:', error)
        throw error
      })

      this.serverProcess.on('exit', (code, signal) => {
        console.log(`[HonoManager] Server process exited with code ${code}, signal ${signal}`)
      })

      // 等待服务器就绪
      await this.waitForReady()

      console.log('[HonoManager] ✅ Hono server is ready at', this.serverUrl)
    } catch (error) {
      console.error('[HonoManager] ❌ Failed to start Hono server:', error)
      await this.stop() // 清理资源
      throw error
    }
  }

  /**
   * 定位服务器入口文件
   *
   * 开发环境: ../../../server/src/index.ts (通过 tsx 运行)
   * 生产环境: ../../../server/dist/index.js
   */
  private resolveServerPath(): string {
    const isDev = !app.isPackaged

    if (isDev) {
      // 开发环境: 从 client/src/main/ 回退到 server/src/index.ts
      return path.join(__dirname, '../../../server/src/index.ts')
    } else {
      // 生产环境: 使用构建后的文件
      return path.join(process.resourcesPath, 'server', 'dist', 'index.js')
    }
  }

  /**
   * 设置日志监听
   */
  private setupLogging(): void {
    if (!this.serverProcess) return

    this.serverProcess.stdout?.on('data', (data) => {
      const message = data.toString().trim()
      if (message) {
        console.log('[Hono Server]', message)
      }
    })

    this.serverProcess.stderr?.on('data', (data) => {
      const message = data.toString().trim()
      if (message) {
        console.error('[Hono Server Error]', message)
      }
    })
  }

  /**
   * 等待服务器就绪
   *
   * 通过轮询健康检查接口来判断
   */
  private async waitForReady(): Promise<void> {
    const startTime = Date.now()
    const checkInterval = 1000 // 每秒检查一次

    while (Date.now() - startTime < this.maxStartupTime) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000)

        const response = await fetch(`${this.serverUrl}${this.healthCheckPath}`, {
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          return // 服务器就绪
        }
      } catch (error) {
        // 忽略错误，继续轮询
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval))
    }

    throw new Error(
      `Hono server failed to start within ${this.maxStartupTime / 1000} seconds`
    )
  }

  /**
   * 停止 Hono 服务器
   *
   * 策略：
   * 1. 发送 SIGTERM 信号（优雅关闭）
   * 2. 等待 5 秒
   * 3. 如果进程仍在运行，发送 SIGKILL 强制终止
   */
  async stop(): Promise<void> {
    if (!this.serverProcess) {
      console.log('[HonoManager] No server process to stop')
      return
    }

    console.log('[HonoManager] Stopping Hono server...')

    return new Promise<void>((resolve) => {
      if (!this.serverProcess) {
        resolve()
        return
      }

      // 设置 5 秒超时
      const timeout = setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          console.warn('[HonoManager] Force killing server process (SIGKILL)')
          this.serverProcess.kill('SIGKILL')
        }
      }, 5000)

      this.serverProcess.once('exit', () => {
        clearTimeout(timeout)
        console.log('[HonoManager] ✅ Hono server stopped')
        this.serverProcess = null
        resolve()
      })

      // 发送 SIGTERM 优雅关闭
      this.serverProcess.kill('SIGTERM')
    })
  }

  /**
   * 检查服务器是否在运行
   */
  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed
  }

  /**
   * 获取服务器 URL
   */
  getUrl(): string {
    return this.serverUrl
  }
}
