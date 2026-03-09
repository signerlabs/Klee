/**
 * Mode IPC Handlers - 运行模式切换的 IPC 处理器
 *
 * 功能：
 * - 处理模式切换请求（Cloud ↔ Private）
 * - 切换数据库连接
 * - 返回当前模式状态
 */

import { ipcMain, IpcMainEvent } from 'electron'
import { dbManager } from '../local/db/connection-manager'

type RunMode = 'cloud' | 'private'

let currentMode: RunMode = 'cloud' // 默认为 Cloud 模式

/**
 * 初始化模式处理器
 */
export function initModeHandlers() {

  /**
   * T030 & T032: mode:switch - 切换运行模式
   *
   * 处理：
   * 1. 接收新模式（cloud/private）
   * 2. 调用 DatabaseConnectionManager 切换数据库连接
   * 3. 更新当前模式状态
   */
  ipcMain.on('mode:switch', (event: IpcMainEvent, newMode: RunMode) => {
    try {
      console.log(`[Mode Switch] ${currentMode} → ${newMode}`)

      // T032: 切换数据库连接
      dbManager.switchMode(newMode)
      console.log(`[Mode Switch] Database connection switched to ${newMode}`)

      currentMode = newMode
      console.log(`[Mode Switch] Successfully switched to ${newMode} mode`)

      // 可选：发送确认事件到渲染进程
      event.sender.send('mode:switched', { mode: newMode, success: true })
    } catch (error) {
      console.error(`[Mode Switch] Failed to switch to ${newMode} mode:`, error)
      event.sender.send('mode:switched', {
        mode: currentMode, // 保持当前模式
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * T031: mode:get-current - 获取当前运行模式
   *
   * 返回：当前模式（cloud/private）
   */
  ipcMain.handle('mode:get-current', async () => {
    return { mode: currentMode }
  })

  console.log('[Mode Handlers] Registered mode IPC handlers')
}

/**
 * 获取当前模式（供其他模块使用）
 */
export function getCurrentMode(): RunMode {
  return currentMode
}
