import { desc, eq, and, count, inArray } from "drizzle-orm"
import { db } from "../db.js"
import { notes, getNotesQuerySchema } from "../schema.js"
import type { NewNote, UpdateNote } from "../schema.js"
import { z } from "zod"

/**
 * 获取用户的所有笔记（支持分页）
 */
export const getNotes = async (
  userId: string,
  { page, pageSize }: z.infer<typeof getNotesQuerySchema>
) => {
  const note = await db
    .select({
      id: notes.id,
      title: notes.title,
      starred: notes.starred,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [total] = await db
    .select({ count: count() })
    .from(notes)
    .where(eq(notes.userId, userId))

  return { note, totalCount: total.count }
}

/**
 * 获取单个笔记
 */
export const getNoteById = async (noteId: string, userId: string) => {
  const [noteRecord] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1)

  return noteRecord
}

/**
 * 创建新的笔记
 *
 * 创建笔记仅保存数据，不自动触发向量化；由调用方决定何时生成向量
 *
 * @param data - 笔记数据
 * @param options - 创建选项
 * @returns 新创建的笔记
 */
export const createNote = async (
  data: Omit<NewNote, "id" | "createdAt" | "updatedAt">
) => {
  const [newNote] = await db.insert(notes).values(data).returning()

  return newNote
}

/**
 * 更新笔记
 *
 * 如果笔记内容发生变化，可由客户端根据需要手动触发向量化处理
 *
 * @param noteId - 笔记ID
 * @param userId - 用户ID
 * @param data - 要更新的笔记数据
 * @returns 更新后的笔记
 */
export const updateNote = async (
  noteId: string,
  userId: string,
  data: UpdateNote
) => {
  // 更新笔记数据（确保更新时间戳）
  const [updatedNote] = await db
    .update(notes)
    .set({
      ...data,
      updatedAt: new Date(), // 显式更新时间戳
    })
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning()

  return updatedNote
}

/**
 * 删除笔记
 */
export const deleteNote = async (noteId: string, userId: string) => {
  return await db
    .delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
}

/**
 * 验证用户是否拥有指定笔记，返回可访问的笔记 ID 列表
 */
export const validateNoteAccess = async (
  userId: string,
  noteIds: string[]
): Promise<string[]> => {
  if (!noteIds.length) {
    return []
  }

  const accessibleNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.userId, userId), inArray(notes.id, noteIds)))

  return accessibleNotes.map((note) => note.id)
}

/**
 * 为笔记生成向量嵌入
 * 此函数验证笔记所有权并调用处理函数
 *
 * @param noteId - 笔记ID
 * @param userId - 用户ID
 * @param skipTimeCheck - 是否跳过时间阈值检查（新笔记或已确认需要向量化时为true）
 * @returns 处理结果
 */
export const embedNote = async (noteId: string, userId: string) => {
  // 验证笔记所有权
  const note = await getNoteById(noteId, userId)

  if (!note) {
    return {
      success: false,
      error: "Note not found or you don't have permission",
    }
  }

  // 调用笔记向量化处理函数
  const { processNoteEmbedding } = await import(
    "../../src/lib/ai/noteEmbedding.js"
  )
  return await processNoteEmbedding(noteId)
}
