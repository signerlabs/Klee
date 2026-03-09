/**
 * Local File Storage Service
 *
 * 负责管理本地文件系统中的知识库文件
 * 文件存储路径: {userData}/documents/{knowledgeBaseId}/{fileId}-{fileName}
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'
import { FILE_STORAGE_CONFIG } from '../../../../config/local.config'

/**
 * 文件保存结果
 */
export interface SaveFileResult {
  /** 文件存储路径 (相对于 userData) */
  storagePath: string
  /** 文件绝对路径 */
  absolutePath: string
  /** 文件大小 (字节) */
  fileSize: number
}

/**
 * 获取文档存储根目录
 *
 * @returns 文档存储根目录绝对路径
 */
export function getDocumentsPath(): string {
  return path.join(app.getPath('userData'), FILE_STORAGE_CONFIG.DOCS_DIR)
}

/**
 * 获取知识库文件夹路径
 *
 * @param knowledgeBaseId - 知识库 ID
 * @returns 知识库文件夹绝对路径
 */
export function getKnowledgeBasePath(knowledgeBaseId: string): string {
  return path.join(getDocumentsPath(), knowledgeBaseId)
}

/**
 * 生成文件存储路径
 *
 * @param knowledgeBaseId - 知识库 ID
 * @param fileId - 文件 ID
 * @param fileName - 原始文件名
 * @returns 相对路径 (相对于 userData)
 */
export function generateStoragePath(
  knowledgeBaseId: string,
  fileId: string,
  fileName: string
): string {
  // 格式: documents/{knowledgeBaseId}/{fileId}-{fileName}
  return path.join(
    FILE_STORAGE_CONFIG.DOCS_DIR,
    knowledgeBaseId,
    `${fileId}-${fileName}`
  )
}

/**
 * 保存文件到本地存储
 *
 * @param fileBuffer - 文件 Buffer
 * @param knowledgeBaseId - 知识库 ID
 * @param fileId - 文件 ID
 * @param fileName - 原始文件名
 * @returns 保存结果
 * @throws Error 如果文件保存失败
 *
 * @example
 * ```typescript
 * const result = await saveFile(buffer, "kb-123", "file-456", "document.pdf")
 * console.log(result.storagePath) // "documents/kb-123/file-456-document.pdf"
 * ```
 */
export async function saveFile(
  fileBuffer: Buffer,
  knowledgeBaseId: string,
  fileId: string,
  fileName: string
): Promise<SaveFileResult> {
  try {
    // 1. 确保知识库目录存在
    const kbPath = getKnowledgeBasePath(knowledgeBaseId)
    await fs.mkdir(kbPath, { recursive: true })

    // 2. 生成文件路径
    const storagePath = generateStoragePath(knowledgeBaseId, fileId, fileName)
    const absolutePath = path.join(app.getPath('userData'), storagePath)

    // 3. 写入文件
    await fs.writeFile(absolutePath, fileBuffer)

    // 4. 获取文件信息
    const stats = await fs.stat(absolutePath)

    console.log(`[StorageService] File saved: ${storagePath} (${stats.size} bytes)`)

    return {
      storagePath,
      absolutePath,
      fileSize: stats.size,
    }

  } catch (error) {
    console.error('[StorageService] Failed to save file:', error)

    if (error instanceof Error) {
      throw new Error(`Failed to save file: ${error.message}`)
    }

    throw new Error('Unknown error saving file')
  }
}

/**
 * 读取文件内容
 *
 * @param storagePath - 文件存储路径 (相对于 userData)
 * @returns 文件 Buffer
 * @throws Error 如果文件不存在或读取失败
 */
export async function readFile(storagePath: string): Promise<Buffer> {
  try {
    const absolutePath = path.join(app.getPath('userData'), storagePath)
    return await fs.readFile(absolutePath)

  } catch (error) {
    console.error('[StorageService] Failed to read file:', error)

    if (error instanceof Error) {
      throw new Error(`Failed to read file: ${error.message}`)
    }

    throw new Error('Unknown error reading file')
  }
}

/**
 * 删除单个文件
 *
 * @param storagePath - 文件存储路径 (相对于 userData)
 * @returns 是否成功删除
 * @throws Error 如果删除失败
 *
 * @example
 * ```typescript
 * await deleteFile("documents/kb-123/file-456-document.pdf")
 * ```
 */
export async function deleteFile(storagePath: string): Promise<boolean> {
  try {
    const absolutePath = path.join(app.getPath('userData'), storagePath)

    // 检查文件是否存在
    try {
      await fs.access(absolutePath)
    } catch {
      console.warn(`[StorageService] File not found: ${storagePath}`)
      return false
    }

    // 删除文件
    await fs.unlink(absolutePath)
    console.log(`[StorageService] File deleted: ${storagePath}`)

    return true

  } catch (error) {
    console.error('[StorageService] Failed to delete file:', error)

    if (error instanceof Error) {
      throw new Error(`Failed to delete file: ${error.message}`)
    }

    throw new Error('Unknown error deleting file')
  }
}

