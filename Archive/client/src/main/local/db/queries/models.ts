/**
 * 本地模型使用查询（Private Mode）
 *
 * 提供 SQLite 数据库的模型使用情况查询接口
 * 用于检查模型是否正被聊天会话使用
 */

import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../schema'
import { localChatSessions } from '../schema'

/**
 * 使用特定模型的聊天会话信息
 */
export interface ChatSessionUsingModel {
  /** 会话 ID */
  id: string

  /** 会话标题 */
  title: string

  /** 会话创建时间 */
  createdAt: Date
}

/**
 * 检查模型是否被聊天会话使用
 *
 * @param db - Drizzle 数据库实例
 * @param modelId - 模型 ID（如 'llama3:8b'）
 * @returns 是否被使用
 */
export async function isModelInUse(
  db: BetterSQLite3Database<typeof schema>,
  modelId: string
): Promise<boolean> {
  const sessions = await db
    .select({ id: localChatSessions.id })
    .from(localChatSessions)
    .where(eq(localChatSessions.model, modelId))
    .limit(1)

  return sessions.length > 0
}

/**
 * 获取使用特定模型的所有聊天会话
 *
 * @param db - Drizzle 数据库实例
 * @param modelId - 模型 ID（如 'llama3:8b'）
 * @returns 使用该模型的会话列表
 */
export async function getSessionsUsingModel(
  db: BetterSQLite3Database<typeof schema>,
  modelId: string
): Promise<ChatSessionUsingModel[]> {
  const sessions = await db
    .select({
      id: localChatSessions.id,
      title: localChatSessions.title,
      createdAt: localChatSessions.createdAt,
    })
    .from(localChatSessions)
    .where(eq(localChatSessions.model, modelId))

  return sessions
}

/**
 * 获取所有模型的使用统计
 *
 * @param db - Drizzle 数据库实例
 * @returns 模型使用统计（modelId -> 使用次数）
 */
export async function getModelUsageStats(
  db: BetterSQLite3Database<typeof schema>
): Promise<Record<string, number>> {
  const sessions = await db.select({ model: localChatSessions.model }).from(localChatSessions)

  const stats: Record<string, number> = {}
  for (const session of sessions) {
    stats[session.model] = (stats[session.model] || 0) + 1
  }

  return stats
}
