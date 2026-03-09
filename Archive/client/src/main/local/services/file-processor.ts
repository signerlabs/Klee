/**
 * File Processor Service
 *
 * 负责文件处理的完整流程:
 * 1. 文件验证 (大小、类型)
 * 2. 文本提取
 * 3. 文本分块
 * 4. Embedding 生成
 * 5. 存储到 SQLite 和 LanceDB
 */

import {
  extractTextFromFile,
  generateChunks,
  validateFile,
  TextExtractionError,
  DEFAULT_CHUNK_CONFIG,
} from '../lib/text-extractor'
import { generateEmbeddingsBatchWithRetry, ensureModelAvailable } from './embedding-service'
import { saveFile, deleteFile } from './storage-service'
import { VectorDbManager } from './vector-db-manager'
import { EMBEDDING_CONFIG } from '../../../../config/local.config'

/**
 * 文件处理进度阶段
 */
export type ProcessingStage =
  | 'validating'   // 验证文件
  | 'saving'       // 保存文件
  | 'extracting'   // 提取文本
  | 'chunking'     // 分块
  | 'embedding'    // 生成 embeddings
  | 'storing'      // 存储到向量数据库
  | 'completed'    // 完成
  | 'failed'       // 失败

/**
 * 文件处理进度
 */
export interface FileProcessingProgress {
  /** 文件 ID */
  fileId: string
  /** 当前处理阶段 */
  stage: ProcessingStage
  /** 进度百分比 (0-100) */
  percent: number
  /** 进度消息 */
  message: string
  /** 当前步骤详情 (如: 正在处理第 10/50 个块) */
  detail?: string
}

/**
 * 文件处理结果
 */
export interface FileProcessingResult {
  /** 文件 ID */
  fileId: string
  /** 文件存储路径 */
  storagePath: string
  /** 提取的文本内容 */
  contentText: string
  /** 文本块数量 */
  chunksCount: number
  /** 文件大小 (字节) */
  fileSize: number
  /** 处理状态 */
  status: 'completed' | 'failed'
  /** 错误消息 (如果失败) */
  error?: string
}

/**
 * 文件处理配置
 */
export interface FileProcessorConfig {
  /** 进度回调函数 */
  onProgress?: (progress: FileProcessingProgress) => void
  /** 是否跳过 embedding 生成 (用于测试) */
  skipEmbedding?: boolean
}

/**
 * 验证文件
 *
 * @param fileName - 文件名
 * @param fileSize - 文件大小 (字节)
 * @throws Error 如果文件不符合要求
 */
export function validateFileInput(fileName: string, fileSize: number): void {
  const validation = validateFile(fileName, fileSize)

  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid file')
  }
}

/**
 * 异步处理文件 (完整流程)
 *
 * @param fileBuffer - 文件 Buffer
 * @param fileName - 文件名
 * @param knowledgeBaseId - 知识库 ID
 * @param fileId - 文件 ID
 * @param vectorDbManager - 向量数据库管理器
 * @param config - 处理配置
 * @returns 处理结果
 *
 * @example
 * ```typescript
 * const vectorDb = new VectorDBManager()
 * const result = await processFileAsync(
 *   buffer,
 *   "document.pdf",
 *   "kb-123",
 *   "file-456",
 *   vectorDb,
 *   {
 *     onProgress: (progress) => console.log(progress.percent + "%")
 *   }
 * )
 * ```
 */
