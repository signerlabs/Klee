/**
 * Private Mode 笔记查询函数
 *
 * 参考: server/db/queries/note.ts (Cloud Mode)
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq, desc } from 'drizzle-orm'
import {
  localNotes,
  type LocalNote,
  type NewLocalNote,
  type insertLocalNoteSchema,
} from '../schema'
import { v4 as uuidv4 } from 'uuid'
import * as schema from '../schema'

/**
 * 获取所有笔记
 *
 * @param db - 数据库实例
 * @returns 笔记列表，按更新时间倒序排列
 */
export async function getNotes(db: BetterSQLite3Database<typeof schema>): Promise<LocalNote[]> {
  return await db.select().from(localNotes).orderBy(desc(localNotes.updatedAt)).all()
}

/**
 * 获取单个笔记
 *
 * @param db - 数据库实例
 * @param noteId - 笔记 ID
 * @returns 笔记对象，如果不存在则返回 undefined
 */
export async function getNote(
  db: BetterSQLite3Database<typeof schema>,
  noteId: string
): Promise<LocalNote | undefined> {
  const results = await db.select().from(localNotes).where(eq(localNotes.id, noteId)).limit(1).all()

  return results[0]
}

/**
 * 创建笔记
 *
 * @param db - 数据库实例
 * @param data - 笔记数据（不包含 id, createdAt, updatedAt）
 * @returns 新创建的笔记对象
 */
export async function createNote(
  db: BetterSQLite3Database<typeof schema>,
  data: Omit<NewLocalNote, 'id' | 'createdAt' | 'updatedAt'>
): Promise<LocalNote> {
  const now = new Date()
  const newNote: NewLocalNote = {
    id: uuidv4(),
    title: data.title,
    content: data.content ?? '',
    starred: data.starred ?? false,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(localNotes).values(newNote).run()

  return newNote as LocalNote
}

/**
 * 更新笔记
 *
 * @param db - 数据库实例
 * @param noteId - 笔记 ID
 * @param data - 更新的数据（部分字段）
 * @returns 更新后的笔记对象，如果笔记不存在则返回 undefined
 */
export async function updateNote(
  db: BetterSQLite3Database<typeof schema>,
  noteId: string,
  data: Partial<Pick<NewLocalNote, 'title' | 'content' | 'starred'>>
): Promise<LocalNote | undefined> {
  await db
    .update(localNotes)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(localNotes.id, noteId))
    .run()

  return await getNote(db, noteId)
}

/**
 * 删除笔记
 *
 * @param db - 数据库实例
 * @param noteId - 笔记 ID
 */
export async function deleteNote(
  db: BetterSQLite3Database<typeof schema>,
  noteId: string
): Promise<void> {
  await db.delete(localNotes).where(eq(localNotes.id, noteId)).run()
}
