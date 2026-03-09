/**
 * Knowledge Base Files Queries
 *
 * 知识库文件数据库查询函数 (Private Mode)
 */

import { eq, and, desc } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import {
  localKnowledgeBaseFiles,
  type LocalKnowledgeBaseFile,
  type NewLocalKnowledgeBaseFile,
  insertLocalKnowledgeBaseFileSchema,
} from '../schema'

/**
 * 查询知识库的所有文件
 *
 * @param db - 数据库连接
 * @param knowledgeBaseId - 知识库 ID
 * @returns 文件列表
 *
 * @example
 * ```typescript
 * const files = await getFilesByKnowledgeBaseId(db, "kb-123")
 * console.log(files.length) // 10
 * ```
 */
export async function getFilesByKnowledgeBaseId(
  db: BetterSQLite3Database<typeof schema>,
  knowledgeBaseId: string
): Promise<LocalKnowledgeBaseFile[]> {
  try {
    const files = await db
      .select()
      .from(localKnowledgeBaseFiles)
      .where(eq(localKnowledgeBaseFiles.knowledgeBaseId, knowledgeBaseId))
      .orderBy(desc(localKnowledgeBaseFiles.createdAt))

    console.log(
      `[KnowledgeBaseFileQueries] Found ${files.length} files for knowledge base ${knowledgeBaseId}`
    )

    return files

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to get files:', error)
    throw new Error('Failed to get knowledge base files')
  }
}

/**
 * 查询单个文件 (通过 ID)
 *
 * @param db - 数据库连接
 * @param fileId - 文件 ID
 * @returns 文件详情，如果不存在返回 null
 */
export async function getFileById(
  db: BetterSQLite3Database<typeof schema>,
  fileId: string
): Promise<LocalKnowledgeBaseFile | null> {
  try {
    const [file] = await db
      .select()
      .from(localKnowledgeBaseFiles)
      .where(eq(localKnowledgeBaseFiles.id, fileId))
      .limit(1)

    if (!file) {
      console.warn(`[KnowledgeBaseFileQueries] File not found: ${fileId}`)
      return null
    }

    return file

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to get file by ID:', error)
    throw new Error('Failed to get file')
  }
}

/**
 * 创建文件记录
 *
 * @param db - 数据库连接
 * @param input - 文件输入数据
 * @returns 创建的文件记录
 * @throws Error 如果创建失败
 *
 * @example
 * ```typescript
 * const file = await createKnowledgeBaseFile(db, {
 *   knowledgeBaseId: "kb-123",
 *   fileName: "document.pdf",
 *   fileSize: 1024000,
 *   fileType: "application/pdf",
 *   storagePath: "documents/kb-123/file-456-document.pdf",
 *   status: "processing"
 * })
 * ```
 */
export async function createKnowledgeBaseFile(
  db: BetterSQLite3Database<typeof schema>,
  input: Omit<NewLocalKnowledgeBaseFile, 'createdAt'> | Omit<NewLocalKnowledgeBaseFile, 'id' | 'createdAt'>
): Promise<LocalKnowledgeBaseFile> {
  try {
    // 验证输入
    const validated = insertLocalKnowledgeBaseFileSchema.parse(input)

    // 生成 UUID 和时间戳（如果没有提供 id）
    const newFileId = ('id' in input && input.id) ? input.id : randomUUID()
    const file: NewLocalKnowledgeBaseFile = {
      ...validated,
      id: newFileId,
      createdAt: new Date(),
    }

    // 插入数据库
    await db.insert(localKnowledgeBaseFiles).values(file)

    console.log(`[KnowledgeBaseFileQueries] Created file: ${file.id}`)

    // 返回创建的文件
    const created = await getFileById(db, file.id)
    if (!created) {
      throw new Error('Failed to retrieve created file')
    }

    return created

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to create file:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to create file')
  }
}

/**
 * 更新文件状态
 *
 * @param db - 数据库连接
 * @param fileId - 文件 ID
 * @param status - 新状态 ('processing' | 'completed' | 'failed')
 * @param contentText - 提取的文本内容 (可选)
 * @returns 更新后的文件，如果不存在返回 null
 *
 * @example
 * ```typescript
 * const file = await updateFileStatus(db, "file-456", "completed", "Extracted text...")
 * ```
 */
export async function updateFileStatus(
  db: BetterSQLite3Database<typeof schema>,
  fileId: string,
  status: 'processing' | 'completed' | 'failed',
  contentText?: string
): Promise<LocalKnowledgeBaseFile | null> {
  try {
    // 检查文件是否存在
    const existing = await getFileById(db, fileId)
    if (!existing) {
      return null
    }

    // 更新状态
    await db
      .update(localKnowledgeBaseFiles)
      .set({
        status,
        ...(contentText !== undefined && { contentText }),
      })
      .where(eq(localKnowledgeBaseFiles.id, fileId))

    console.log(`[KnowledgeBaseFileQueries] Updated file status: ${fileId} -> ${status}`)

    // 返回更新后的文件
    return await getFileById(db, fileId)

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to update file status:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to update file status')
  }
}

