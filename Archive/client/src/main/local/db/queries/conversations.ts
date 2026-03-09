/**
 * 本地对话 CRUD 操作（Private Mode）
 *
 * 提供 SQLite 数据库的聊天会话操作接口
 */

import { eq, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'
import {
  localChatSessions,
  localChatMessages,
  type LocalChatSession,
  type NewLocalChatSession,
  insertLocalChatSessionSchema,
  updateLocalChatSessionSchema,
} from '../schema'

/**
 * 创建新的聊天会话
 */
export async function createConversation(
  db: ReturnType<typeof drizzle>,
  data: NewLocalChatSession
): Promise<LocalChatSession> {
  // 验证数据
  const validated = insertLocalChatSessionSchema.parse({
    ...data,
  })

  // 插入数据
  const [created] = await db
    .insert(localChatSessions)
    .values({
      ...validated,
      createdAt: new Date(),
    })
    .returning()

  return created
}

/**
 * 获取所有聊天会话（按创建时间倒序）
 */
export async function getAllConversations(
  db: ReturnType<typeof drizzle>
): Promise<LocalChatSession[]> {
  return db.select().from(localChatSessions).orderBy(desc(localChatSessions.createdAt)).all()
}

/**
 * 根据 ID 获取单个聊天会话
 */
export async function getConversationById(
  db: ReturnType<typeof drizzle>,
  id: string
): Promise<LocalChatSession | undefined> {
  const [conversation] = await db
    .select()
    .from(localChatSessions)
    .where(eq(localChatSessions.id, id))
    .limit(1)

  return conversation
}

/**
 * 更新聊天会话
 */
export async function updateConversation(
  db: ReturnType<typeof drizzle>,
  id: string,
  data: Partial<NewLocalChatSession>
): Promise<LocalChatSession | undefined> {
  // 验证数据
  const validated = updateLocalChatSessionSchema.parse(data)

  // 转换 availableKnowledgeBaseIds 和 availableNoteIds 为 JSON 字符串
  const updateData: Record<string, unknown> = { ...validated }

  if (validated.availableKnowledgeBaseIds) {
    updateData.availableKnowledgeBaseIds = JSON.stringify(validated.availableKnowledgeBaseIds)
  }

  if (validated.availableNoteIds) {
    updateData.availableNoteIds = JSON.stringify(validated.availableNoteIds)
  }

  // 更新数据
  const [updated] = await db
    .update(localChatSessions)
    .set(updateData)
    .where(eq(localChatSessions.id, id))
    .returning()

  return updated
}

/**
 * 删除聊天会话（级联删除相关消息）
 */
export async function deleteConversation(
  db: ReturnType<typeof drizzle>,
  id: string
): Promise<boolean> {
  const result = await db.delete(localChatSessions).where(eq(localChatSessions.id, id)).returning()

  return result.length > 0
}

/**
 * 切换聊天会话的收藏状态
 */
export async function toggleConversationStarred(
  db: ReturnType<typeof drizzle>,
  id: string
): Promise<LocalChatSession | undefined> {
  const conversation = await getConversationById(db, id)

  if (!conversation) {
    return undefined
  }

  return updateConversation(db, id, {
    starred: !conversation.starred,
  })
}

/**
 * 获取收藏的聊天会话
 */
export async function getStarredConversations(
  db: ReturnType<typeof drizzle>
): Promise<LocalChatSession[]> {
  return db
    .select()
    .from(localChatSessions)
    .where(eq(localChatSessions.starred, true))
    .orderBy(desc(localChatSessions.createdAt))
    .all()
}
