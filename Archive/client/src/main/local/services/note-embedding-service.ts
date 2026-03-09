/**
 * Note Embedding Service
 *
 * 负责笔记的 embedding 生成和向量搜索:
 * 1. 文本分块 (splitIntoChunks)
 * 2. Embedding 生成 (embedNote)
 * 3. RAG 搜索 (searchNotes)
 *
 * 参考: file-processor.ts (Knowledge Base 文件处理逻辑)
 */

import {
  generateEmbeddingsBatchWithRetry,
  generateEmbedding,
} from './embedding-service'
import { VectorDbManager } from './vector-db-manager'
import * as noteQueries from '../db/queries/notes'
import { EMBEDDING_CONFIG } from '../../../../config/local.config'
import { dbManager } from '../db/connection-manager'

const vectorDbManager = new VectorDbManager()

/**
 * 全局串行队列 - 避免 M4 Mac Metal GPU 并发崩溃
 */
let embeddingQueue: Promise<any> = Promise.resolve()

/**
 * 创建笔记向量表
 */
async function createNoteTable(noteId: string): Promise<void> {
  await vectorDbManager.connect()
  const db = (vectorDbManager as any).connection
  if (!db) {
    throw new Error('VectorDB connection not established')
  }

  const tableName = `note_${noteId}`
  await db.createTable(tableName, [
    {
      id: 'placeholder',
      fileId: 'placeholder',
      content: 'placeholder',
      embedding: new Array(768).fill(0),
    },
  ])
}

/**
 * 添加记录到笔记向量表
 */
async function addNoteRecords(noteId: string, records: any[]): Promise<void> {
  await vectorDbManager.connect()
  const db = (vectorDbManager as any).connection
  if (!db) {
    throw new Error('VectorDB connection not established')
  }

  const tableName = `note_${noteId}`
  const table = await db.openTable(tableName)
  await table.add(records)
}

/**
 * 删除笔记向量表
 */
async function dropNoteTable(noteId: string): Promise<void> {
  await vectorDbManager.connect()
  const db = (vectorDbManager as any).connection
  if (!db) {
    throw new Error('VectorDB connection not established')
  }

  const tableName = `note_${noteId}`
  await db.dropTable(tableName)
}

/**
 * 检查笔记向量表是否存在
 */
async function noteTableExists(noteId: string): Promise<boolean> {
  try {
    await vectorDbManager.connect()
    const db = (vectorDbManager as any).connection
    if (!db) {
      return false
    }

    const tableName = `note_${noteId}`
    const tables = await db.tableNames()
    return tables.includes(tableName)
  } catch (error) {
    console.error(`[NoteEmbedding] Failed to check table existence:`, error)
    return false
  }
}

/**
 * 在笔记向量表中搜索
 */
async function searchNoteTable(
  noteId: string,
  queryEmbedding: number[],
  limit: number
): Promise<any[]> {
  await vectorDbManager.connect()
  const db = (vectorDbManager as any).connection
  if (!db) {
    throw new Error('VectorDB connection not established')
  }

  const tableName = `note_${noteId}`
  const table = await db.openTable(tableName)
  const results = await table.search(queryEmbedding).limit(limit).toArray()
  return results
}

/**
 * 文本分块函数
 *
 * @param text - 笔记内容
 * @param maxSize - 每块最大字符数 (默认 1000)
 * @param overlap - 重叠字符数 (默认 200)
 * @returns 文本块数组
 */
export function splitIntoChunks(
  text: string,
  maxSize: number = EMBEDDING_CONFIG.CHUNK_CONFIG.MAX_CHUNK_SIZE,
  overlap: number = EMBEDDING_CONFIG.CHUNK_CONFIG.CHUNK_OVERLAP
): string[] {
  // 处理空文本
  if (!text || text.trim().length === 0) {
    return []
  }

  const chunks: string[] = []
  let startIndex = 0

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + maxSize, text.length)
    const chunk = text.slice(startIndex, endIndex)

    // 仅添加非空块
    if (chunk.trim().length > 0) {
      chunks.push(chunk)
    }

    // 滑动窗口 (重叠)
    startIndex += maxSize - overlap

    // 避免无限循环
    if (startIndex >= text.length) {
      break
    }
  }

  return chunks
}

/**
 * Embedding 进度回调
 */
export interface EmbeddingProgress {
  percent: number
  message: string
  current?: number
  total?: number
}

/**
 * Embedding 结果
 */
export interface EmbedNoteResult {
  success: boolean
  chunksCount: number
  textLength: number
}

/**
 * 生成笔记 embeddings
 *
 * @param noteId - 笔记 ID
 * @param onProgress - 进度回调函数
 * @returns Embedding 结果
 * @throws Error 如果笔记不存在或 embedding 失败
 */