/**
 * 删除文件记录
 *
 * @param db - 数据库连接
 * @param fileId - 文件 ID
 * @returns 是否成功删除
 * @throws Error 如果删除失败
 *
 * @example
 * ```typescript
 * const deleted = await deleteKnowledgeBaseFile(db, "file-456")
 * console.log(deleted) // true
 * ```
 *
 * 注意: 此函数仅删除 SQLite 记录
 * 调用方需要手动处理:
 * 1. 删除 LanceDB 向量 (vectorDb.deleteVectorsByFileId)
 * 2. 删除本地文件 (storageService.deleteFile)
 */
export async function deleteKnowledgeBaseFile(
  db: BetterSQLite3Database<typeof schema>,
  fileId: string
): Promise<boolean> {
  try {
    // 检查文件是否存在
    const existing = await getFileById(db, fileId)
    if (!existing) {
      console.warn(`[KnowledgeBaseFileQueries] File not found: ${fileId}`)
      return false
    }

    // 删除文件记录
    await db.delete(localKnowledgeBaseFiles).where(eq(localKnowledgeBaseFiles.id, fileId))

    console.log(`[KnowledgeBaseFileQueries] Deleted file: ${fileId}`)

    return true

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to delete file:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to delete file')
  }
}

/**
 * 获取处理中的文件 (status = 'processing')
 *
 * @param db - 数据库连接
 * @returns 处理中的文件列表
 *
 * 用于应用启动时检测未完成的文件上传
 */
export async function getProcessingFiles(
  db: BetterSQLite3Database<typeof schema>
): Promise<LocalKnowledgeBaseFile[]> {
  try {
    const files = await db
      .select()
      .from(localKnowledgeBaseFiles)
      .where(eq(localKnowledgeBaseFiles.status, 'processing'))
      .orderBy(desc(localKnowledgeBaseFiles.createdAt))

    console.log(`[KnowledgeBaseFileQueries] Found ${files.length} processing files`)

    return files

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to get processing files:', error)
    return []
  }
}

/**
 * 获取失败的文件 (status = 'failed')
 *
 * @param db - 数据库连接
 * @param knowledgeBaseId - 知识库 ID (可选)
 * @returns 失败的文件列表
 */
export async function getFailedFiles(
  db: BetterSQLite3Database<typeof schema>,
  knowledgeBaseId?: string
): Promise<LocalKnowledgeBaseFile[]> {
  try {
    let files: LocalKnowledgeBaseFile[]

    if (knowledgeBaseId) {
      files = await db
        .select()
        .from(localKnowledgeBaseFiles)
        .where(
          and(
            eq(localKnowledgeBaseFiles.status, 'failed'),
            eq(localKnowledgeBaseFiles.knowledgeBaseId, knowledgeBaseId)
          )
        )
        .orderBy(desc(localKnowledgeBaseFiles.createdAt))
    } else {
      files = await db
        .select()
        .from(localKnowledgeBaseFiles)
        .where(eq(localKnowledgeBaseFiles.status, 'failed'))
        .orderBy(desc(localKnowledgeBaseFiles.createdAt))
    }

    console.log(`[KnowledgeBaseFileQueries] Found ${files.length} failed files`)

    return files

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to get failed files:', error)
    return []
  }
}

/**
 * 批量删除文件 (通过知识库 ID)
 *
 * @param db - 数据库连接
 * @param knowledgeBaseId - 知识库 ID
 * @returns 删除的文件数量
 *
 * 注意: 通常不需要手动调用此函数,因为外键约束会自动级联删除
 */
export async function deleteFilesByKnowledgeBaseId(
  db: BetterSQLite3Database<typeof schema>,
  knowledgeBaseId: string
): Promise<number> {
  try {
    // 获取文件列表 (用于日志)
    const files = await getFilesByKnowledgeBaseId(db, knowledgeBaseId)

    // 删除所有文件
    await db
      .delete(localKnowledgeBaseFiles)
      .where(eq(localKnowledgeBaseFiles.knowledgeBaseId, knowledgeBaseId))

    console.log(
      `[KnowledgeBaseFileQueries] Deleted ${files.length} files for knowledge base ${knowledgeBaseId}`
    )

    return files.length

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to delete files:', error)
    throw new Error('Failed to delete files')
  }
}

/**
 * 获取知识库的文件统计信息
 *
 * @param db - 数据库连接
 * @param knowledgeBaseId - 知识库 ID
 * @returns 统计信息
 */
export async function getKnowledgeBaseFileStats(
  db: BetterSQLite3Database<typeof schema>,
  knowledgeBaseId: string
): Promise<{
  total: number
  completed: number
  processing: number
  failed: number
  totalSize: number
}> {
  try {
    const files = await getFilesByKnowledgeBaseId(db, knowledgeBaseId)

    const stats = {
      total: files.length,
      completed: files.filter((f) => f.status === 'completed').length,
      processing: files.filter((f) => f.status === 'processing').length,
      failed: files.filter((f) => f.status === 'failed').length,
      totalSize: files.reduce((sum, f) => sum + f.fileSize, 0),
    }

    console.log(`[KnowledgeBaseFileQueries] Stats for ${knowledgeBaseId}:`, stats)

    return stats

  } catch (error) {
    console.error('[KnowledgeBaseFileQueries] Failed to get file stats:', error)
    return {
      total: 0,
      completed: 0,
      processing: 0,
      failed: 0,
      totalSize: 0,
    }
  }
}
