/**
 * Knowledge Base Queries
 *
 * 知识库数据库查询函数 (Private Mode)
 */

import { eq, desc, and } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import {
  localKnowledgeBases,
  type LocalKnowledgeBase,
  type NewLocalKnowledgeBase,
  updateLocalKnowledgeBaseSchema,
} from '../schema'

/**
 * 查询所有知识库 (按星标和创建时间排序)
 *
 * @param db - 数据库连接
 * @returns 知识库列表
 *
 * @example
 * ```typescript
 * const kbs = await getAllKnowledgeBases(db)
 * console.log(kbs.length) // 5
 * ```
 */
export async function getAllKnowledgeBases(
  db: BetterSQLite3Database<typeof schema>
): Promise<LocalKnowledgeBase[]> {
  try {
    // 按 starred DESC, createdAt DESC 排序
    const knowledgeBases = await db
      .select()
      .from(localKnowledgeBases)
      .orderBy(desc(localKnowledgeBases.starred), desc(localKnowledgeBases.createdAt))

    console.log(`[KnowledgeBaseQueries] Found ${knowledgeBases.length} knowledge bases`)

    return knowledgeBases
  } catch (error) {
    console.error('[KnowledgeBaseQueries] Failed to get all knowledge bases:', error)
    throw new Error('Failed to get knowledge bases')
  }
}

/**
 * 查询单个知识库 (通过 ID)
 *
 * @param db - 数据库连接
 * @param id - 知识库 ID
 * @returns 知识库详情，如果不存在返回 null
 *
 * @example
 * ```typescript
 * const kb = await getKnowledgeBaseById(db, "uuid-123")
 * if (kb) {
 *   console.log(kb.name)
 * }
 * ```
 */
export async function getKnowledgeBaseById(
  db: BetterSQLite3Database<typeof schema>,
  id: string
): Promise<LocalKnowledgeBase | null> {
  try {
    const [knowledgeBase] = await db
      .select()
      .from(localKnowledgeBases)
      .where(eq(localKnowledgeBases.id, id))
      .limit(1)

    if (!knowledgeBase) {
      console.warn(`[KnowledgeBaseQueries] Knowledge base not found: ${id}`)
      return null
    }

    return knowledgeBase
  } catch (error) {
    console.error('[KnowledgeBaseQueries] Failed to get knowledge base by ID:', error)
    throw new Error('Failed to get knowledge base')
  }
}

/**
 * 创建知识库
 *
 * @param db - 数据库连接
 * @param input - 知识库输入数据
 * @returns 创建的知识库
 * @throws Error 如果创建失败
 *
 * @example
 * ```typescript
 * const kb = await createKnowledgeBase(db, {
 *   name: "AI Research Papers",
 *   description: "Collection of AI papers"
 * })
 * console.log(kb.id) // "uuid-123"
 * ```
 */
export async function createKnowledgeBase(
  db: BetterSQLite3Database<typeof schema>,
  input: Omit<NewLocalKnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>
): Promise<LocalKnowledgeBase> {
  try {
    // 生成 UUID 和时间戳
    const now = new Date()
    const newKbId = randomUUID()
    const knowledgeBase: NewLocalKnowledgeBase = {
      ...input,
      id: newKbId,
      starred: false, // 默认值
      createdAt: now,
      updatedAt: now,
    }

    // 插入数据库
    await db.insert(localKnowledgeBases).values(knowledgeBase)

    console.log(`[KnowledgeBaseQueries] Created knowledge base: ${knowledgeBase.id}`)

    // 返回创建的知识库
    const created = await getKnowledgeBaseById(db, knowledgeBase.id)
    if (!created) {
      throw new Error('Failed to retrieve created knowledge base')
    }

    return created
  } catch (error) {
    console.error('[KnowledgeBaseQueries] Failed to create knowledge base:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to create knowledge base')
  }
}

/**
 * 更新知识库
 *
 * @param db - 数据库连接
 * @param id - 知识库 ID
 * @param input - 更新数据
 * @returns 更新后的知识库，如果不存在返回 null
 * @throws Error 如果更新失败
 *
 * @example
 * ```typescript
 * const kb = await updateKnowledgeBase(db, "uuid-123", {
 *   name: "Updated Name",
 *   starred: true
 * })
 * ```
 */
