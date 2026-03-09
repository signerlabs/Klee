/**
 * Storage 配置
 * 统一管理文件存储相关的常量配置
 */

/**
 * Supabase Storage Bucket 名称
 * 从环境变量读取，如果未设置则使用默认值
 */
export const BUCKET_NAME =
  process.env.SUPABASE_BUCKET_NAME || "knowledge-base-files"

/**
 * 文件大小限制（字节）
 * 默认: 100MB (与文本提取模块保持一致)
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

/**
 * 文件大小限制（MB）- 用于显示
 */
export const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / 1024 / 1024

/**
 * 支持的文件类型及其对应的 MIME 类型
 * (与文本提取模块保持一致)
 */
export const SUPPORTED_FILE_TYPES = {
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
 * 所有支持的 MIME 类型列表（用于 Bucket 配置）
 */
export const ALLOWED_MIME_TYPES = Object.keys(
  SUPPORTED_FILE_TYPES
) as string[]
