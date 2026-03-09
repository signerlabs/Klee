/**
 * 本地知识库 IPC 处理器（Private Mode）
 *
 * 提供渲染进程与主进程之间的知识库操作接口
 */

import { ipcMain, BrowserWindow } from 'electron'
import { dbManager } from '../local/db/connection-manager'
import {
  getAllKnowledgeBases,
  getKnowledgeBaseById,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  toggleKnowledgeBaseStar,
} from '../local/db/queries/knowledge-bases'
import {
  getFilesByKnowledgeBaseId,
  createKnowledgeBaseFile,
  deleteKnowledgeBaseFile,
} from '../local/db/queries/knowledge-base-files'
import { wrapIPCHandler, validateParams, IPCLogger } from './error-handler'
import { DB_CHANNELS, VECTOR_CHANNELS, IPCErrorCode } from './channels'
import { generateEmbedding, ensureModelAvailable } from '../local/services/embedding-service'
import {
  createKnowledgeBaseRequestSchema,
  updateLocalKnowledgeBaseSchema,
  uuidSchema,
  localKnowledgeBaseFiles,
} from '../local/db/schema'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { processFileAsync } from '../local/services/file-processor'
import { VectorDbManager } from '../local/services/vector-db-manager'
import { updateFileStatus } from '../local/db/queries/knowledge-base-files'
import { generateStoragePath } from '../local/services/storage-service'
import { randomUUID } from 'crypto'
import { TextExtractionError } from '../local/lib/text-extractor'

// 全局向量数据库管理器实例
let vectorDbManager: VectorDbManager | null = null

// 全局文件处理队列（确保同一时间只处理一个文件）
// 这对于 Ollama embedding 至关重要，避免 Metal GPU 崩溃
let fileProcessingQueue: Promise<any> = Promise.resolve()

/**
 * 获取或创建向量数据库管理器
 */
async function getVectorDbManager(): Promise<VectorDbManager> {
  if (!vectorDbManager) {
    vectorDbManager = new VectorDbManager()
    await vectorDbManager.connect()
  }
  return vectorDbManager
}

/**
 * 注册所有知识库相关的 IPC 处理器
 */
