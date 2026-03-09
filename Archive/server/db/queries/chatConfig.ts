import { asc, desc, eq, and, or, inArray } from "drizzle-orm"
import { db } from "../db.js"
import {
  chatConfigs,
  chatConfigKnowledgeBases,
  knowledgeBases,
} from "../schema.js"
import { generateUniqueShareSlug } from "../../src/lib/slug-generator.js"

/**
 * 获取用户的所有聊天配置
 */
export const getUserChatConfigs = async (userId: string) => {
  return await db
    .select({
      id: chatConfigs.id,
      name: chatConfigs.name,
      avatar: chatConfigs.avatar,
      defaultModel: chatConfigs.defaultModel,
      systemPrompt: chatConfigs.systemPrompt,
      webSearchEnabled: chatConfigs.webSearchEnabled,
      isPublic: chatConfigs.isPublic,
      shareSlug: chatConfigs.shareSlug,
      sourceShareSlug: chatConfigs.sourceShareSlug,
      createdAt: chatConfigs.createdAt,
      updatedAt: chatConfigs.updatedAt,
    })
    .from(chatConfigs)
    .where(eq(chatConfigs.userId, userId))
    .orderBy(desc(chatConfigs.updatedAt))
}

/**
 * 获取单个聊天配置
 */
export const getChatConfigById = async (configId: string, userId: string) => {
  const [config] = await db
    .select({
      id: chatConfigs.id,
      name: chatConfigs.name,
      defaultModel: chatConfigs.defaultModel,
      systemPrompt: chatConfigs.systemPrompt,
      webSearchEnabled: chatConfigs.webSearchEnabled,
      isPublic: chatConfigs.isPublic,
      shareSlug: chatConfigs.shareSlug,
      createdAt: chatConfigs.createdAt,
      updatedAt: chatConfigs.updatedAt,
    })
    .from(chatConfigs)
    .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)))
    .limit(1)

  return config
}

/**
 * 通过 shareSlug 获取公开的聊天配置
 */
export const getChatConfigByShareSlug = async (shareSlug: string) => {
  const [config] = await db
    .select({
      id: chatConfigs.id,
      userId: chatConfigs.userId,
      name: chatConfigs.name,
      defaultModel: chatConfigs.defaultModel,
      systemPrompt: chatConfigs.systemPrompt,
      webSearchEnabled: chatConfigs.webSearchEnabled,
      isPublic: chatConfigs.isPublic,
      shareSlug: chatConfigs.shareSlug,
      createdAt: chatConfigs.createdAt,
      updatedAt: chatConfigs.updatedAt,
    })
    .from(chatConfigs)
    .where(
      and(eq(chatConfigs.shareSlug, shareSlug), eq(chatConfigs.isPublic, true))
    )
    .limit(1)

  return config
}

/**
 * 获取配置关联的知识库
 */
export const getChatConfigKnowledgeBases = async (configId: string) => {
  return await db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
    })
    .from(chatConfigKnowledgeBases)
    .innerJoin(
      knowledgeBases,
      eq(chatConfigKnowledgeBases.knowledgeBaseId, knowledgeBases.id)
    )
    .where(eq(chatConfigKnowledgeBases.chatConfigId, configId))
    .orderBy(asc(knowledgeBases.name))
}

/**
 * 创建新的聊天配置
 */
export const createChatConfig = async (data: {
  userId: string
  name: string
  avatar?: string | null
  defaultModel: string
  systemPrompt?: string | null
  webSearchEnabled?: boolean
  isPublic?: boolean
  shareSlug?: string | null
  sourceShareSlug?: string | null
}) => {
  const [config] = await db
    .insert(chatConfigs)
    .values({
      userId: data.userId,
      name: data.name,
      avatar: data.avatar ?? null,
      defaultModel: data.defaultModel,
      systemPrompt: data.systemPrompt ?? null,
      webSearchEnabled: data.webSearchEnabled ?? false,
      isPublic: data.isPublic ?? false,
      shareSlug: data.shareSlug ?? null,
      sourceShareSlug: data.sourceShareSlug ?? null,
    })
    .returning()

  return config
}

/**
 * 更新聊天配置
 */
