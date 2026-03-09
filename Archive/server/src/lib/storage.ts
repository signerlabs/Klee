import { createClient } from "@supabase/supabase-js"
import {
  BUCKET_NAME,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
} from "../config/storage.config.js"

/**
 * 获取 Supabase Storage 客户端实例
 * 使用服务角色密钥以绕过 RLS 策略进行服务端操作
 */
function getStorageClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error("VITE_SUPABASE_URL environment variable is not set")
  }

  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * 构建文件存储路径
 * 格式: {userId}/{knowledgeBaseId}/{fileId}-{sanitizedFileName}
 */
function buildStoragePath(
  userId: string,
  knowledgeBaseId: string,
  fileId: string,
  fileName: string
): string {
  const sanitizedFileName = sanitizeFileNameForStorage(fileName, fileId)
  return `${userId}/${knowledgeBaseId}/${sanitizedFileName}`
}
/**
 * 将原始文件名转换为只包含 ASCII 安全字符的形式
 * 以避免对象存储对特殊字符的兼容性问题
 */
function sanitizeFileNameForStorage(
  fileName: string,
  fallbackId: string
): string {
  const maxBaseLength = 80

  const lastDotIndex = fileName.lastIndexOf(".")
  const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName
  const extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : ""

  const asciiBase = baseName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()

  const sanitizedBase =
    asciiBase.length > 0 ? asciiBase.slice(0, maxBaseLength) : "file"
  const sanitizedExtension = extension.toLowerCase().replace(/[^.a-z0-9]+/g, "")

  return `${fallbackId}-${sanitizedBase}${sanitizedExtension}`
}

/**
 * 上传文件到 Supabase Storage
 *
 * @param file - 文件 Buffer 数据
 * @param userId - 用户 ID
 * @param knowledgeBaseId - 知识库 ID
 * @param fileId - 文件唯一 ID
 * @param fileName - 文件名
 * @param contentType - 文件 MIME 类型
 * @returns 存储路径
 *
 * @throws 如果上传失败
 *
 * @example
 * const path = await uploadFileToStorage(
 *   fileBuffer,
 *   "user-123",
 *   "kb-456",
 *   "file-789",
 *   "document.pdf",
 *   "application/pdf"
 * )
 */
export async function uploadFileToStorage(
  file: Buffer,
  userId: string,
  knowledgeBaseId: string,
  fileId: string,
  fileName: string,
  contentType: string
): Promise<string> {
  const supabase = getStorageClient()
  const storagePath = buildStoragePath(
    userId,
    knowledgeBaseId,
    fileId,
    fileName
  )

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, {
        contentType,
        upsert: false, // 不覆盖已存在的文件
      })

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`)
    }

    return storagePath
  } catch (error) {
    console.error("Error uploading file to storage:", error)
    throw new Error(
      `Failed to upload file: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * 从 Supabase Storage 删除文件
 *
 * @param storagePath - 文件存储路径
 * @returns 是否删除成功
 *
 * @example
 * const success = await deleteFileFromStorage("user-123/kb-456/file-789-document.pdf")
 */
export async function deleteFileFromStorage(
  storagePath: string
): Promise<boolean> {
  const supabase = getStorageClient()

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath])

    if (error) {
      console.error("Supabase delete failed:", error.message)
      return false
    }

    return true
  } catch (error) {
    console.error("Error deleting file from storage:", error)
    return false
  }
}

/**
 * 从 Supabase Storage 下载文件
 *
 * @param storagePath - 文件存储路径
 * @returns 文件 Buffer 数据
 *
 * @throws 如果下载失败
 *
 * @example
 * const fileBuffer = await downloadFileFromStorage("user-123/kb-456/file-789-document.pdf")
 */
export async function downloadFileFromStorage(
  storagePath: string
): Promise<Buffer> {
  const supabase = getStorageClient()

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath)

    if (error) {
      throw new Error(`Supabase download failed: ${error.message}`)
    }

    if (!data) {
      throw new Error("No file data received from storage")
    }

    // 将 Blob 转换为 Buffer
    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.error("Error downloading file from storage:", error)
    throw new Error(
      `Failed to download file: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * 获取文件的公开访问 URL (如果配置了公开访问)
 *
 * @param storagePath - 文件存储路径
 * @returns 公开访问 URL
 *
 * @example
 * const url = getPublicUrl("user-123/kb-456/file-789-document.pdf")
 */
export function getPublicUrl(storagePath: string): string {
  const supabase = getStorageClient()

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath)

  return publicUrl
}

/**
 * 确保 Storage Bucket 存在,如果不存在则创建
 * 注意: 需要 service_role 权限
 */
export async function ensureBucketExists(): Promise<void> {
  const supabase = getStorageClient()

  try {
    // 检查 bucket 是否存在
    const { data: buckets, error: listError } =
      await supabase.storage.listBuckets()

    if (listError) {
      throw new Error(`Failed to list buckets: ${listError.message}`)
    }

    const bucketExists = buckets?.some((bucket) => bucket.name === BUCKET_NAME)

    if (!bucketExists) {
      // 创建 bucket
      const { error: createError } = await supabase.storage.createBucket(
        BUCKET_NAME,
        {
          public: false, // 私有 bucket
          fileSizeLimit: MAX_FILE_SIZE,
          allowedMimeTypes: ALLOWED_MIME_TYPES,
        }
      )

      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`)
      }

      console.log(`✅ Created storage bucket: ${BUCKET_NAME}`)
    }
  } catch (error) {
    console.error("Error ensuring bucket exists:", error)
    // 不抛出错误,因为 bucket 可能已经存在但没有列表权限
  }
}