export function registerKnowledgeBaseHandlers() {
  /**
   * 获取所有知识库
   */
  ipcMain.handle(
    DB_CHANNELS.GET_KNOWLEDGE_BASES,
    wrapIPCHandler(async (event) => {
      const db = await dbManager.getConnection('private')

      if (!db) {
        throw new Error('Private mode database not initialized')
      }

      IPCLogger.debug(DB_CHANNELS.GET_KNOWLEDGE_BASES, 'Fetching all knowledge bases')

      const knowledgeBases = await getAllKnowledgeBases(db as any)

      IPCLogger.debug(
        DB_CHANNELS.GET_KNOWLEDGE_BASES,
        `Fetched ${knowledgeBases.length} knowledge bases`
      )

      return { knowledgeBases }
    }, IPCErrorCode.DB_QUERY_ERROR)
  )

  /**
   * 创建新的知识库
   */
  ipcMain.handle(
    DB_CHANNELS.CREATE_KNOWLEDGE_BASE,
    wrapIPCHandler(
      validateParams(createKnowledgeBaseRequestSchema)(async (_event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.info(DB_CHANNELS.CREATE_KNOWLEDGE_BASE, 'Creating knowledge base', params)

        const knowledgeBase = await createKnowledgeBase(db as any, params)

        // 创建对应的向量表
        const vectorDb = await getVectorDbManager()
        await vectorDb.createTable(knowledgeBase.id)

        IPCLogger.info(
          DB_CHANNELS.CREATE_KNOWLEDGE_BASE,
          'Knowledge base and vector table created successfully',
          knowledgeBase.id
        )

        return { knowledgeBase }
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 获取指定 ID 的知识库（包含文件列表）
   */
  ipcMain.handle(
    DB_CHANNELS.GET_KNOWLEDGE_BASE,
    wrapIPCHandler(
      validateParams(z.object({ id: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.debug(DB_CHANNELS.GET_KNOWLEDGE_BASE, 'Fetching knowledge base', params.id)

        const knowledgeBase = await getKnowledgeBaseById(db as any, params.id)

        if (!knowledgeBase) {
          IPCLogger.debug(DB_CHANNELS.GET_KNOWLEDGE_BASE, 'Knowledge base not found', params.id)
          return null
        }

        // 获取关联的文件列表
        const files = await getFilesByKnowledgeBaseId(db as any, params.id)

        IPCLogger.debug(
          DB_CHANNELS.GET_KNOWLEDGE_BASE,
          `Found knowledge base with ${files.length} files`
        )

        return {
          knowledgeBase,
          files,
        }
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 更新知识库
   */
  ipcMain.handle(
    DB_CHANNELS.UPDATE_KNOWLEDGE_BASE,
    wrapIPCHandler(
      validateParams(
        z.object({
          id: uuidSchema,
          data: updateLocalKnowledgeBaseSchema,
        })
      )(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.info(DB_CHANNELS.UPDATE_KNOWLEDGE_BASE, 'Updating knowledge base', params.id)

        const updated = await updateKnowledgeBase(db as any, params.id, params.data)

        if (!updated) {
          throw new Error(`Failed to update knowledge base: ${params.id}`)
        }

        IPCLogger.info(DB_CHANNELS.UPDATE_KNOWLEDGE_BASE, 'Knowledge base updated successfully')

        return { knowledgeBase: updated }
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 删除知识库（级联删除文件和向量）
   */
  ipcMain.handle(
    DB_CHANNELS.DELETE_KNOWLEDGE_BASE,
    wrapIPCHandler(
      validateParams(z.object({ id: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.warn(DB_CHANNELS.DELETE_KNOWLEDGE_BASE, 'Deleting knowledge base', params.id)

        // 1. 删除向量表
        const vectorDb = await getVectorDbManager()
        const tableExists = await vectorDb.tableExists(params.id)
        if (tableExists) {
          await vectorDb.dropTable(params.id)
          IPCLogger.info(DB_CHANNELS.DELETE_KNOWLEDGE_BASE, 'Vector table deleted', params.id)
        }

        // 2. 删除 SQLite 记录（外键约束会自动级联删除文件记录）
        const success = await deleteKnowledgeBase(db as any, params.id)

        if (!success) {
          throw new Error(`Knowledge base not found: ${params.id}`)
        }

        IPCLogger.info(
          DB_CHANNELS.DELETE_KNOWLEDGE_BASE,
          'Knowledge base deleted successfully',
          params.id
        )

        return { deleted: true }
      }),
      IPCErrorCode.RECORD_NOT_FOUND
    )
  )

  /**
   * 切换知识库的星标状态
   */
  ipcMain.handle(
    DB_CHANNELS.STAR_KNOWLEDGE_BASE,
    wrapIPCHandler(
      validateParams(z.object({ id: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.info(
          DB_CHANNELS.STAR_KNOWLEDGE_BASE,
          'Toggling star for knowledge base',
          params.id
        )

        const updated = await toggleKnowledgeBaseStar(db as any, params.id)

        if (!updated) {
          throw new Error(`Knowledge base not found: ${params.id}`)
        }

        IPCLogger.info(
          DB_CHANNELS.STAR_KNOWLEDGE_BASE,
          `Knowledge base star toggled to ${updated.starred}`
        )

        return { knowledgeBase: updated }
      }),
      IPCErrorCode.RECORD_NOT_FOUND
    )
  )

  /**
   * 上传文件到知识库（异步处理）
   */
  ipcMain.handle(
    DB_CHANNELS.UPLOAD_DOCUMENT,
    wrapIPCHandler(
      validateParams(
        z.object({
          knowledgeBaseId: uuidSchema,
          fileBuffer: z
            .union([z.instanceof(Buffer), z.instanceof(Uint8Array)])
            .transform((val) => Buffer.from(val)),
          fileName: z.string().min(1),
          fileSize: z.number().positive(),
        })
      )(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.info(
          DB_CHANNELS.UPLOAD_DOCUMENT,
          'Starting file upload',
          `${params.fileName} to KB ${params.knowledgeBaseId}`
        )

        // 预生成文件 ID 和存储路径
        const fileId = randomUUID()
        const storagePath = generateStoragePath(params.knowledgeBaseId, fileId, params.fileName)

        // 创建文件记录（初始状态为 processing）
        await createKnowledgeBaseFile(db as any, {
          id: fileId,
          knowledgeBaseId: params.knowledgeBaseId,
          fileName: params.fileName,
          fileSize: params.fileSize,
          fileType: '', // 将由 processFileAsync 推断
          storagePath: storagePath,
          status: 'processing',
        })

        // 获取向量数据库管理器
        const vectorDb = await getVectorDbManager()

        // 将文件处理加入全局队列（确保串行处理，避免 Ollama 崩溃）
        // 这是关键修复：即使用户上传多个文件，也会一个接一个处理
        fileProcessingQueue = fileProcessingQueue.then(async () => {
          IPCLogger.info(
            DB_CHANNELS.UPLOAD_DOCUMENT,
            'Starting queued file processing',
            params.fileName
          )

          return processFileAsync(
            params.fileBuffer,
            params.fileName,
            params.knowledgeBaseId,
            fileId,
            vectorDb,
            {
              onProgress: (progress) => {
                // 发送进度事件到渲染进程
                const win = BrowserWindow.getAllWindows()[0]
                if (win) {
                  win.webContents.send('file-processing-progress', progress)
                }
              },
            }
          )
            .then(async (result) => {
              // 更新文件状态为 completed
              await updateFileStatus(db as any, fileId, 'completed', result.contentText)

              // 还需要更新 storagePath
              await db
                .update(localKnowledgeBaseFiles)
                .set({ storagePath: result.storagePath })
                .where(eq(localKnowledgeBaseFiles.id, fileId))

              IPCLogger.info(
                DB_CHANNELS.UPLOAD_DOCUMENT,
                'File processing completed',
                `${params.fileName} (${result.chunksCount} chunks)`
              )

              // 通知渲染进程刷新
              const win = BrowserWindow.getAllWindows()[0]
              if (win) {
                win.webContents.send('file-processing-complete', {
                  knowledgeBaseId: params.knowledgeBaseId,
                  fileId,
                  status: 'completed',
                })
              }
            })
            .catch(async (error) => {
              const isTextExtractionError = error instanceof TextExtractionError
              const errorMessage = isTextExtractionError
                ? 'Unable to extract text from this document. Please ensure the file contains selectable text (not just images) and try again.'
                : error instanceof Error
                  ? error.message
                  : 'Unknown error'

              IPCLogger.error(DB_CHANNELS.UPLOAD_DOCUMENT, 'File processing failed', errorMessage)

              try {
                await deleteKnowledgeBaseFile(db as any, fileId)
              } catch (deleteError) {
                IPCLogger.error(
                  DB_CHANNELS.UPLOAD_DOCUMENT,
                  'Failed to remove failed knowledge base file record',
                  deleteError instanceof Error ? deleteError.message : deleteError
                )
              }

              const win = BrowserWindow.getAllWindows()[0]
              if (win) {
                win.webContents.send('file-processing-error', {
                  fileId,
                  knowledgeBaseId: params.knowledgeBaseId,
                  message: errorMessage,
                })
                win.webContents.send('file-processing-complete', {
                  knowledgeBaseId: params.knowledgeBaseId,
                  fileId,
                  status: 'failed',
                })
              }
            })
        })

        // 立即返回文件 ID 和状态（处理在后台进行）
        return {
          fileId,
          status: 'processing',
        }
      }),
      IPCErrorCode.FILE_WRITE_ERROR
    )
  )

  /**
   * 删除知识库文件
   */
  ipcMain.handle(
    DB_CHANNELS.DELETE_DOCUMENT,
    wrapIPCHandler(
      validateParams(
        z.object({
          knowledgeBaseId: uuidSchema,
          fileId: uuidSchema,
        })
      )(async (_event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        console.log('[DELETE_DOCUMENT] ========== START DELETE OPERATION ==========')
        console.log('[DELETE_DOCUMENT] Knowledge Base ID:', params.knowledgeBaseId)
        console.log('[DELETE_DOCUMENT] File ID:', params.fileId)

        IPCLogger.warn(
          DB_CHANNELS.DELETE_DOCUMENT,
          'Deleting file',
          `File ${params.fileId} from KB ${params.knowledgeBaseId}`
        )

        // 1. 删除向量记录
        console.log('[DELETE_DOCUMENT] Step 1: Checking if vector table exists...')
        const vectorDb = await getVectorDbManager()
        const tableExists = await vectorDb.tableExists(params.knowledgeBaseId)
        console.log('[DELETE_DOCUMENT] Vector table exists:', tableExists)

        if (tableExists) {
          console.log('[DELETE_DOCUMENT] Deleting vector records...')
          await vectorDb.deleteFileRecords(params.knowledgeBaseId, params.fileId)
          console.log('[DELETE_DOCUMENT] Vector records deleted successfully')
          IPCLogger.info(
            DB_CHANNELS.DELETE_DOCUMENT,
            'Vector records deleted',
            `File ${params.fileId}`
          )
        } else {
          console.log('[DELETE_DOCUMENT] No vector table, skipping vector deletion')
        }

        // 2. 删除文件记录（SQLite）
        console.log('[DELETE_DOCUMENT] Step 2: Deleting SQLite record...')
        const success = await deleteKnowledgeBaseFile(db as any, params.fileId)
        console.log('[DELETE_DOCUMENT] SQLite delete result:', success)

        if (!success) {
          console.error('[DELETE_DOCUMENT] File not found in SQLite:', params.fileId)
          throw new Error(`File not found: ${params.fileId}`)
        }

        console.log('[DELETE_DOCUMENT] File deleted successfully from both vector DB and SQLite')
        console.log('[DELETE_DOCUMENT] ========== END DELETE OPERATION ==========')

        IPCLogger.info(DB_CHANNELS.DELETE_DOCUMENT, 'File deleted successfully', params.fileId)

        return { deleted: true }
      }),
      IPCErrorCode.RECORD_NOT_FOUND
    )
  )

  /**
   * 向量搜索知识库
   */
  ipcMain.handle(
    VECTOR_CHANNELS.SEARCH,
    wrapIPCHandler(
      validateParams(
        z.object({
          query: z.string().min(1, 'Query cannot be empty'),
          knowledgeBaseIds: z.array(uuidSchema).min(1, 'At least one knowledge base ID required'),
          limit: z.number().int().positive().max(20).optional().default(5),
        })
      )(async (_event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.info(
          VECTOR_CHANNELS.SEARCH,
          `Searching in ${params.knowledgeBaseIds.length} knowledge bases`,
          `Query: "${params.query.substring(0, 50)}..."`
        )

        // 1. 确保 embedding 模型可用
        const modelAvailable = await ensureModelAvailable()
        if (!modelAvailable) {
          throw new Error('Embedding model not available. Please download nomic-embed-text model first.')
        }

        IPCLogger.debug(VECTOR_CHANNELS.SEARCH, 'Embedding model confirmed available')

        // 2. 生成查询向量
        const queryEmbedding = await generateEmbedding(params.query)

        IPCLogger.debug(VECTOR_CHANNELS.SEARCH, 'Query embedding generated')

        // 3. 在多个知识库中搜索
        const vectorDb = await getVectorDbManager()
        const searchResults = await vectorDb.searchMultiple(
          params.knowledgeBaseIds,
          queryEmbedding,
          params.limit
        )

        IPCLogger.debug(
          VECTOR_CHANNELS.SEARCH,
          `Found ${searchResults.length} vector search results`
        )

        // 4. 从数据库获取文件名信息
        // 将 fileId 映射到文件名
        const fileIds = [...new Set(searchResults.map((r) => r.fileId))]
        const fileMap = new Map<string, { fileName: string; knowledgeBaseId: string }>()

        for (const fileId of fileIds) {
          const file = await db.query.localKnowledgeBaseFiles.findFirst({
            where: (files, { eq }) => eq(files.id, fileId),
            columns: {
              fileName: true,
              knowledgeBaseId: true,
            },
          })

          if (file) {
            fileMap.set(fileId, {
              fileName: file.fileName,
              knowledgeBaseId: file.knowledgeBaseId,
            })
          }
        }

        // 5. 组装最终结果 (包含文件名和知识库ID)
        const results = searchResults.map((result) => {
          const fileInfo = fileMap.get(result.fileId)
          return {
            id: result.id,
            fileId: result.fileId,
            fileName: fileInfo?.fileName || 'Unknown',
            knowledgeBaseId: fileInfo?.knowledgeBaseId || '',
            content: result.content,
            similarity: 1 - result._distance, // 转换为相似度 (0-1, 越大越相似)
          }
        })

        IPCLogger.info(
          VECTOR_CHANNELS.SEARCH,
          `Search completed, returning ${results.length} results`
        )

        return { results }
      }),
      IPCErrorCode.VECTOR_SEARCH_FAILED
    )
  )

  IPCLogger.info('knowledge-base-handlers', 'All knowledge base IPC handlers registered')
}