export async function processFileAsync(
  fileBuffer: Buffer,
  fileName: string,
  knowledgeBaseId: string,
  fileId: string,
  vectorDbManager: VectorDbManager,
  config: FileProcessorConfig = {}
): Promise<FileProcessingResult> {
  const { onProgress, skipEmbedding = false } = config

  // 用于回滚的资源追踪
  let savedFilePath: string | null = null
  let vectorsInserted = false

  try {
    // ========================================
    // Stage 1: 验证文件 (0-5%)
    // ========================================
    onProgress?.({
      fileId,
      stage: 'validating',
      percent: 0,
      message: 'Validating file',
    })

    validateFileInput(fileName, fileBuffer.length)

    // ========================================
    // Stage 2: 保存文件到本地 (5-15%)
    // ========================================
    onProgress?.({
      fileId,
      stage: 'saving',
      percent: 5,
      message: 'Saving file to local storage',
    })

    const saveResult = await saveFile(fileBuffer, knowledgeBaseId, fileId, fileName)
    savedFilePath = saveResult.storagePath

    // ========================================
    // Stage 3: 提取文本 (15-30%)
    // ========================================
    onProgress?.({
      fileId,
      stage: 'extracting',
      percent: 15,
      message: 'Extracting text from file',
      detail: `Processing ${fileName}`,
    })

    const contentText = await extractTextFromFile(fileBuffer, fileName)

    if (!contentText || contentText.trim().length === 0) {
      throw new TextExtractionError('No text content extracted', 'EXTRACTION_FAILED')
    }

    // ========================================
    // Stage 4: 文本分块 (30-40%)
    // ========================================
    onProgress?.({
      fileId,
      stage: 'chunking',
      percent: 30,
      message: 'Splitting text into chunks',
      detail: `Text length: ${contentText.length} characters`,
    })

    const chunks = generateChunks(contentText, DEFAULT_CHUNK_CONFIG)

    console.log(`[FileProcessor] Generated ${chunks.length} chunks for file ${fileId}`)

    // ========================================
    // Stage 5: 生成 Embeddings (40-90%)
    // ========================================
    if (!skipEmbedding) {
      // 首先确保嵌入模型可用
      onProgress?.({
        fileId,
        stage: 'embedding',
        percent: 40,
        message: 'Ensuring embedding model is available',
        detail: `Checking ${EMBEDDING_CONFIG.DEFAULT_MODEL}`,
      })

      let lastPullPercent = -1
      const modelAvailable = await ensureModelAvailable(
        EMBEDDING_CONFIG.DEFAULT_MODEL,
        (pullProgress) => {
          // 通知用户模型正在下载
          if (pullProgress.total && pullProgress.completed) {
            const percent = Math.round((pullProgress.completed / pullProgress.total) * 100)

            // 只在进度变化 >= 5% 时输出日志和更新进度
            if (percent - lastPullPercent >= 5) {
              console.log(`[FileProcessor] Model pull progress: ${pullProgress.status} ${percent}%`)
              lastPullPercent = percent

              onProgress?.({
                fileId,
                stage: 'embedding',
                percent: 40 + Math.round(percent * 0.1), // 40-50%
                message: `Downloading embedding model: ${percent}%`,
                detail: pullProgress.status,
              })
            }
          } else {
            // 对于没有进度信息的状态,只在状态变化时输出
            console.log(`[FileProcessor] Model pull: ${pullProgress.status}`)
          }
        }
      )

      if (!modelAvailable) {
        throw new Error(`Embedding model ${EMBEDDING_CONFIG.DEFAULT_MODEL} not available and failed to pull`)
      }

      onProgress?.({
        fileId,
        stage: 'embedding',
        percent: 40,
        message: `Generating embeddings for ${chunks.length} chunks`,
        detail: 'Using Ollama nomic-embed-text model',
      })

      const embeddings = await generateEmbeddingsBatchWithRetry(
        chunks,
        {
          concurrency: 1, // 使用串行处理避免 Ollama 崩溃
          onProgress: (embeddingProgress) => {
            // 映射 embedding 进度到总进度 (40% - 90%)
            const percent = 40 + Math.floor((embeddingProgress.percent / 100) * 50)
            onProgress?.({
              fileId,
              stage: 'embedding',
              percent,
              message: `Generating embeddings (${embeddingProgress.processed}/${embeddingProgress.total})`,
              detail: `${embeddingProgress.percent}% completed`,
            })
          },
        },
        3 // 最多重试 3 次
      )

      // ========================================
      // Stage 6: 存储向量到 LanceDB (90-100%)
      // ========================================
      onProgress?.({
        fileId,
        stage: 'storing',
        percent: 90,
        message: 'Storing vectors to database',
        detail: `${embeddings.length} vectors`,
      })

      // 创建向量记录
      const vectorRecords = chunks.map((chunk, index) => ({
        id: `${fileId}_chunk_${index}`,
        fileId,
        content: chunk,
        embedding: embeddings[index],
      }))

      await vectorDbManager.addRecords(knowledgeBaseId, vectorRecords)
      vectorsInserted = true
    }

    // ========================================
    // Stage 7: 完成
    // ========================================
    onProgress?.({
      fileId,
      stage: 'completed',
      percent: 100,
      message: 'File processing completed',
      detail: `${chunks.length} chunks processed`,
    })

    return {
      fileId,
      storagePath: saveResult.storagePath,
      contentText,
      chunksCount: chunks.length,
      fileSize: saveResult.fileSize,
      status: 'completed',
    }

  } catch (error) {
    console.error(`[FileProcessor] Error processing file ${fileId}:`, error)

    // ========================================
    // 错误处理: 回滚已完成的操作
    // ========================================
    await rollbackFileProcessing(
      fileId,
      knowledgeBaseId,
      savedFilePath,
      vectorsInserted,
      vectorDbManager
    )

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    onProgress?.({
      fileId,
      stage: 'failed',
      percent: 0,
      message: 'File processing failed',
      detail: errorMessage,
    })

    throw error instanceof Error ? error : new Error(errorMessage)
  }
}

