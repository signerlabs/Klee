// Marketplace 查询函数
// 用于市场浏览、搜索和详情查询

import { db } from '../db.js'
import { chatConfigs, knowledgeBases, chatConfigKnowledgeBases, knowledgeBaseFiles } from '../schema.js'
import { eq, and, or, ilike, desc } from 'drizzle-orm'

/**
 * 获取公开的 Agents (分页 + 搜索)
 */
export const getPublicAgents = async (
  page: number = 1,
  limit: number = 20,
  search?: string
) => {
  const offset = (page - 1) * limit

  let query = db
    .select({
      id: chatConfigs.id,
      avatar: chatConfigs.avatar,
      name: chatConfigs.name,
      systemPrompt: chatConfigs.systemPrompt,
      defaultModel: chatConfigs.defaultModel,
      shareSlug: chatConfigs.shareSlug,
      userId: chatConfigs.userId,
      webSearchEnabled: chatConfigs.webSearchEnabled,
      updatedAt: chatConfigs.updatedAt,
    })
    .from(chatConfigs)
    .where(
      search
        ? and(
            eq(chatConfigs.isPublic, true),
            or(
              ilike(chatConfigs.name, `%${search}%`),
              ilike(chatConfigs.systemPrompt, `%${search}%`)
            )
          )
        : eq(chatConfigs.isPublic, true)
    )
    .orderBy(desc(chatConfigs.updatedAt))
    .limit(limit)
    .offset(offset)

  return await query
}

/**
 * 获取公开的知识库 (分页 + 搜索)
 */
export const getPublicKnowledgeBases = async (
  page: number = 1,
  limit: number = 20,
  search?: string
) => {
  const offset = (page - 1) * limit

  let query = db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
      shareSlug: knowledgeBases.shareSlug,
      userId: knowledgeBases.userId,
      updatedAt: knowledgeBases.updatedAt,
    })
    .from(knowledgeBases)
    .where(
      search
        ? and(
            eq(knowledgeBases.isPublic, true),
            or(
              ilike(knowledgeBases.name, `%${search}%`),
              ilike(knowledgeBases.description, `%${search}%`)
            )
          )
        : eq(knowledgeBases.isPublic, true)
    )
    .orderBy(desc(knowledgeBases.updatedAt))
    .limit(limit)
    .offset(offset)

  return await query
}

/**
 * 通过 shareSlug 获取 Agent 详情 (包含关联的知识库)
 */
export const getAgentByShareSlug = async (shareSlug: string) => {
  const [agent] = await db
    .select()
    .from(chatConfigs)
    .where(and(eq(chatConfigs.shareSlug, shareSlug), eq(chatConfigs.isPublic, true)))
    .limit(1)

  if (!agent) return null

  // 查询关联的知识库
  const knowledgeBaseList = await db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
      isPublic: knowledgeBases.isPublic,
      shareSlug: knowledgeBases.shareSlug,
    })
    .from(chatConfigKnowledgeBases)
    .innerJoin(
      knowledgeBases,
      eq(chatConfigKnowledgeBases.knowledgeBaseId, knowledgeBases.id)
    )
    .where(eq(chatConfigKnowledgeBases.chatConfigId, agent.id))

  return { ...agent, knowledgeBases: knowledgeBaseList }
}

/**
 * 通过 shareSlug 获取知识库详情 (包含文件列表)
 */
export const getKnowledgeBaseByShareSlug = async (shareSlug: string) => {
  const [knowledgeBase] = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(eq(knowledgeBases.shareSlug, shareSlug), eq(knowledgeBases.isPublic, true))
    )
    .limit(1)

  if (!knowledgeBase) return null

  // 查询关联的文件列表
  const files = await db
    .select({
      id: knowledgeBaseFiles.id,
      fileName: knowledgeBaseFiles.fileName,
      fileSize: knowledgeBaseFiles.fileSize,
      fileType: knowledgeBaseFiles.fileType,
      status: knowledgeBaseFiles.status,
      createdAt: knowledgeBaseFiles.createdAt,
    })
    .from(knowledgeBaseFiles)
    .where(eq(knowledgeBaseFiles.knowledgeBaseId, knowledgeBase.id))
    .orderBy(desc(knowledgeBaseFiles.createdAt))

  return { ...knowledgeBase, files }
}

/**
 * 统计公开 Agents 数量 (用于分页)
 */
export const countPublicAgents = async (search?: string) => {
  const result = await db
    .select({ count: chatConfigs.id })
    .from(chatConfigs)
    .where(
      search
        ? and(
            eq(chatConfigs.isPublic, true),
            or(
              ilike(chatConfigs.name, `%${search}%`),
              ilike(chatConfigs.systemPrompt, `%${search}%`)
            )
          )
        : eq(chatConfigs.isPublic, true)
    )

  return result.length
}

/**
 * 统计公开知识库数量 (用于分页)
 */
export const countPublicKnowledgeBases = async (search?: string) => {
  const result = await db
    .select({ count: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      search
        ? and(
            eq(knowledgeBases.isPublic, true),
            or(
              ilike(knowledgeBases.name, `%${search}%`),
              ilike(knowledgeBases.description, `%${search}%`)
            )
          )
        : eq(knowledgeBases.isPublic, true)
    )

  return result.length
}
