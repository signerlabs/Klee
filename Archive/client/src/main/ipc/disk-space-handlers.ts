/**
 * 磁盘空间 IPC Handlers - 磁盘空间查询的 IPC 处理器
 *
 * 功能：
 * - 获取 Ollama 模型目录所在磁盘的空间信息
 * - 提供格式化的磁盘空间数据
 */

import { ipcMain } from 'electron'
import { getOllamaDiskSpace } from '../local/services/disk-space-manager'

/**
 * 初始化磁盘空间处理器
 */
export function initDiskSpaceHandlers() {
  /**
   * disk-space:get - 获取 Ollama 磁盘空间信息
   *
   * 返回：磁盘空间信息（总空间、可用空间、已用空间、使用百分比等）
   */
  ipcMain.handle('disk-space:get', async () => {
    try {
      const diskSpace = getOllamaDiskSpace()
      return { success: true, data: diskSpace }
    } catch (error) {
      console.error('[Disk Space] Failed to get disk space:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get disk space',
      }
    }
  })

  console.log('[Disk Space Handlers] Registered disk space IPC handlers')
}
