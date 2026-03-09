/**
 * Migration: Add notes table
 *
 * 为已存在的数据库添加 notes 表（如果不存在）
 * 这个迁移脚本可以安全地多次执行（幂等性）
 */

import { sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../schema'

export async function addNotesTable(
  db: BetterSQLite3Database<typeof schema>
): Promise<void> {
  console.log('[Migration] Adding notes table if not exists...')

  try {
    db.transaction(() => {
      // 创建 notes 表（如果不存在）
      db.run(sql`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          starred INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)

      // 创建索引（如果不存在）
      db.run(sql`
        CREATE INDEX IF NOT EXISTS notes_starred_updated_at_idx
        ON notes(starred DESC, updated_at DESC)
      `)

      console.log('[Migration] Notes table and indexes created successfully')
    })

    // 验证表是否创建成功
    const result = await db.get<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM sqlite_master
      WHERE type='table' AND name='notes'
    `)

    if (result && result.count > 0) {
      console.log('[Migration] Notes table verified successfully')
    } else {
      throw new Error('Notes table creation failed')
    }
  } catch (error) {
    console.error('[Migration] Failed to add notes table:', error)
    throw error
  }
}
