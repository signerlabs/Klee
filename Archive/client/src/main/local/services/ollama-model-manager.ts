/**
 * Ollama 模型管理服务
 *
 * 提供模型删除和使用检测功能
 *
 * 特性：
 * - 检查模型是否被聊天会话使用
 * - 安全删除模型（防止删除正在使用的模型）
 * - 调用 Ollama API 执行删除
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { isModelInUse, getSessionsUsingModel, ChatSessionUsingModel } from '../db/queries/models'

/**
 * 模型删除失败原因
 */
export type ModelDeleteFailureReason =
  | 'in_use' // 被聊天会话使用
  | 'not_found' // 模型不存在
  | 'ollama_error' // Ollama API 错误
  | 'unknown' // 未知错误

/**
 * 模型删除结果
 */
export interface ModelDeleteResult {
  /** 是否成功 */
  success: boolean

  /** 错误消息（如果失败） */
  error?: string

  /** 失败原因（如果失败） */
  reason?: ModelDeleteFailureReason

  /** 使用该模型的会话列表（如果失败原因是 in_use） */
  sessionsUsingModel?: ChatSessionUsingModel[]
}

/**
 * 删除模型
 *
 * @param db - Drizzle 数据库实例
 * @param modelId - 模型 ID（如 'llama3:8b'）
 * @param force - 是否强制删除（忽略使用检测）
 * @returns 删除结果
 */
export async function deleteModel(
  db: BetterSQLite3Database<typeof schema>,
  modelId: string,
  force: boolean = false
): Promise<ModelDeleteResult> {
  // 1. 检查模型是否被使用（如果不强制删除）
  if (!force) {
    const inUse = await isModelInUse(db, modelId)

    if (inUse) {
      const sessions = await getSessionsUsingModel(db, modelId)
      return {
        success: false,
        reason: 'in_use',
        error: `Model is used by ${sessions.length} session(s)`,
        sessionsUsingModel: sessions,
      }
    }
  }

  // 2. 调用 Ollama API 删除
  try {
    const response = await fetch('http://localhost:11434/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || response.statusText

      // 检查是否是"模型正在使用"错误
      if (errorMessage.includes('is in use')) {
        return {
          success: false,
          reason: 'in_use',
          error: 'Model is currently running in Ollama',
        }
      }

      // 检查是否是"模型未找到"错误
      if (response.status === 404 || errorMessage.includes('not found')) {
        return {
          success: false,
          reason: 'not_found',
          error: 'Model not found',
        }
      }

      return {
        success: false,
        reason: 'ollama_error',
        error: errorMessage,
      }
    }

    return { success: true }
  } catch (error) {
    console.error('[OllamaModelManager] Failed to delete model:', error)
    return {
      success: false,
      reason: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 检查模型是否被使用
 *
 * @param db - Drizzle 数据库实例
 * @param modelId - 模型 ID（如 'llama3:8b'）
 * @returns 使用检测结果
 */
export async function checkModelInUse(
  db: BetterSQLite3Database<typeof schema>,
  modelId: string
): Promise<{
  inUse: boolean
  sessions: ChatSessionUsingModel[]
}> {
  const inUse = await isModelInUse(db, modelId)
  const sessions = inUse ? await getSessionsUsingModel(db, modelId) : []

  return { inUse, sessions }
}
