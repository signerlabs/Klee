import { desc, eq, and, or, count, inArray, sql } from "drizzle-orm"
import { db } from "../db.js"
import {
  knowledgeBases,
  knowledgeBaseFiles,
  chatSessions,
  type NewKnowledgeBase,
  type UpdateKnowledgeBase,
  type NewKnowledgeBaseFile,
} from "../schema.js"
import { deleteFileFromStorage } from "../../src/lib/storage.js"
import { generateUniqueShareSlug } from "../../src/lib/slug-generator.js"

/**
 * 获取用户的知识库列表（轻量级，仅基础字段，用于侧边栏列表）
 */
export const getUserKnowledgeBasesList = async (userId: string) => {
  return await db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      starred: knowledgeBases.starred,
    })
    .from(knowledgeBases)
    .where(eq(knowledgeBases.userId, userId))
    .orderBy(desc(knowledgeBases.createdAt))
}

/**
 * 获取单个知识库（不包含文件列表）
 */
export const getKnowledgeBaseById = async (
  knowledgeBaseId: string,
  userId: string
) => {
  const [result] = await db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
      isPublic: knowledgeBases.isPublic,
      shareSlug: knowledgeBases.shareSlug,
    })
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBaseId),
        eq(knowledgeBases.userId, userId)
      )
    )
    .limit(1)

  return result
}

/**
 * 创建新的知识库
 */
export const createKnowledgeBase = async (knowledgeBase: NewKnowledgeBase) => {
  const [result] = await db
    .insert(knowledgeBases)
    .values(knowledgeBase)
    .returning()
  return result
}

/**
 * 更新知识库
 */
export const updateKnowledgeBase = async (
  knowledgeBaseId: string,
  userId: string,
  data: UpdateKnowledgeBase
) => {
  const [result] = await db
    .update(knowledgeBases)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBaseId),
        eq(knowledgeBases.userId, userId)
      )
    )
    .returning()

  return result
}

/**
 * 删除知识库（会级联删除相关的文件和 embeddings，并清理 Storage 中的文件）
 */
export const deleteKnowledgeBase = async (
  knowledgeBaseId: string,
  userId: string
) => {
  // T052-T054: 使用数据库事务保证级联删除的原子性
  return await db.transaction(async (tx) => {
    // 1. 获取所有文件路径（删除前获取，因为删除后就查不到了）
    const files = await tx
      .select()
      .from(knowledgeBaseFiles)
      .where(eq(knowledgeBaseFiles.knowledgeBaseId, knowledgeBaseId))

    // 验证知识库所有权
    const [kb] = await tx
      .select({ userId: knowledgeBases.userId })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, knowledgeBaseId))
      .limit(1)

    if (!kb || kb.userId !== userId) {
      throw new Error('Knowledge base not found or access denied')
    }

    // 2. 删除数据库记录（会级联删除 knowledge_base_files 和 embeddings）
    // FR-038, FR-040: 级联删除文件和嵌入
    const [deletedKb] = await tx
      .delete(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, knowledgeBaseId),
          eq(knowledgeBases.userId, userId)
        )
      )
      .returning()

    if (!deletedKb) {
      throw new Error('Failed to delete knowledge base')
    }

    // 3. 清理所有聊天会话中残留的知识库引用（availableKnowledgeBaseIds）
    // FR-041: 清理 chatSessions JSONB 数组引用
    // 说明：当知识库被删除后，历史 ChatSession 可能还保留其 ID。
    // 这里统一从所有当前用户的会话中移除该 ID，保持数据一致。
    await tx
      .update(chatSessions)
      .set({
        // 将 JSONB 数组中过滤掉被删除的 ID
        availableKnowledgeBaseIds: sql`(
          SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
          FROM jsonb_array_elements_text(${chatSessions.availableKnowledgeBaseIds}) AS value
          WHERE value <> ${knowledgeBaseId}
        )` as any,
      })
      .where(eq(chatSessions.userId, userId))

    // 事务成功提交后，异步清理外部存储
    // FR-039: Supabase Storage 文件清理（事务外异步执行）
    // 注意：Storage 清理失败不影响数据库事务
    if (files && files.length > 0) {
      const storagePaths = files
        .map((f) => f.storagePath)
        .filter((path): path is string => path !== null && path !== "")

      if (storagePaths.length > 0) {
        // 并行删除所有文件，单个文件失败不影响其他文件
        // 使用 setImmediate 确保在事务提交后执行
        setImmediate(async () => {
          const deletePromises = storagePaths.map((path) =>
            deleteFileFromStorage(path).catch((error) => {
              console.error(`Failed to delete storage file ${path}:`, error)
              return false
            })
          )
          await Promise.all(deletePromises)
          console.log(`Cleaned up ${storagePaths.length} storage files for KB ${knowledgeBaseId}`)
        })
      }
    }

    return deletedKb
  })
}

