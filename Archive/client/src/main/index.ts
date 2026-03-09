import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { update } from './update'
import { OllamaManager } from './local/services/ollama-manager'
import { initModeHandlers } from './ipc/mode-handlers'
import { registerConversationHandlers } from './ipc/conversation-handlers'
import { registerMessageHandlers } from './ipc/message-handlers'
import { registerKnowledgeBaseHandlers } from './ipc/knowledge-base-handlers'
import { registerNoteHandlers } from './ipc/note-handlers'
import { initDiskSpaceHandlers } from './ipc/disk-space-handlers'
import { initModelHandlers } from './ipc/model-handlers'
import { initOllamaHandlers } from './ipc/ollama-handlers'
import { dbManager } from './local/db/connection-manager'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = path.join(process.env.APP_ROOT, 'build')
const ICON_FILENAME =
  process.platform === 'darwin'
    ? 'icon.icns'
    : process.platform === 'win32'
      ? 'icon.ico'
      : 'icon.png'
const ICON_PATH = path.join(process.env.VITE_PUBLIC, ICON_FILENAME)

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// Register custom protocol for deep linking (OAuth callbacks)
if (process.defaultApp) {
  // Development environment
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('klee', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  // Production environment
  app.setAsDefaultProtocolClient('klee')
}

// Request single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...')
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// T029: 初始化 OllamaManager
let ollamaManager: OllamaManager
let ollamaStatus: { source: 'system' | 'embedded' | 'none'; url: string } = {
  source: 'none',
  url: ''
}

/**
 * Handle OAuth callback from deep link
 * Extracts tokens from URL and sends to renderer process
 */
function handleOAuthCallback(url: string) {
  try {
    const urlObj = new URL(url)

    // Check if this is an OAuth callback
    // Note: pathname might be just '/callback' or '//auth/callback'
    if (urlObj.protocol === 'klee:' && (urlObj.pathname.includes('callback') || urlObj.host === 'auth')) {
      // Extract tokens from URL (Supabase uses hash format)
      const accessToken = urlObj.searchParams.get('access_token') || urlObj.hash.match(/access_token=([^&]*)/)?.[1]
      const refreshToken = urlObj.searchParams.get('refresh_token') || urlObj.hash.match(/refresh_token=([^&]*)/)?.[1]
      const error = urlObj.searchParams.get('error')
      const errorDescription = urlObj.searchParams.get('error_description')

      if (error) {
        console.error('[OAuth] Error:', error, errorDescription)
        if (win && !win.isDestroyed()) {
          win.webContents.send('oauth-error', { error, errorDescription })
        }
        return
      }

      if (accessToken && refreshToken) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('oauth-success', { accessToken, refreshToken })
          // Restore and focus window
          if (win.isMinimized()) win.restore()
          win.focus()
        }
      }
    }
  } catch (err) {
    console.error('[OAuth] Failed to parse deep link URL:', err)
  }
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'Klee',
    icon: ICON_PATH,
    width: 1200,
    height: 1000,
    minWidth: 1000,
    minHeight: 800,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open DevTools in development
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Auto update
  update(win)
}

app.whenReady().then(async () => {
  // OAuth: 注册 shell.openExternal IPC 处理器
  ipcMain.handle('oauth:openBrowser', async (_event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('[OAuth] Failed to open browser:', error)
      return { success: false, error: String(error) }
    }
  })

  // T033: 初始化模式处理器
  initModeHandlers()

  // 注册对话和消息的 IPC 处理器
  registerConversationHandlers()
  registerMessageHandlers()
  registerKnowledgeBaseHandlers()
  registerNoteHandlers()

  // 初始化磁盘空间、模型管理和 Ollama API 处理器
  initDiskSpaceHandlers()
  initModelHandlers()
  initOllamaHandlers()

  // 🔧 初始化 Private Mode 数据库（确保表在首次使用前已创建）
  console.log('[Database] Initializing Private Mode database...')
  try {
    await dbManager.getConnection('private')
    console.log('[Database] Private Mode database initialized successfully')
  } catch (error) {
    console.error('[Database] Failed to initialize Private Mode database:', error)
    // 不阻塞应用启动，但记录错误
  }

  // 🔧 注册 IPC 处理器：响应 ollama-get-status 请求
  ipcMain.on('ollama-get-status', (event) => {
    console.log('[Main] Received ollama-get-status request, current status:', ollamaStatus)
    if (ollamaStatus.source !== 'none') {
      // Ollama 已初始化，立即返回状态
      console.log('[Main] Sending cached ollama-ready status')
      event.sender.send('ollama-ready', {
        source: ollamaStatus.source,
        url: ollamaStatus.url,
      })
    } else {
      console.log('[Main] Ollama not yet initialized, request will wait for initialization')
    }
  })

  // 先创建窗口,避免阻塞 UI
  await createWindow()

  // T029: 初始化 OllamaManager (后台初始化,不阻塞窗口)
  ollamaManager = new OllamaManager()

  // 等待窗口完全加载后再初始化 Ollama
  if (win) {
    console.log('[Main] Waiting for window to load...')
    win.webContents.once('did-finish-load', () => {
      console.log('[Main] Window loaded, starting Ollama initialization...')
      // 后台初始化 Ollama,不阻塞应用启动
      ollamaManager.initialize((progress) => {
        console.log('[Main] Sending ollama-init-progress:', progress)
        // T029.1: 发送初始化进度到渲染进程
        if (win && !win.isDestroyed()) {
          win.webContents.send('ollama-init-progress', {
            percent: progress.percent,
            message: progress.message,
            source: progress.source,
          })
        }
      }).then((result) => {
        console.log(`[Main] Ollama initialized: ${result.source} at ${result.url}`)
        console.log('[Main] Sending ollama-ready event to renderer...')

        // 保存状态供后续请求使用
        ollamaStatus = { source: result.source, url: result.url }

        // T029.1: 通知渲染进程 Ollama 已就绪
        if (win && !win.isDestroyed()) {
          win.webContents.send('ollama-ready', {
            source: result.source,
            url: result.url,
          })
          console.log('[Main] ollama-ready event sent')
        } else {
          console.warn('[Main] Window destroyed, cannot send ollama-ready event')
        }
      }).catch((error) => {
        console.error('[Main] Ollama initialization failed:', error)
        // 不显示错误对话框,让用户通过 UI 处理
        if (win && !win.isDestroyed()) {
          win.webContents.send('ollama-init-failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          console.log('[Main] ollama-init-failed event sent')
        }
      })
    })
  }
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

// Windows/Linux: Handle deep link via second-instance
app.on('second-instance', (_event, commandLine, _workingDirectory) => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }

  // Extract deep link URL from command line
  const deepLinkUrl = commandLine.find((arg) => arg.startsWith('klee://'))
  if (deepLinkUrl) {
    handleOAuthCallback(deepLinkUrl)
  }
})

// macOS: Handle deep link via open-url
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleOAuthCallback(url)
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// T029: 应用退出时智能关闭 Ollama（不影响系统 Ollama）和数据库连接
app.on('before-quit', async (event) => {
  event.preventDefault()

  // 关闭数据库连接
  console.log('[Database] Closing connections...')
  dbManager.closeAll()
  console.log('[Database] Connections closed')

  // 关闭 Ollama（仅 embedded 版本）
  if (ollamaManager) {
    console.log('[Ollama] Shutting down...')
    await ollamaManager.shutdown()
    console.log('[Ollama] Shutdown complete')
  }

  app.exit(0)
})
