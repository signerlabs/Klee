/**
 * 模型管理 IPC Handlers - 模型删除和使用检测的 IPC 处理器
 *
 * 功能：
 * - 删除模型（安全删除，检查使用情况）
 * - 检查模型是否被聊天会话使用
 */

import { ipcMain } from 'electron'
import { dbManager } from '../local/db/connection-manager'
import { deleteModel, checkModelInUse } from '../local/services/ollama-model-manager'

/**
 * 初始化模型管理处理器
 */
export function initModelHandlers() {
  /**
   * model:delete - 删除模型
   *
   * 参数：
   * - modelId: 模型 ID（如 'llama3:8b'）
   * - force: 是否强制删除（可选，默认 false）
   *
   * 返回：删除结果（包含成功/失败、错误原因、使用该模型的会话列表等）
   */
  ipcMain.handle('model:delete', async (event, modelId: string, force: boolean = false) => {
    try {
      const db = await dbManager.getConnection('private')
      if (!db) {
        return {
          success: false,
          error: 'Database not available',
        }
      }
      const result = await deleteModel(db, modelId, force)

      if (result.success) {
        console.log(`[Model] Successfully deleted model: ${modelId}`)
      } else {
        console.warn(`[Model] Failed to delete model ${modelId}:`, result.error)
      }

      return { success: result.success, data: result }
    } catch (error) {
      console.error(`[Model] Error deleting model ${modelId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete model',
      }
    }
  })

  /**
   * model:check-in-use - 检查模型是否被使用
   *
   * 参数：
   * - modelId: 模型 ID（如 'llama3:8b'）
   *
   * 返回：使用情况（是否被使用、使用该模型的会话列表）
   */
  ipcMain.handle('model:check-in-use', async (event, modelId: string) => {
    try {
      const db = await dbManager.getConnection('private')
      if (!db) {
        return {
          success: false,
          error: 'Database not available',
        }
      }
      const usage = await checkModelInUse(db, modelId)

      return { success: true, data: usage }
    } catch (error) {
      console.error(`[Model] Error checking model usage for ${modelId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check model usage',
      }
    }
  })

  console.log('[Model Handlers] Registered model management IPC handlers')
}