/**
 * 删除知识库目录及其所有文件
 *
 * @param knowledgeBaseId - 知识库 ID
 * @returns 是否成功删除
 * @throws Error 如果删除失败
 *
 * @example
 * ```typescript
 * await deleteKnowledgeBaseDirectory("kb-123")
 * ```
 */
export async function deleteKnowledgeBaseDirectory(
  knowledgeBaseId: string
): Promise<boolean> {
  try {
    const kbPath = getKnowledgeBasePath(knowledgeBaseId)

    // 检查目录是否存在
    try {
      await fs.access(kbPath)
    } catch {
      console.warn(`[StorageService] Directory not found: ${kbPath}`)
      return false
    }

    // 递归删除目录及其所有文件
    await fs.rm(kbPath, { recursive: true, force: true })
    console.log(`[StorageService] Directory deleted: ${kbPath}`)

    return true

  } catch (error) {
    console.error('[StorageService] Failed to delete directory:', error)

    if (error instanceof Error) {
      throw new Error(`Failed to delete directory: ${error.message}`)
    }

    throw new Error('Unknown error deleting directory')
  }
}

/**
 * 获取知识库的所有文件路径
 *
 * @param knowledgeBaseId - 知识库 ID
 * @returns 文件路径数组 (相对于 userData)
 */
export async function listKnowledgeBaseFiles(
  knowledgeBaseId: string
): Promise<string[]> {
  try {
    const kbPath = getKnowledgeBasePath(knowledgeBaseId)

    // 检查目录是否存在
    try {
      await fs.access(kbPath)
    } catch {
      console.warn(`[StorageService] Directory not found: ${kbPath}`)
      return []
    }

    // 读取目录内容
    const files = await fs.readdir(kbPath)

    // 转换为相对路径
    return files.map(fileName =>
      path.join(FILE_STORAGE_CONFIG.DOCS_DIR, knowledgeBaseId, fileName)
    )

  } catch (error) {
    console.error('[StorageService] Failed to list files:', error)
    return []
  }
}

/**
 * 检查文件是否存在
 *
 * @param storagePath - 文件存储路径 (相对于 userData)
 * @returns 文件是否存在
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    const absolutePath = path.join(app.getPath('userData'), storagePath)
    await fs.access(absolutePath)
    return true
  } catch {
    return false
  }
}

/**
 * 获取文件信息
 *
 * @param storagePath - 文件存储路径 (相对于 userData)
 * @returns 文件信息
 */
export async function getFileInfo(storagePath: string): Promise<{
  size: number
  createdAt: Date
  modifiedAt: Date
} | null> {
  try {
    const absolutePath = path.join(app.getPath('userData'), storagePath)
    const stats = await fs.stat(absolutePath)

    return {
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    }

  } catch (error) {
    console.error('[StorageService] Failed to get file info:', error)
    return null
  }
}

/**
 * 计算知识库总大小
 *
 * @param knowledgeBaseId - 知识库 ID
 * @returns 总大小 (字节)
 */
export async function calculateKnowledgeBaseSize(
  knowledgeBaseId: string
): Promise<number> {
  try {
    const files = await listKnowledgeBaseFiles(knowledgeBaseId)

    let totalSize = 0
    for (const filePath of files) {
      const info = await getFileInfo(filePath)
      if (info) {
        totalSize += info.size
      }
    }

    return totalSize

  } catch (error) {
    console.error('[StorageService] Failed to calculate size:', error)
    return 0
  }
}

/**
 * 清理孤立文件 (数据库中不存在的文件)
 *
 * @param knowledgeBaseId - 知识库 ID
 * @param validFileIds - 数据库中有效的文件 ID 列表
 * @returns 删除的文件数量
 */
export async function cleanupOrphanedFiles(
  knowledgeBaseId: string,
  validFileIds: string[]
): Promise<number> {
  try {
    const files = await listKnowledgeBaseFiles(knowledgeBaseId)
    let deletedCount = 0

    for (const filePath of files) {
      const fileName = path.basename(filePath)
      const fileId = fileName.split('-')[0] // 提取 fileId (格式: {fileId}-{fileName})

      if (!validFileIds.includes(fileId)) {
        await deleteFile(filePath)
        deletedCount++
        console.log(`[StorageService] Cleaned up orphaned file: ${filePath}`)
      }
    }

    return deletedCount

  } catch (error) {
    console.error('[StorageService] Failed to cleanup orphaned files:', error)
    return 0
  }
}