/**
 * 获取知识库的所有文件
 */
export const getKnowledgeBaseFiles = async (
  knowledgeBaseId: string,
  userId: string
) => {
  // 先验证用户拥有该知识库
  const kb = await getKnowledgeBaseById(knowledgeBaseId, userId)

  if (!kb) {
    return null
  }

  return await db
    .select({
      id: knowledgeBaseFiles.id,
      fileName: knowledgeBaseFiles.fileName,
      fileSize: knowledgeBaseFiles.fileSize,
      fileType: knowledgeBaseFiles.fileType,
      storagePath: knowledgeBaseFiles.storagePath,
      createdAt: knowledgeBaseFiles.createdAt,
      status: knowledgeBaseFiles.status,
    })
    .from(knowledgeBaseFiles)
    .where(eq(knowledgeBaseFiles.knowledgeBaseId, knowledgeBaseId))
    .orderBy(desc(knowledgeBaseFiles.createdAt))
}

/**
 * 添加知识库文件
 */
export const createKnowledgeBaseFile = async (data: NewKnowledgeBaseFile) => {
  const [result] = await db.insert(knowledgeBaseFiles).values(data).returning()
  return result
}

/**
 * 删除知识库文件（会级联删除相关的 embeddings，并清理 Storage 中的文件）
 */
export const deleteKnowledgeBaseFile = async (
  fileId: string,
  knowledgeBaseId: string,
  userId: string
) => {
  // 1. 验证用户拥有该知识库
  const kb = await getKnowledgeBaseById(knowledgeBaseId, userId)

  if (!kb) {
    return null
  }

  // 2. 删除数据库记录（会级联删除相关的 embeddings）
  const [file] = await db
    .delete(knowledgeBaseFiles)
    .where(
      and(
        eq(knowledgeBaseFiles.id, fileId),
        eq(knowledgeBaseFiles.knowledgeBaseId, knowledgeBaseId)
      )
    )
    .returning()

  // 3. 清理 Supabase Storage 中的实际文件
  if (file?.storagePath) {
    await deleteFileFromStorage(file.storagePath).catch((error) => {
      console.error(`Failed to delete storage file ${file.storagePath}:`, error)
      // 不抛出错误，避免影响数据库删除操作的成功返回
    })
  }

  return file
}

/**
 * 分享知识库到市场（或取消分享）
 * T032: 实现 shareKnowledgeBase 查询函数
 */
export const shareKnowledgeBase = async (
  knowledgeBaseId: string,
  userId: string,
  isPublic: boolean
) => {
  // 1. 验证用户拥有该知识库
  const kb = await getKnowledgeBaseById(knowledgeBaseId, userId)

  if (!kb) {
    throw new Error("Knowledge base not found or access denied")
  }

  // 2. T033: 验证至少有一个已完成文件
  if (isPublic) {
    const [result] = await db
      .select({ count: count() })
      .from(knowledgeBaseFiles)
      .where(
        and(
          eq(knowledgeBaseFiles.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeBaseFiles.status, "completed")
        )
      )

    if (!result || result.count === 0) {
      throw new Error(
        "Cannot share knowledge base without completed files. Please upload and process at least one file first."
      )
    }
  }

  // 3. 生成或保留 shareSlug
  // FR-006: 取消分享时保留 shareSlug（历史追踪）
  const [existing] = await db
    .select({ shareSlug: knowledgeBases.shareSlug })
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBaseId),
        eq(knowledgeBases.userId, userId)
      )
    )
    .limit(1)

  let shareSlug: string | null = existing?.shareSlug || null

  // 如果分享且还没有 slug，生成新的
  if (isPublic && !shareSlug) {
    shareSlug = await generateUniqueShareSlug()
  }

  // 4. 更新知识库
  const [updated] = await db
    .update(knowledgeBases)
    .set({
      isPublic,
      shareSlug, // 分享时生成，取消分享时保留
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBaseId),
        eq(knowledgeBases.userId, userId)
      )
    )
    .returning()

  return updated
}

/**
 * 验证知识库ID是否可访问(用户自己的或公开的)
 * 返回有效的知识库ID列表
 */
export const validateKnowledgeBaseAccess = async (
  userId: string,
  knowledgeBaseIds: string[]
): Promise<string[]> => {
  if (knowledgeBaseIds.length === 0) {
    return []
  }

  // 查询所有可访问的知识库(用户拥有 OR 公开分享)
  const accessibleKbs = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        inArray(knowledgeBases.id, knowledgeBaseIds),
        or(
          eq(knowledgeBases.userId, userId),
          eq(knowledgeBases.isPublic, true)
        )
      )
    )

  return accessibleKbs.map((kb) => kb.id)
}
