/**
 * 本地消息 CRUD 操作（Private Mode）
 *
 * 提供 SQLite 数据库的聊天消息操作接口
 */

import { eq, and, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'
import {
  localChatMessages,
  type LocalChatMessage,
  type NewLocalChatMessage,
  insertLocalChatMessageSchema,
} from '../schema'

/**
 * 创建新的聊天消息
 */
export async function createMessage(
  db: ReturnType<typeof drizzle>,
  data: Omit<NewLocalChatMessage, 'createdAt'>
): Promise<LocalChatMessage> {
  // 验证数据
  const validated = insertLocalChatMessageSchema.parse({
    ...data,
  })

  // 插入数据
  const [created] = await db
    .insert(localChatMessages)
    .values({
      ...validated,
      createdAt: new Date(),
    })
    .returning()

  return created
}

/**
 * 批量创建消息（用于流式响应后保存多条消息）
 */
export async function createMessages(
  db: ReturnType<typeof drizzle>,
  messages: Omit<NewLocalChatMessage, 'createdAt'>[]
): Promise<LocalChatMessage[]> {
  if (messages.length === 0) {
    return []
  }

  // 验证所有消息数据
  const validatedMessages = messages.map((msg) =>
    insertLocalChatMessageSchema.parse({
      ...msg,
    })
  )

  // 批量插入
  const created = await db
    .insert(localChatMessages)
    .values(
      validatedMessages.map((msg) => ({
        ...msg,
        createdAt: new Date(),
      }))
    )
    .returning()

  return created
}

/**
 * 获取指定聊天会话的所有消息（按时间升序）
 */
export async function getMessagesByChatId(
  db: ReturnType<typeof drizzle>,
  chatId: string
): Promise<LocalChatMessage[]> {
  return db
    .select()
    .from(localChatMessages)
    .where(eq(localChatMessages.chatId, chatId))
    .orderBy(localChatMessages.createdAt) // 升序：最早的消息在前
    .all()
}

/**
 * 根据 ID 获取单个消息
 */
export async function getMessageById(
  db: ReturnType<typeof drizzle>,
  id: string
): Promise<LocalChatMessage | undefined> {
  const [message] = await db
    .select()
    .from(localChatMessages)
    .where(eq(localChatMessages.id, id))
    .limit(1)

  return message
}

/**
 * 删除指定聊天会话的所有消息
 */
export async function deleteMessagesByChatId(
  db: ReturnType<typeof drizzle>,
  chatId: string
): Promise<number> {
  const result = await db
    .delete(localChatMessages)
    .where(eq(localChatMessages.chatId, chatId))
    .returning()

  return result.length
}

/**
 * 删除单个消息
 */
export async function deleteMessage(
  db: ReturnType<typeof drizzle>,
  id: string
): Promise<boolean> {
  const result = await db.delete(localChatMessages).where(eq(localChatMessages.id, id)).returning()

  return result.length > 0
}

/**
 * 获取聊天会话的最后一条消息
 */
export async function getLastMessageByChatId(
  db: ReturnType<typeof drizzle>,
  chatId: string
): Promise<LocalChatMessage | undefined> {
  const [lastMessage] = await db
    .select()
    .from(localChatMessages)
    .where(eq(localChatMessages.chatId, chatId))
    .orderBy(desc(localChatMessages.createdAt))
    .limit(1)

  return lastMessage
}

/**
 * 获取聊天会话的消息数量
 */
export async function getMessageCountByChatId(
  db: ReturnType<typeof drizzle>,
  chatId: string
): Promise<number> {
  const messages = await getMessagesByChatId(db, chatId)
  return messages.length
}