export async function updateKnowledgeBase(
  db: BetterSQLite3Database<typeof schema>,
  id: string,
  input: Partial<Omit<LocalKnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<LocalKnowledgeBase | null> {
  try {
    // 验证输入
    const validated = updateLocalKnowledgeBaseSchema.parse(input)

    // 检查知识库是否存在
    const existing = await getKnowledgeBaseById(db, id)
    if (!existing) {
      return null
    }

    // 更新数据库 (自动更新 updatedAt)
    await db
      .update(localKnowledgeBases)
      .set({
        ...validated,
        updatedAt: new Date(),
      })
      .where(eq(localKnowledgeBases.id, id))

    console.log(`[KnowledgeBaseQueries] Updated knowledge base: ${id}`)

    // 返回更新后的知识库
    return await getKnowledgeBaseById(db, id)
  } catch (error) {
    console.error('[KnowledgeBaseQueries] Failed to update knowledge base:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to update knowledge base')
  }
}

/**
 * 删除知识库
 *
 * @param db - 数据库连接
 * @param id - 知识库 ID
 * @returns 是否成功删除
 * @throws Error 如果删除失败
 *
 * @example
 * ```typescript
 * const deleted = await deleteKnowledgeBase(db, "uuid-123")
 * console.log(deleted) // true
 * ```
 *
 * 注意: 此函数仅删除 SQLite 记录
 * 调用方需要手动处理:
 * 1. 删除 LanceDB 向量表 (vectorDb.dropTable)
 * 2. 删除本地文件 (storageService.deleteDirectory)
 */
export async function deleteKnowledgeBase(
  db: BetterSQLite3Database<typeof schema>,
  id: string
): Promise<boolean> {
  try {
    // 检查知识库是否存在
    const existing = await getKnowledgeBaseById(db, id)
    if (!existing) {
      console.warn(`[KnowledgeBaseQueries] Knowledge base not found: ${id}`)
      return false
    }

    // 删除知识库 (外键约束会自动级联删除文件记录)
    await db.delete(localKnowledgeBases).where(eq(localKnowledgeBases.id, id))

    console.log(`[KnowledgeBaseQueries] Deleted knowledge base: ${id}`)

    return true
  } catch (error) {
    console.error('[KnowledgeBaseQueries] Failed to delete knowledge base:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to delete knowledge base')
  }
}

/**
 * 切换知识库星标状态
 *
 * @param db - 数据库连接
 * @param id - 知识库 ID
 * @returns 更新后的知识库，如果不存在返回 null
 *
 * @example
 * ```typescript
 * const kb = await toggleKnowledgeBaseStar(db, "uuid-123")
 * console.log(kb.starred) // true 或 false
 * ```
 */
export async function toggleKnowledgeBaseStar(
  db: BetterSQLite3Database<typeof schema>,
  id: string
): Promise<LocalKnowledgeBase | null> {
  try {
    // 获取当前星标状态
    const existing = await getKnowledgeBaseById(db, id)
    if (!existing) {
      return null
    }

    // 切换星标状态
    return await updateKnowledgeBase(db, id, {
      starred: !existing.starred,
    })
  } catch (error) {
    console.error('[KnowledgeBaseQueries] Failed to toggle star:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to toggle star')
  }
}

/**
 * 获取星标知识库
 *
 * @param db - 数据库连接
 * @returns 星标知识库列表
 */
export async function getStarredKnowledgeBases(
  db: BetterSQLite3Database<typeof schema>
): Promise<LocalKnowledgeBase[]> {
  try {
    const knowledgeBases = await db
      .select()
      .from(localKnowledgeBases)
      .where(eq(localKnowledgeBases.starred, true))
      .orderBy(desc(localKnowledgeBases.createdAt))

    console.log(`[KnowledgeBaseQueries] Found ${knowledgeBases.length} starred knowledge bases`)

    return knowledgeBases
  } catch (error) {
    console.error('[KnowledgeBaseQueries] Failed to get starred knowledge bases:', error)
    throw new Error('Failed to get starred knowledge bases')
  }
}

/**
 * 搜索知识库 (按名称或描述)
 *
 * @param db - 数据库连接
 * @param query - 搜索关键词
 * @returns 匹配的知识库列表
 */
export async function searchKnowledgeBases(
  db: BetterSQLite3Database<typeof schema>,
  query: string
): Promise<LocalKnowledgeBase[]> {
  try {
    if (!query || query.trim().length === 0) {
      return await getAllKnowledgeBases(db)
    }

    // 获取所有知识库,然后在应用层过滤
    const allKbs = await getAllKnowledgeBases(db)
    const lowerQuery = query.toLowerCase()

    const filtered = allKbs.filter((kb) => {
      const nameMatch = kb.name.toLowerCase().includes(lowerQuery)
      const descMatch = kb.description?.toLowerCase().includes(lowerQuery) || false
      return nameMatch || descMatch
    })

    console.log(`[KnowledgeBaseQueries] Search for "${query}" found ${filtered.length} results`)

    return filtered
  } catch (error) {
    console.error('[KnowledgeBaseQueries] Failed to search knowledge bases:', error)
    return []
  }
}