export const updateChatConfig = async (
  configId: string,
  userId: string,
  data: {
    name?: string
    defaultModel?: string
    systemPrompt?: string | null
    webSearchEnabled?: boolean
    isPublic?: boolean
    shareSlug?: string | null
  }
) => {
  const [config] = await db
    .update(chatConfigs)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)))
    .returning()

  return config
}

/**
 * T066: 删除 ChatConfig（Agent）
 * FR-043 至 FR-047: 删除前先取消分享，级联删除知识库关联
 */
export const deleteChatConfig = async (configId: string, userId: string) => {
  // 1. 验证 Agent 所有权
  const [existingConfig] = await db
    .select({ isPublic: chatConfigs.isPublic, name: chatConfigs.name })
    .from(chatConfigs)
    .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)))
    .limit(1)

  if (!existingConfig) {
    throw new Error('Agent not found or access denied')
  }

  // 2. T066, FR-046: 如果 isPublic=true，先取消分享
  if (existingConfig.isPublic) {
    await db
      .update(chatConfigs)
      .set({ isPublic: false, updatedAt: new Date() })
      .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)))
  }

  // 3. FR-044: 删除 Agent（会自动级联删除 chatConfigKnowledgeBases）
  // FR-045: 已安装的副本（sourceShareSlug 指向此 Agent）不受影响
  const [deleted] = await db
    .delete(chatConfigs)
    .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)))
    .returning()

  return deleted
}

/**
 * 添加知识库到配置
 */
export const addKnowledgeBaseToChatConfig = async (
  configId: string,
  knowledgeBaseId: string
) => {
  await db
    .insert(chatConfigKnowledgeBases)
    .values({
      chatConfigId: configId,
      knowledgeBaseId: knowledgeBaseId,
    })
    .onConflictDoNothing()
}

/**
 * 从配置中移除知识库
 */
export const removeKnowledgeBaseFromChatConfig = async (
  configId: string,
  knowledgeBaseId: string
) => {
  await db
    .delete(chatConfigKnowledgeBases)
    .where(
      and(
        eq(chatConfigKnowledgeBases.chatConfigId, configId),
        eq(chatConfigKnowledgeBases.knowledgeBaseId, knowledgeBaseId)
      )
    )
}

/**
 * 批量设置配置的知识库
 */
export const setChatConfigKnowledgeBases = async (
  configId: string,
  knowledgeBaseIds: string[]
) => {
  // 先删除所有现有关联
  await db
    .delete(chatConfigKnowledgeBases)
    .where(eq(chatConfigKnowledgeBases.chatConfigId, configId))

  // 如果有新的知识库，批量插入
  if (knowledgeBaseIds.length > 0) {
    await db
      .insert(chatConfigKnowledgeBases)
      .values(
        knowledgeBaseIds.map((kbId) => ({
          chatConfigId: configId,
          knowledgeBaseId: kbId,
        }))
      )
      .onConflictDoNothing()
  }
}

/**
 * 分享或取消分享 ChatConfig
 * 如果 isPublic=true 且 shareSlug 为空，自动生成 shareSlug
 * T018: 使用 generateUniqueShareSlug() 确保唯一性
 * T019: 验证必填字段 (name, defaultModel)
 */
export const shareChatConfig = async (
  configId: string,
  userId: string,
  isPublic: boolean
) => {
  // 获取现有配置
  const existingConfig = await getChatConfigById(configId, userId)
  if (!existingConfig) {
    throw new Error("Chat config not found")
  }

  // 验证Agent完整性（分享时必须有必要字段）
  if (isPublic) {
    if (!existingConfig.name || !existingConfig.defaultModel) {
      throw new Error("Agent must have name and defaultModel to be shared")
    }
    // avatar 和 systemPrompt 可以为空，但建议有
  }

  // 如果要分享且没有 shareSlug，生成一个
  let shareSlug = existingConfig.shareSlug
  if (isPublic && !shareSlug) {
    shareSlug = await generateUniqueShareSlug()
  }

  // 更新配置
  const [config] = await db
    .update(chatConfigs)
    .set({
      isPublic,
      shareSlug: isPublic ? shareSlug : existingConfig.shareSlug, // 取消分享时保留 slug
      updatedAt: new Date(),
    })
    .where(and(eq(chatConfigs.id, configId), eq(chatConfigs.userId, userId)))
    .returning()

  return config
}

