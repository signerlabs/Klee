/**
 * 笔记 IPC 处理器（Private Mode）
 *
 * 提供渲染进程与主进程之间的笔记操作接口
 *
 * 参考: knowledge-base-handlers.ts
 */

import { ipcMain, app } from 'electron'
import { dbManager } from '../local/db/connection-manager'
import * as noteQueries from '../local/db/queries/notes'
import { embedNote, searchNotes } from '../local/services/note-embedding-service'
import { insertLocalNoteSchema, updateLocalNoteSchema } from '../local/db/schema'
import { z } from 'zod'
import * as lancedb from '@lancedb/lancedb'
import path from 'node:path'

/**
 * IPC 通道定义
 */
const DB_CHANNELS = {
  GET_NOTES: 'db:notes:list',
  GET_NOTE: 'db:notes:get',
  CREATE_NOTE: 'db:notes:create',
  UPDATE_NOTE: 'db:notes:update',
  DELETE_NOTE: 'db:notes:delete',
  EMBED_NOTE: 'db:notes:embed',
  SEARCH_NOTES: 'db:notes:search',
} as const

/**
 * LanceDB 连接（懒加载）
 */
let lanceDbConnection: lancedb.Connection | null = null

/**
 * 获取 LanceDB 连接
 */
async function getLanceDbConnection(): Promise<lancedb.Connection> {
  if (!lanceDbConnection) {
    const dbPath = path.join(app.getPath('userData'), 'vector-db')
    lanceDbConnection = await lancedb.connect(dbPath)
  }
  return lanceDbConnection
}

/**
 * 检查笔记向量表是否存在
 */
async function noteTableExists(noteId: string): Promise<boolean> {
  try {
    const db = await getLanceDbConnection()
    const tableName = `note_${noteId}`
    const tables = await db.tableNames()
    return tables.includes(tableName)
  } catch (error) {
    console.error(`[NoteHandlers] Failed to check table existence:`, error)
    return false
  }
}

/**
 * 删除笔记向量表
 */
async function dropNoteTable(noteId: string): Promise<void> {
  const db = await getLanceDbConnection()
  const tableName = `note_${noteId}`
  await db.dropTable(tableName)
}

/**
 * 注册所有笔记相关的 IPC 处理器
 */
