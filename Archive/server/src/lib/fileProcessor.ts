/**
 * Cloud Mode 文件处理器
 *
 * 使用本地 text-extractor 统一处理文本提取
 */

import type { ContentfulStatusCode } from "hono/utils/http-status"
import { eq } from "drizzle-orm"
import { generateChunks, generateEmbeddings } from "./ai/embedding.js"
import { uploadFileToStorage, deleteFileFromStorage } from "./storage.js"
import { db } from "../../db/db.js"
import { knowledgeBaseFiles, embeddings } from "../../db/schema.js"
import {
  extractTextFromFile,
  validateFile,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  TextExtractionError,
} from "./text-extractor/index.js"

/**
 * 知识库文件错误类
 */
export class KnowledgeBaseFileError extends Error {
  statusCode: ContentfulStatusCode

  constructor(message: string, statusCode: ContentfulStatusCode = 400) {
    super(message)
    this.name = "KnowledgeBaseFileError"
    this.statusCode = statusCode
  }
}

/**
 * 根据文件扩展名获取 MIME 类型
 */
export function getMimeTypeFromExtension(fileName: string): string | null {
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]

  if (!ext) return null

  // MIME 类型映射
  const mimeTypeMap: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  }

  return mimeTypeMap[ext] || null
}

// 导出文本提取模块的常量,保持 API 兼容性
export { MAX_FILE_SIZE, MAX_FILE_SIZE_MB }

/**
 * 支持的文件类型 (兼容旧 API)
 */
export const SUPPORTED_FILE_TYPES: Record<string, readonly string[]> = {
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.oasis.opendocument.text": [".odt"],
  "application/vnd.oasis.opendocument.presentation": [".odp"],
  "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
} as const

/**
 * 验证文件是否符合要求 (兼容旧 API)
 */
export { validateFile }

/**
 * 从文件中提取文本 (使用文本提取模块)
 */
export { extractTextFromFile }

/**
 * 文件处理结果
 */
export interface ProcessFileResult {
  file: {
    id: string
    fileName: string
    fileSize: number
    fileType: string
    storagePath: string
    createdAt: Date
  }
  stats: {
    chunksCount: number
    textLength: number
    processingTimeMs: number
  }
}

/**
 * 完整的文件处理流程: 上传 → 提取 → 分块 → 向量化 → 存储
 *
 * @param fileBuffer - 文件 Buffer 数据
 * @param fileName - 文件名
 * @param fileSize - 文件大小 (字节)
 * @param userId - 用户 ID
 * @param knowledgeBaseId - 知识库 ID
 * @returns 处理结果
 *
 * @throws 如果处理任何步骤失败
 */
export async function processFile(
  fileBuffer: Buffer,
  fileName: string,
  fileSize: number,
  userId: string,
  knowledgeBaseId: string
): Promise<ProcessFileResult> {
  const startTime = Date.now()

  // 1. 验证文件
  const validation = validateFile(fileName, fileSize)
  if (!validation.valid) {
    throw new KnowledgeBaseFileError(
      validation.error ?? "Invalid file upload",
      400
    )
  }

  const mimeType = getMimeTypeFromExtension(fileName)!

  // 2. 先创建文件记录 (状态为 processing)
  const [fileRecord] = await db
    .insert(knowledgeBaseFiles)
    .values({
      knowledgeBaseId,
      fileName,
      fileSize,
      fileType: mimeType,
      storagePath: null, // 上传完成后更新
      contentText: null,
      status: "processing",
    })
    .returning()

  const fileId = fileRecord.id
  let storagePath: string | null = null

  try {
    // 3. 上传文件到 Supabase Storage
    storagePath = await uploadFileToStorage(
      fileBuffer,
      userId,
      knowledgeBaseId,
      fileId,
      fileName,
      mimeType
    )

    // 4. 提取文本内容 (使用文本提取模块)
    let rawText: string
    try {
      rawText = await extractTextFromFile(fileBuffer, fileName)
    } catch (error) {
      // 将 TextExtractionError 转换为 KnowledgeBaseFileError
      if (error instanceof TextExtractionError) {
        throw new KnowledgeBaseFileError(error.message, 422)
      }
      throw error
    }

    const text = rawText.replace(/\u0000/g, "")

    if (!text || text.trim().length === 0) {
      throw new KnowledgeBaseFileError(
        "No text content extracted from file",
        422
      )
    }

    // 使用数据库事务确保原子性
    const result = await db.transaction(async (tx) => {
      // 5. 更新文件记录 (添加 storage path 和文本内容)
      await tx
        .update(knowledgeBaseFiles)
        .set({
          storagePath: storagePath!,
          contentText: text,
        })
        .where(eq(knowledgeBaseFiles.id, fileId))

      // 6. 文本分块
      const chunks = generateChunks(text)

      if (chunks.length === 0) {
        throw new KnowledgeBaseFileError(
          "No chunks generated from text",
          422
        )
      }

      // 7. 生成向量 embeddings
      const embeddingVectors = await generateEmbeddings(chunks)

      // 8. 批量插入 embeddings 到数据库
      const embeddingRecords = chunks.map((chunk, index) => ({
        knowledgeBaseId,
        fileId,
        content: chunk,
        embedding: embeddingVectors[index],
      }))

      await tx.insert(embeddings).values(embeddingRecords)

      // 9. 更新文件状态为 completed
      await tx
        .update(knowledgeBaseFiles)
        .set({ status: "completed" })
        .where(eq(knowledgeBaseFiles.id, fileId))

      // 返回处理结果
      return {
        file: {
          id: fileRecord.id,
          fileName: fileRecord.fileName,
          fileSize: fileRecord.fileSize,
          fileType: fileRecord.fileType!,
          storagePath: storagePath!,
          createdAt: fileRecord.createdAt,
        },
        stats: {
          chunksCount: chunks.length,
          textLength: text.length,
          processingTimeMs: Date.now() - startTime,
        },
      }
    })

    return result
  } catch (error) {
    console.error("Error processing file:", error)

    // 清理 Storage 中的文件（如果已上传）
    if (storagePath) {
      try {
        await deleteFileFromStorage(storagePath)
        console.log(`Cleaned up storage file: ${storagePath}`)
      } catch (deleteError) {
        console.error("Failed to clean up storage file:", deleteError)
        // 不抛出错误，继续处理
      }
    }

    // 更新文件状态为 failed
    try {
      await db
        .update(knowledgeBaseFiles)
        .set({ status: "failed" })
        .where(eq(knowledgeBaseFiles.id, fileId))
    } catch (updateError) {
      console.error("Failed to update file status to failed:", updateError)
    }

    if (error instanceof KnowledgeBaseFileError) {
      throw error
    }

    const message =
      error instanceof Error ? error.message : "Unknown error processing file"

    throw new KnowledgeBaseFileError(message, 500)
  }
}