/**
 * T040: 安装 Agent（从市场复制 ChatConfig）
 * 从市场安装一个公开的 Agent 到用户账户
 */
export const installAgent = async (shareSlug: string, userId: string) => {
  // 1. 查找源 Agent（必须是公开的）
  const [sourceAgent] = await db
    .select({
      id: chatConfigs.id,
      userId: chatConfigs.userId,
      name: chatConfigs.name,
      avatar: chatConfigs.avatar,
      defaultModel: chatConfigs.defaultModel,
      systemPrompt: chatConfigs.systemPrompt,
      webSearchEnabled: chatConfigs.webSearchEnabled,
      shareSlug: chatConfigs.shareSlug,
    })
    .from(chatConfigs)
    .where(
      and(eq(chatConfigs.shareSlug, shareSlug), eq(chatConfigs.isPublic, true))
    )
    .limit(1)

  if (!sourceAgent) {
    throw new Error("Agent not found or not publicly shared")
  }

  // 1.5. 检查是否是原作者（不能安装自己的 Agent）
  if (sourceAgent.userId === userId) {
    throw new Error("Cannot install your own agent")
  }

  // 2. T041: 检查是否已安装（防止重复安装）
  const [existing] = await db
    .select({ id: chatConfigs.id })
    .from(chatConfigs)
    .where(
      and(
        eq(chatConfigs.userId, userId),
        eq(chatConfigs.sourceShareSlug, shareSlug)
      )
    )
    .limit(1)

  if (existing) {
    throw new Error("Agent already installed")
  }

  // 3. 创建 Agent 副本
  const [newAgent] = await db
    .insert(chatConfigs)
    .values({
      userId,
      name: sourceAgent.name,
      avatar: sourceAgent.avatar,
      defaultModel: sourceAgent.defaultModel,
      systemPrompt: sourceAgent.systemPrompt,
      webSearchEnabled: sourceAgent.webSearchEnabled,
      isPublic: false,
      sourceShareSlug: shareSlug,
    })
    .returning()

  // 4. T035: 复制知识库关联（仅复制可访问的知识库）
  const sourceKbLinks = await db
    .select({
      knowledgeBaseId: chatConfigKnowledgeBases.knowledgeBaseId,
    })
    .from(chatConfigKnowledgeBases)
    .where(eq(chatConfigKnowledgeBases.chatConfigId, sourceAgent.id))

  if (sourceKbLinks.length > 0) {
    // 获取所有关联的知识库ID
    const kbIds = sourceKbLinks.map((link) => link.knowledgeBaseId)

    // 过滤出用户可访问的知识库（公开的或用户拥有的）
    const accessibleKbs = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(
        and(
          inArray(knowledgeBases.id, kbIds),
          or(
            eq(knowledgeBases.isPublic, true),
            eq(knowledgeBases.userId, userId)
          )
        )
      )

    const accessibleKbIds = accessibleKbs.map((kb) => kb.id)

    // 仅关联可访问的知识库
    if (accessibleKbIds.length > 0) {
      await db.insert(chatConfigKnowledgeBases).values(
        accessibleKbIds.map((kbId) => ({
          chatConfigId: newAgent.id,
          knowledgeBaseId: kbId,
        }))
      )
    }
  }

  return newAgent
}

/**
 * T041: 检查 Agent 是否已安装
 */
export const checkAgentInstalled = async (
  userId: string,
  shareSlug: string
): Promise<{ isInstalled: boolean; isOwner: boolean }> => {
  // 检查是否已安装（通过 sourceShareSlug）
  const [existing] = await db
    .select({ id: chatConfigs.id })
    .from(chatConfigs)
    .where(
      and(
        eq(chatConfigs.userId, userId),
        eq(chatConfigs.sourceShareSlug, shareSlug)
      )
    )
    .limit(1)

  // 检查是否是原作者
  const [owner] = await db
    .select({ id: chatConfigs.id })
    .from(chatConfigs)
    .where(
      and(
        eq(chatConfigs.userId, userId),
        eq(chatConfigs.shareSlug, shareSlug),
        eq(chatConfigs.isPublic, true)
      )
    )
    .limit(1)

  return {
    isInstalled: !!existing,
    isOwner: !!owner,
  }
}
