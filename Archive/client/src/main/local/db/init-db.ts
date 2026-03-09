/**
 * Database Initialization Script
 *
 * 负责在应用首次启动或数据库文件不存在时创建所有表和索引
 *
 * 设计说明：
 * 1. 表名和字段名与云端 PostgreSQL schema 完全一致
 * 2. 确保幂等性 - 多次执行不会导致错误
 * 3. 使用事务确保原子性
 */

import { sql } from "drizzle-orm"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

/**
 * 初始化数据库 - 创建所有表和索引
 *
 * @param db - Drizzle 数据库实例
 */
export async function initializeDatabase(
  db: BetterSQLite3Database<typeof schema>
): Promise<void> {
  console.log("[InitDB] Starting database initialization...")

  try {
    // 使用事务确保原子性 (注意: better-sqlite3 的事务函数不能是 async)
    db.transaction(() => {
      // ==================== 创建 chat_sessions 表 ====================
      db.run(sql`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          model TEXT NOT NULL,
          system_prompt TEXT,
          available_knowledge_base_ids TEXT NOT NULL DEFAULT '[]',
          available_note_ids TEXT NOT NULL DEFAULT '[]',
          starred INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )
      `)

      // 创建 chat_sessions 表索引
      db.run(sql`
        CREATE INDEX IF NOT EXISTS chat_sessions_created_at_idx
        ON chat_sessions(created_at DESC)
      `)

      // ==================== 创建 chat_messages 表 ====================
      db.run(sql`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          role TEXT NOT NULL,
          parts TEXT NOT NULL,
          attachments TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          FOREIGN KEY (chat_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        )
      `)

      // 创建 chat_messages 表索引
      db.run(sql`
        CREATE INDEX IF NOT EXISTS chat_messages_chat_id_created_at_idx
        ON chat_messages(chat_id, created_at)
      `)

      // ==================== 创建 knowledge_bases 表 ====================
      db.run(sql`
        CREATE TABLE IF NOT EXISTS knowledge_bases (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          starred INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)

      // 创建 knowledge_bases 表索引
      db.run(sql`
        CREATE INDEX IF NOT EXISTS knowledge_bases_starred_created_at_idx
        ON knowledge_bases(starred DESC, created_at DESC)
      `)

      // ==================== 创建 knowledge_base_files 表 ====================
      db.run(sql`
        CREATE TABLE IF NOT EXISTS knowledge_base_files (
          id TEXT PRIMARY KEY,
          knowledge_base_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          file_type TEXT,
          storage_path TEXT NOT NULL,
          content_text TEXT,
          status TEXT NOT NULL DEFAULT 'processing',
          created_at INTEGER NOT NULL,
          FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        )
      `)

      // 创建 knowledge_base_files 表索引
      db.run(sql`
        CREATE INDEX IF NOT EXISTS kb_files_kb_id_idx
        ON knowledge_base_files(knowledge_base_id)
      `)

      // ==================== 创建 models 表 ====================
      db.run(sql`
        CREATE TABLE IF NOT EXISTS models (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          size INTEGER NOT NULL,
          family TEXT NOT NULL,
          parameter_size TEXT NOT NULL,
          quantization TEXT NOT NULL,
          downloaded_at INTEGER NOT NULL,
          last_used_at INTEGER
        )
      `)

      // 创建 models 表索引
      db.run(sql`
        CREATE INDEX IF NOT EXISTS models_last_used_at_idx
        ON models(last_used_at DESC)
      `)

      // ==================== 创建 notes 表 ====================
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

      // 创建 notes 表索引
      db.run(sql`
        CREATE INDEX IF NOT EXISTS notes_starred_updated_at_idx
        ON notes(starred DESC, updated_at DESC)
      `)

      console.log("[InitDB] All tables and indexes created successfully")
    })

    // 验证表是否创建成功
    await verifyTables(db)

    console.log("[InitDB] Database initialization completed")
  } catch (error) {
    console.error("[InitDB] Failed to initialize database:", error)
    throw error
  }
}

/**
 * 验证所有表是否存在
 */
async function verifyTables(
  db: BetterSQLite3Database<typeof schema>
): Promise<void> {
  const expectedTables = [
    "chat_sessions",
    "chat_messages",
    "knowledge_bases",
    "knowledge_base_files",
    "models",
    "notes",
  ]

  const result = await db.all<{ name: string }>(sql`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)

  const existingTables = result.map((row) => row.name)

  console.log("[InitDB] Existing tables:", existingTables)

  for (const table of expectedTables) {
    if (!existingTables.includes(table)) {
      throw new Error(`Table '${table}' was not created`)
    }
  }

  console.log("[InitDB] All required tables verified")
}

/**
 * 检查数据库是否已初始化
 */
export async function isDatabaseInitialized(
  db: BetterSQLite3Database<typeof schema>
): Promise<boolean> {
  try {
    const result = await db.get<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM sqlite_master
      WHERE type='table' AND name='chat_sessions'
    `)

    return result ? result.count > 0 : false
  } catch (error) {
    console.error("[InitDB] Error checking database initialization:", error)
    return false
  }
}

/**
 * 重置数据库 - 删除所有表（仅用于开发/测试）
 *
 * 警告：这将删除所有数据！
 */
export async function resetDatabase(
  db: BetterSQLite3Database<typeof schema>
): Promise<void> {
  console.warn("[InitDB] WARNING: Resetting database - all data will be lost!")

  try {
    db.transaction(() => {
      // 删除表（按依赖顺序反向删除）
      db.run(sql`DROP TABLE IF EXISTS chat_messages`)
      db.run(sql`DROP TABLE IF EXISTS chat_sessions`)
      db.run(sql`DROP TABLE IF EXISTS knowledge_base_files`)
      db.run(sql`DROP TABLE IF EXISTS knowledge_bases`)
      db.run(sql`DROP TABLE IF EXISTS models`)
      db.run(sql`DROP TABLE IF EXISTS notes`)

      console.log("[InitDB] All tables dropped")
    })

    // 重新创建表
    await initializeDatabase(db)

    console.log("[InitDB] Database reset completed")
  } catch (error) {
    console.error("[InitDB] Failed to reset database:", error)
    throw error
  }
}

/**
 * 获取数据库版本（用于未来的 migration）
 *
 * 存储在 SQLite 的 user_version pragma 中
 */
export async function getDatabaseVersion(
  db: BetterSQLite3Database<typeof schema>
): Promise<number> {
  const result = await db.get<{ user_version: number }>(sql`PRAGMA user_version`)
  return result?.user_version ?? 0
}

/**
 * 设置数据库版本
 */
export async function setDatabaseVersion(
  db: BetterSQLite3Database<typeof schema>,
  version: number
): Promise<void> {
  await db.run(sql`PRAGMA user_version = ${version}`)
  console.log(`[InitDB] Database version set to ${version}`)
}

/**
 * 执行数据库迁移（未来扩展）
 *
 * @param db - 数据库实例
 * @param targetVersion - 目标版本号
 */
export async function migrateDatabase(
  db: BetterSQLite3Database<typeof schema>,
  targetVersion: number
): Promise<void> {
  const currentVersion = await getDatabaseVersion(db)

  if (currentVersion >= targetVersion) {
    console.log(
      `[InitDB] Database is already at version ${currentVersion}, no migration needed`
    )
    return
  }

  console.log(
    `[InitDB] Migrating database from version ${currentVersion} to ${targetVersion}`
  )

  // 未来在这里添加 migration 逻辑
  // 例如：
  // if (currentVersion < 1) {
  //   await migrateToV1(db)
  // }
  // if (currentVersion < 2) {
  //   await migrateToV2(db)
  // }

  await setDatabaseVersion(db, targetVersion)
  console.log(`[InitDB] Migration completed`)
}

/**
 * 插入默认数据（可选）
 */
export async function seedDefaultData(
  db: BetterSQLite3Database<typeof schema>
): Promise<void> {
  console.log("[InitDB] Seeding default data...")

  // 示例：插入默认模型（如果需要）
  // 在实际应用中，模型数据应该从 Ollama API 动态获取

  console.log("[InitDB] Default data seeding completed")
}