export async function embedNote(
  noteId: string,
  onProgress?: (progress: EmbeddingProgress) => void
): Promise<EmbedNoteResult> {
  // 加入全局队列 (串行执行)
  embeddingQueue = embeddingQueue.then(async () => {
    let createdTable = false

    try {
      // 1. 获取笔记
      onProgress?.({ percent: 0, message: 'Loading note...' })
      const db = await dbManager.getConnection('private')
      if (!db) {
        throw new Error('Database not initialized')
      }

      const note = await noteQueries.getNote(db as any, noteId)

      if (!note) {
        throw new Error('Note not found')
      }

      // 处理空内容
      if (!note.content || note.content.trim().length === 0) {
        throw new Error('Note content is empty')
      }

      // 2. 分块
      onProgress?.({ percent: 10, message: 'Splitting text into chunks...' })
      const chunks = splitIntoChunks(note.content)

      if (chunks.length === 0) {
        throw new Error('No text chunks generated')
      }

      console.log(`[NoteEmbedding] Generating embeddings for ${chunks.length} chunks`)

      // 3. 生成 embeddings (串行, 带重试)
      const embeddings = await generateEmbeddingsBatchWithRetry(
        chunks,
        {
          onProgress: (progress) => {
            onProgress?.({
              percent: 10 + Math.floor((progress.percent / 100) * 70), // 10-80%
              message: `Embedding chunk ${progress.processed}/${progress.total}`,
              current: progress.processed,
              total: progress.total,
            })
          },
        },
        3 // maxRetries
      )

      // 4. 创建或重建向量表
      onProgress?.({ percent: 80, message: 'Creating vector table...' })

      // 如果表已存在，先删除它（重新生成 embedding）
      const tableExists = await noteTableExists(noteId)
      if (tableExists) {
        console.log(`[NoteEmbedding] Table exists, dropping old table for note ${noteId}`)
        await dropNoteTable(noteId)
      }

      await createNoteTable(noteId)
      createdTable = true

      // 5. 存储向量
      onProgress?.({ percent: 90, message: 'Storing embeddings...' })
      const records = chunks.map((chunk, i) => ({
        id: `${noteId}_chunk_${i}`,
        fileId: noteId, // 使用 noteId 作为 fileId（兼容 VectorRecord 接口）
        content: chunk,
        embedding: embeddings[i],
      }))

      await addNoteRecords(noteId, records)

      onProgress?.({ percent: 100, message: 'Embedding complete!' })

      return {
        success: true,
        chunksCount: chunks.length,
        textLength: note.content.length,
      }
    } catch (error) {
      console.error('[NoteEmbedding] Error:', error)

      // 回滚: 删除已创建的向量表
      if (createdTable) {
        try {
          await dropNoteTable(noteId)
        } catch (cleanupError) {
          console.error('[NoteEmbedding] Cleanup failed:', cleanupError)
        }
      }

      throw error
    }
  })

  return embeddingQueue
}

/**
 * RAG 搜索结果
 */
export interface NoteSearchResult {
  content: string
  similarity: number
  sourceType: 'note'
  sourceId: string
  sourceName: string
}

/**
 * RAG 向量搜索
 *
 * @param query - 查询文本
 * @param noteIds - 笔记 ID 数组
 * @param limit - 返回结果数量 (默认 5)
 * @returns 搜索结果数组 (按相似度降序)
 */
export async function searchNotes(
  query: string,
  noteIds: string[],
  limit: number = 5
): Promise<NoteSearchResult[]> {
  try {
    // 0. 获取数据库连接
    const db = await dbManager.getConnection('private')
    if (!db) {
      throw new Error('Database not initialized')
    }

    // 1. 生成查询向量
    const queryEmbedding = await generateEmbedding(query)

    // 2. 并行搜索所有笔记
    const searchPromises = noteIds.map(async (noteId) => {
      try {
        // 检查表是否存在
        const tableExists = await noteTableExists(noteId)
        if (!tableExists) {
          console.warn(`[NoteSearch] Vector table not found for note ${noteId}`)
          return []
        }

        // 搜索向量
        const results = await searchNoteTable(noteId, queryEmbedding, limit)

        // 附加笔记元数据
        const note = await noteQueries.getNote(db as any, noteId)
        return results.map((r: any) => ({
          content: r.content,
          similarity: 1 - r._distance, // 余弦距离 → 相似度
          sourceType: 'note' as const,
          sourceId: noteId,
          sourceName: note?.title || 'Untitled',
        }))
      } catch (error) {
        console.error(`[NoteSearch] Error searching note ${noteId}:`, error)
        return []
      }
    })

    // 3. 合并并排序结果
    const allResults = (await Promise.all(searchPromises)).flat()
    const sortedResults = allResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    console.log(`[NoteSearch] Found ${sortedResults.length} results`)
    return sortedResults
  } catch (error) {
    console.error('[NoteSearch] Error:', error)
    throw error
  }
}
