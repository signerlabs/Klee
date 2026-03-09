/**
 * 文本提取服务 - 服务端专用实现
 *
 * 使用 officeparser 统一处理所有文件类型
 * 支持: .txt, .md, .pdf, .docx, .pptx, .xlsx, .odt, .odp, .ods
 */

import officeParser from "officeparser"

/**
 * 支持的文件扩展名
 */
export const SUPPORTED_FILE_EXTENSIONS = [
  ".txt",
  ".md",
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".odt",
  ".odp",
  ".ods",
  ".json",
] as const

/**
 * 文件大小限制 (100MB)
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024
export const MAX_FILE_SIZE_MB = 100

/**
 * 文本提取错误类
 */
export class TextExtractionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNSUPPORTED_TYPE"
      | "EXTRACTION_FAILED"
      | "FILE_TOO_LARGE" = "EXTRACTION_FAILED"
  ) {
    super(message)
    this.name = "TextExtractionError"
  }
}

/**
 * 验证文件扩展名
 */
export function validateFileExtension(fileName: string): boolean {
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]
  return ext ? SUPPORTED_FILE_EXTENSIONS.includes(ext as any) : false
}

/**
 * 验证文件
 */
export function validateFile(
  fileName: string,
  fileSize: number
): { valid: boolean; error?: string } {
  // 检查文件大小
  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds limit of ${MAX_FILE_SIZE_MB}MB`,
    }
  }

  // 检查文件类型
  if (!validateFileExtension(fileName)) {
    return {
      valid: false,
      error: `Unsupported file type. Allowed types: ${SUPPORTED_FILE_EXTENSIONS.join(", ")}`,
    }
  }

  return { valid: true }
}

/**
 * 从文件中提取文本
 *
 * @param fileBuffer - 文件 Buffer
 * @param fileName - 文件名 (用于判断类型)
 * @returns 提取的文本
 */
export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileName: string
): Promise<string> {
  // 验证文件类型
  if (!validateFileExtension(fileName)) {
    throw new TextExtractionError(
      `Unsupported file type: ${fileName}`,
      "UNSUPPORTED_TYPE"
    )
  }

  try {
    // 特殊处理 JSON 和纯文本文件
    const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (ext === ".txt" || ext === ".md" || ext === ".json") {
      return fileBuffer.toString("utf-8")
    }

    // 使用 officeparser 处理其他文件类型
    const text = await officeParser.parseOfficeAsync(fileBuffer, {
      newlineDelimiter: "\n", // 保留换行符
      ignoreNotes: true, // 忽略备注
    })

    // 移除空字符
    const cleanedText = text.replace(/\u0000/g, "")

    // 验证提取的文本不为空
    if (!cleanedText || cleanedText.trim().length === 0) {
      throw new TextExtractionError(
        "No text content extracted from file",
        "EXTRACTION_FAILED"
      )
    }

    return cleanedText
  } catch (error) {
    if (error instanceof TextExtractionError) {
      throw error
    }

    const message =
      error instanceof Error ? error.message : "Unknown error extracting text"
    throw new TextExtractionError(
      `Failed to extract text: ${message}`,
      "EXTRACTION_FAILED"
    )
  }
}

/**
 * 文本分块配置
 */
export interface ChunkConfig {
  chunkSize: number // 块大小（字符数）
  chunkOverlap: number // 重叠大小（字符数）
}

/**
 * 默认分块配置
 */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
}

/**
 * 将文本分块
 *
 * @param text - 要分块的文本
 * @param config - 分块配置
 * @returns 文本块数组
 */
export function generateChunks(
  text: string,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): string[] {
  const { chunkSize, chunkOverlap } = config
  const chunks: string[] = []

  if (text.length <= chunkSize) {
    return [text]
  }

  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const chunk = text.substring(start, end)
    chunks.push(chunk)

    // 下一个块的起始位置考虑重叠
    start += chunkSize - chunkOverlap

    // 防止无限循环
    if (start >= text.length) break
  }

  return chunks
}