/**
 * 回滚文件处理 (删除部分完成的操作)
 *
 * @param fileId - 文件 ID
 * @param knowledgeBaseId - 知识库 ID
 * @param savedFilePath - 已保存的文件路径
 * @param vectorsInserted - 是否已插入向量
 * @param vectorDbManager - 向量数据库管理器
 */
export async function rollbackFileProcessing(
  fileId: string,
  knowledgeBaseId: string,
  savedFilePath: string | null,
  vectorsInserted: boolean,
  vectorDbManager: VectorDbManager
): Promise<void> {
  console.warn(`[FileProcessor] Rolling back file processing for ${fileId}`)

  try {
    // 1. 删除向量数据 (如果已插入)
    if (vectorsInserted) {
      console.log(`[FileProcessor] Deleting vectors for file ${fileId}`)
      await vectorDbManager.deleteFileRecords(knowledgeBaseId, fileId)
    }

    // 2. 删除本地文件 (如果已保存)
    if (savedFilePath) {
      console.log(`[FileProcessor] Deleting file ${savedFilePath}`)
      await deleteFile(savedFilePath)
    }

    console.log(`[FileProcessor] Rollback completed for file ${fileId}`)

  } catch (rollbackError) {
    console.error(`[FileProcessor] Error during rollback for ${fileId}:`, rollbackError)
    // 不抛出错误,避免掩盖原始错误
  }
}

/**
 * 批量处理文件
 *
 * @param files - 文件列表 (Buffer, 文件名, 文件ID)
 * @param knowledgeBaseId - 知识库 ID
 * @param vectorDbManager - 向量数据库管理器
 * @param config - 处理配置
 * @returns 处理结果数组
 */
export async function processBatchFiles(
  files: Array<{
    buffer: Buffer
    fileName: string
    fileId: string
  }>,
  knowledgeBaseId: string,
  vectorDbManager: VectorDbManager,
  config: FileProcessorConfig = {}
): Promise<FileProcessingResult[]> {
  const results: FileProcessingResult[] = []

  for (const file of files) {
    const result = await processFileAsync(
      file.buffer,
      file.fileName,
      knowledgeBaseId,
      file.fileId,
      vectorDbManager,
      config
    )

    results.push(result)
  }

  return results
}

/**
 * 估算文件处理时间 (秒)
 *
 * @param fileSize - 文件大小 (字节)
 * @returns 预估处理时间 (秒)
 */
export function estimateProcessingTime(fileSize: number): number {
  // 粗略估算:
  // - 文本提取: ~0.1s/MB
  // - 分块: ~0.05s/MB
  // - Embedding: ~0.2s/chunk (假设每MB约50个chunks)
  const fileSizeMB = fileSize / (1024 * 1024)
  const estimatedChunks = Math.ceil(fileSizeMB * 50)

  const extractTime = fileSizeMB * 0.1
  const chunkTime = fileSizeMB * 0.05
  const embeddingTime = estimatedChunks * 0.2

  return Math.ceil(extractTime + chunkTime + embeddingTime)
}
