/**
 * Private Mode 笔记类型定义
 *
 * 对应主进程的 LocalNote 类型 (client/src/main/local/db/schema.ts)
 */

/**
 * 本地笔记接口
 */
export interface LocalNote {
  id: string
  title: string
  content: string
  starred: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * IPC 通用响应格式
 */
export interface IPCResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 获取笔记列表响应
 */
export type GetNotesResponse = IPCResponse<LocalNote[]>

/**
 * 获取单个笔记响应
 */
export type GetNoteResponse = IPCResponse<LocalNote>

/**
 * 创建笔记请求
 */
export interface CreateNoteRequest {
  title: string
  content?: string
}

/**
 * 创建笔记响应
 */
export type CreateNoteResponse = IPCResponse<LocalNote>

/**
 * 更新笔记请求
 */
export interface UpdateNoteRequest {
  noteId: string
  data: {
    title?: string
    content?: string
    starred?: boolean
  }
}

/**
 * 更新笔记响应
 */
export type UpdateNoteResponse = IPCResponse<LocalNote>

/**
 * 删除笔记请求
 */
export interface DeleteNoteRequest {
  noteId: string
}

/**
 * 删除笔记响应
 */
export type DeleteNoteResponse = IPCResponse<void>

/**
 * Embed 笔记请求
 */
export interface EmbedNoteRequest {
  noteId: string
}

/**
 * Embed 笔记结果数据
 */
export interface EmbedNoteData {
  chunksCount: number
  textLength: number
}

/**
 * Embed 笔记响应
 */
export type EmbedNoteResponse = IPCResponse<EmbedNoteData>

/**
 * Embedding 进度事件
 */
export interface EmbeddingProgressEvent {
  noteId: string
  percent: number
  message: string
}

/**
 * Embedding 完成事件
 */
export interface EmbeddingCompleteEvent {
  noteId: string
  chunksCount: number
}

/**
 * Embedding 失败事件
 */
export interface EmbeddingFailedEvent {
  noteId: string
  error: string
}

/**
 * 搜索笔记请求
 */
export interface SearchNotesRequest {
  query: string
  noteIds: string[]
  limit?: number
}

/**
 * 搜索结果
 */
export interface NoteSearchResult {
  content: string
  similarity: number
  sourceType: 'note'
  sourceId: string
  sourceName: string
}

/**
 * 搜索笔记响应
 */
export type SearchNotesResponse = IPCResponse<NoteSearchResult[]>