export function registerNoteHandlers() {
  /**
   * 获取所有笔记
   */
  ipcMain.handle(DB_CHANNELS.GET_NOTES, async () => {
    try {
      const db = await dbManager.getConnection('private')

      if (!db) {
        return { success: false, error: 'Database not initialized' }
      }

      const notes = await noteQueries.getNotes(db as any)
      return { success: true, data: notes }
    } catch (error: any) {
      console.error('[IPC:GetNotes] Error:', error)
      return { success: false, error: error.message || 'Failed to fetch notes' }
    }
  })

  /**
   * 获取单个笔记
   */
  ipcMain.handle(DB_CHANNELS.GET_NOTE, async (_event, request: { noteId: string }) => {
    try {
      const db = await dbManager.getConnection('private')

      if (!db) {
        return { success: false, error: 'Database not initialized' }
      }

      const note = await noteQueries.getNote(db as any, request.noteId)

      if (!note) {
        return { success: false, error: 'Note not found' }
      }

      return { success: true, data: note }
    } catch (error: any) {
      console.error('[IPC:GetNote] Error:', error)
      return { success: false, error: error.message || 'Failed to fetch note' }
    }
  })

  /**
   * 创建笔记
   */
  ipcMain.handle(DB_CHANNELS.CREATE_NOTE, async (_event, request: any) => {
    try {
      const db = await dbManager.getConnection('private')

      if (!db) {
        return { success: false, error: 'Database not initialized' }
      }

      // 验证请求数据
      const validated = insertLocalNoteSchema.parse(request)

      const note = await noteQueries.createNote(db as any, validated)
      return { success: true, data: note }
    } catch (error: any) {
      console.error('[IPC:CreateNote] Error:', error)

      if (error instanceof z.ZodError) {
        return { success: false, error: error.errors[0].message }
      }

      return { success: false, error: error.message || 'Failed to create note' }
    }
  })

  /**
   * 更新笔记
   */
  ipcMain.handle(
    DB_CHANNELS.UPDATE_NOTE,
    async (_event, request: { noteId: string; data: any }) => {
      try {
        const db = await dbManager.getConnection('private')

        if (!db) {
          return { success: false, error: 'Database not initialized' }
        }

        // 验证更新数据
        const validated = updateLocalNoteSchema.parse(request.data)

        const note = await noteQueries.updateNote(db as any, request.noteId, validated)

        if (!note) {
          return { success: false, error: 'Note not found' }
        }

        return { success: true, data: note }
      } catch (error: any) {
        console.error('[IPC:UpdateNote] Error:', error)

        if (error instanceof z.ZodError) {
          return { success: false, error: error.errors[0].message }
        }

        return { success: false, error: error.message || 'Failed to update note' }
      }
    }
  )

  /**
   * 删除笔记
   */
  ipcMain.handle(DB_CHANNELS.DELETE_NOTE, async (_event, request: { noteId: string }) => {
    try {
      const db = await dbManager.getConnection('private')

      if (!db) {
        return { success: false, error: 'Database not initialized' }
      }

      // 1. 删除 SQLite 记录
      await noteQueries.deleteNote(db as any, request.noteId)

      // 2. 删除 LanceDB 向量表 (如果存在)
      try {
        const tableExists = await noteTableExists(request.noteId)

        if (tableExists) {
          await dropNoteTable(request.noteId)
          console.log(`[IPC:DeleteNote] Deleted vector table: note_${request.noteId}`)
        }
      } catch (vectorError) {
        // 向量表可能不存在（笔记未嵌入），不影响删除操作
        console.warn(`[IPC:DeleteNote] Vector table cleanup warning:`, vectorError)
      }

      return { success: true }
    } catch (error: any) {
      console.error('[IPC:DeleteNote] Error:', error)
      return { success: false, error: error.message || 'Failed to delete note' }
    }
  })

  /**
   * 生成笔记 embeddings
   */
  ipcMain.handle(DB_CHANNELS.EMBED_NOTE, async (event, request: { noteId: string }) => {
    try {
      const db = await dbManager.getConnection('private')

      if (!db) {
        return { success: false, error: 'Database not initialized' }
      }

      console.log(`[IPC:EmbedNote] Starting embedding for note ${request.noteId}`)

      // 调用 embedding 服务 (带进度回调)
      const result = await embedNote(request.noteId, (progress) => {
        // 发送进度事件到渲染进程
        event.sender.send('db:notes:embedding-progress', {
          noteId: request.noteId,
          percent: progress.percent,
          message: progress.message,
        })
      })

      // 发送完成事件
      event.sender.send('db:notes:embedding-complete', {
        noteId: request.noteId,
        chunksCount: result.chunksCount,
      })

      console.log(
        `[IPC:EmbedNote] Successfully embedded note ${request.noteId} (${result.chunksCount} chunks)`
      )

      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC:EmbedNote] Error:', error)

      // 发送失败事件
      event.sender.send('db:notes:embedding-failed', {
        noteId: request.noteId,
        error: error.message,
      })

      return { success: false, error: error.message || 'Failed to embed note' }
    }
  })

  /**
   * RAG 向量搜索
   */
  ipcMain.handle(
    DB_CHANNELS.SEARCH_NOTES,
    async (_event, request: { query: string; noteIds: string[]; limit?: number }) => {
      try {
        console.log(`[IPC:SearchNotes] Searching in ${request.noteIds.length} notes`)

        const results = await searchNotes(request.query, request.noteIds, request.limit || 5)

        console.log(`[IPC:SearchNotes] Found ${results.length} results`)

        return { success: true, data: results }
      } catch (error: any) {
        console.error('[IPC:SearchNotes] Error:', error)
        return { success: false, error: error.message || 'Failed to search notes' }
      }
    }
  )

  console.log('[NoteHandlers] All note IPC handlers registered')
}
