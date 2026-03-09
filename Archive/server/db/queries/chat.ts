import { asc, desc, eq, and } from "drizzle-orm"
import { db } from "../db.js"
import { chatSessions, chatMessages } from "../schema.js"
import type { UIMessage } from "ai"

/**
 * 获取用户的所有聊天记录
 */
export const getUserChats = async (userId: string) => {
  return await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      chatConfigId: chatSessions.chatConfigId,
      model: chatSessions.model,
      systemPrompt: chatSessions.systemPrompt,
      webSearchEnabled: chatSessions.webSearchEnabled,
      availableKnowledgeBaseIds: chatSessions.availableKnowledgeBaseIds,
      availableNoteIds: chatSessions.availableNoteIds,
      starred: chatSessions.starred,
      visibility: chatSessions.visibility,
      lastContext: chatSessions.lastContext,
      createdAt: chatSessions.createdAt,
    })
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.createdAt))
}

/**
 * 获取单个聊天会话
 */
export const getChatById = async (chatId: string, userId: string) => {
  const [chatRecord] = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      chatConfigId: chatSessions.chatConfigId,
      model: chatSessions.model,
      systemPrompt: chatSessions.systemPrompt,
      webSearchEnabled: chatSessions.webSearchEnabled,
      availableKnowledgeBaseIds: chatSessions.availableKnowledgeBaseIds,
      availableNoteIds: chatSessions.availableNoteIds,
      starred: chatSessions.starred,
      visibility: chatSessions.visibility,
      lastContext: chatSessions.lastContext,
      createdAt: chatSessions.createdAt,
    })
    .from(chatSessions)
    .where(and(eq(chatSessions.id, chatId), eq(chatSessions.userId, userId)))
    .limit(1)

  return chatRecord
}

/**
 * 获取单个聊天会话的所有消息
 */
export const getChatMessages = async (chatId: string) => {
  return await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      parts: chatMessages.parts,
      attachments: chatMessages.attachments,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.createdAt))
}

/**
 * 创建新的聊天会话
 */
export const createChatSession = async (data: {
  id?: string
  userId: string
  title: string
  chatConfigId?: string | null
  model: string
  systemPrompt?: string | null
  webSearchEnabled?: boolean
  availableKnowledgeBaseIds?: string[]
  availableNoteIds?: string[]
  visibility?: "public" | "private"
  starred?: boolean
  lastContext?: unknown
  createdAt?: Date
}) => {
  return await db
    .insert(chatSessions)
    .values({
      id: data.id,
      userId: data.userId,
      title: data.title,
      chatConfigId: data.chatConfigId ?? null,
      model: data.model,
      systemPrompt: data.systemPrompt ?? null,
      webSearchEnabled: data.webSearchEnabled ?? false,
      availableKnowledgeBaseIds: data.availableKnowledgeBaseIds ?? [],
      availableNoteIds: data.availableNoteIds ?? [],
      starred: data.starred ?? false,
      visibility: data.visibility ?? "private",
      lastContext: data.lastContext ?? null,
      createdAt: data.createdAt ?? new Date(),
    })
    .onConflictDoNothing({
      target: chatSessions.id,
    })
}

/**
 * 更新聊天会话的数据类型
 */
export type UpdateChatSessionData = {
  title?: string
  chatConfigId?: string | null
  model?: string
  systemPrompt?: string | null
  webSearchEnabled?: boolean
  availableKnowledgeBaseIds?: string[]
  availableNoteIds?: string[]
  visibility?: "public" | "private"
  starred?: boolean
  lastContext?: unknown
}

/**
 * 更新聊天会话
 */
export const updateChatSession = async (
  chatId: string,
  data: UpdateChatSessionData
) => {
  return await db
    .update(chatSessions)
    .set(data)
    .where(eq(chatSessions.id, chatId))
}

/**
 * 删除聊天会话
 */
export const deleteChatSession = async (chatId: string, userId: string) => {
  return await db
    .delete(chatSessions)
    .where(and(eq(chatSessions.id, chatId), eq(chatSessions.userId, userId)))
}

/**
 * 添加聊天消息
 */
export const insertChatMessage = async (data: {
  chatId: string
  messageId: string
  role: UIMessage["role"]
  parts: UIMessage["parts"]
  attachments?: unknown[]
  createdAt?: Date
}) => {
  return await db
    .insert(chatMessages)
    .values({
      id: data.messageId,
      chatId: data.chatId,
      role: data.role,
      parts: data.parts as any,
      attachments: (data.attachments ?? []) as any,
      createdAt: data.createdAt ?? new Date(),
    })
    .onConflictDoNothing({
      target: chatMessages.id,
    })
}

/**
 * 批量保存聊天消息
 */
export const saveMessages = async (data: {
  messages: Array<{
    id: string
    chatId: string
    role: UIMessage["role"]
    parts: UIMessage["parts"]
    attachments?: unknown[]
    createdAt?: Date
  }>
}) => {
  if (data.messages.length === 0) {
    return
  }

  return await db
    .insert(chatMessages)
    .values(
      data.messages.map((msg) => ({
        id: msg.id,
        chatId: msg.chatId,
        role: msg.role,
        parts: msg.parts as any,
        attachments: (msg.attachments ?? []) as any,
        createdAt: msg.createdAt ?? new Date(),
      }))
    )
    .onConflictDoNothing({
      target: chatMessages.id,
    })
}

/**
 * 创建或更新聊天会话，并添加消息
 */
export const upsertChatWithMessage = async (data: {
  chatId: string
  userId: string
  title: string
  chatConfigId?: string | null
  model: string
  systemPrompt?: string | null
  webSearchEnabled?: boolean
  availableKnowledgeBaseIds?: string[]
  visibility?: "public" | "private"
  messageId: string
  messageRole: UIMessage["role"]
  messageParts: UIMessage["parts"]
  messageAttachments?: unknown[]
}) => {
  const now = new Date()
  const chatId = data.chatId

  // 检查聊天会话是否存在
  const [existingChat] = await db
    .select({ id: chatSessions.id, title: chatSessions.title })
    .from(chatSessions)
    .where(
      and(eq(chatSessions.id, chatId), eq(chatSessions.userId, data.userId))
    )
    .limit(1)

  if (!existingChat) {
    // 创建新聊天
    await createChatSession({
      id: chatId,
      userId: data.userId,
      title: data.title,
      chatConfigId: data.chatConfigId,
      model: data.model,
      systemPrompt: data.systemPrompt,
      webSearchEnabled: data.webSearchEnabled,
      availableKnowledgeBaseIds: data.availableKnowledgeBaseIds,
      visibility: data.visibility ?? "private",
      createdAt: now,
    })

    const [createdChat] = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(
        and(eq(chatSessions.id, chatId), eq(chatSessions.userId, data.userId))
      )
      .limit(1)

    if (!createdChat) {
      throw new Error("CHAT_OWNERSHIP_MISMATCH")
    }
  } else if (
    data.title &&
    (existingChat.title === "New Chat" ||
      existingChat.title.trim().length === 0)
  ) {
    // 如果是默认标题则更新
    await updateChatSession(chatId, { title: data.title })
  }

  // 插入消息
  await insertChatMessage({
    chatId,
    messageId: data.messageId,
    role: data.messageRole,
    parts: data.messageParts,
    attachments: data.messageAttachments,
    createdAt: now,
  })

  return chatId
}
