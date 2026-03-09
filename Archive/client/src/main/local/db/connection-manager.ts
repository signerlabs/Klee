/**
 * Database Connection Manager
 *
 * 管理 Cloud 和 Private 模式的数据库连接
 * - Cloud Mode: 远程 PostgreSQL（由 server 管理，此处不涉及）
 * - Private Mode: 本地 SQLite（userData/klee-private.db）
 *
 * 设计原则：
 * 1. 单例模式 - 全局唯一实例
 * 2. 懒加载 - 仅在需要时初始化连接
 * 3. 性能优化 - 启用 WAL 模式和性能 pragma
 * 4. 优雅关闭 - 确保数据一致性
 */

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { app } from "electron"
import path from "node:path"
import fs from "node:fs"
import * as schema from "./schema"
import { initializeDatabase, isDatabaseInitialized } from "./init-db"
import { addNotesTable } from "./migrations/add-notes-table"

type Mode = "cloud" | "private"

class DatabaseConnectionManager {
  private static instance: DatabaseConnectionManager | null = null
  private privateConnection: BetterSQLite3Database<typeof schema> | null = null
  private privateSqlite: Database.Database | null = null
  private currentMode: Mode = "cloud"

  private constructor() {
    // 私有构造函数，防止直接实例化
  }

  /**
   * 获取单例实例
   */
  static getInstance(): DatabaseConnectionManager {
    if (!DatabaseConnectionManager.instance) {
      DatabaseConnectionManager.instance = new DatabaseConnectionManager()
    }
    return DatabaseConnectionManager.instance
  }

  /**
   * 获取 Private Mode 的数据库路径
   */
  private getPrivateDbPath(): string {
    const userDataPath = app.getPath("userData")
    return path.join(userDataPath, "klee-private.db")
  }

  /**
   * 初始化 Private Mode 数据库连接
   */
  private async initializePrivateConnection(): Promise<BetterSQLite3Database<typeof schema>> {
    if (this.privateConnection) {
      return this.privateConnection
    }

    const dbPath = this.getPrivateDbPath()
    const dbDir = path.dirname(dbPath)

    // 确保数据目录存在
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    console.log(`[DatabaseConnectionManager] Initializing Private Mode database at: ${dbPath}`)

    // 创建 SQLite 连接
    this.privateSqlite = new Database(dbPath, {
      verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
    })

    // 启用 WAL 模式（Write-Ahead Logging）- 提升并发性能
    // WAL 模式允许读操作和写操作并发执行
    this.privateSqlite.pragma("journal_mode = WAL")

    // 性能优化 pragma 设置
    this.privateSqlite.pragma("synchronous = NORMAL") // 平衡性能和数据安全
    this.privateSqlite.pragma("cache_size = -64000") // 64MB 缓存
    this.privateSqlite.pragma("temp_store = MEMORY") // 临时表存储在内存
    this.privateSqlite.pragma("mmap_size = 30000000000") // 启用内存映射 I/O (30GB)
    this.privateSqlite.pragma("page_size = 4096") // 4KB 页大小
    this.privateSqlite.pragma("foreign_keys = ON") // 启用外键约束

    // 创建 Drizzle ORM 实例
    this.privateConnection = drizzle(this.privateSqlite, { schema })

    // 检查数据库是否已初始化，如果没有则创建表
    const isInitialized = await isDatabaseInitialized(this.privateConnection)

    if (!isInitialized) {
      console.log("[DatabaseConnectionManager] Database not initialized, creating tables...")
      await initializeDatabase(this.privateConnection)
    } else {
      console.log("[DatabaseConnectionManager] Database already initialized")
      // 运行迁移以确保 notes 表存在（为已存在的数据库添加新表）
      console.log("[DatabaseConnectionManager] Running migrations...")
      await addNotesTable(this.privateConnection)
    }

    console.log("[DatabaseConnectionManager] Private Mode database initialized successfully")

    return this.privateConnection
  }

  /**
   * 获取指定模式的数据库连接
   *
   * @param mode - 'cloud' | 'private'
   * @returns Drizzle 数据库实例（仅 Private Mode 返回，Cloud Mode 返回 null）
   */
  async getConnection(mode: Mode): Promise<BetterSQLite3Database<typeof schema> | null> {
    this.currentMode = mode

    if (mode === "private") {
      return await this.initializePrivateConnection()
    }

    // Cloud Mode 使用远程 API，不需要本地数据库连接
    return null
  }

  /**
   * 获取当前模式
   */
  getCurrentMode(): Mode {
    return this.currentMode
  }

  /**
   * 切换模式
   *
   * @param mode - 目标模式
   */
  async switchMode(mode: Mode): Promise<void> {
    if (this.currentMode === mode) {
      console.log(`[DatabaseConnectionManager] Already in ${mode} mode, skipping switch`)
      return
    }

    console.log(`[DatabaseConnectionManager] Switching from ${this.currentMode} to ${mode} mode`)
    this.currentMode = mode

    // 如果切换到 Private Mode，初始化连接
    if (mode === "private") {
      await this.initializePrivateConnection()
    }
  }

  /**
   * 执行数据库维护任务
   *
   * 推荐在应用空闲时或定期执行
   */
  async maintenance(): Promise<void> {
    if (!this.privateSqlite) {
      return
    }

    console.log("[DatabaseConnectionManager] Running database maintenance...")

    try {
      // 优化数据库 - 重建索引和回收空间
      this.privateSqlite.pragma("optimize")

      // 分析表统计信息 - 改善查询计划
      this.privateSqlite.pragma("analysis_limit = 1000")
      this.privateSqlite.pragma("analyze")

      console.log("[DatabaseConnectionManager] Database maintenance completed")
    } catch (error) {
      console.error("[DatabaseConnectionManager] Maintenance failed:", error)
    }
  }

  /**
   * VACUUM 数据库 - 压缩数据库文件
   *
   * 警告：这是一个耗时操作，应在应用空闲时执行
   */
  async vacuum(): Promise<void> {
    if (!this.privateSqlite) {
      return
    }

    console.log("[DatabaseConnectionManager] Running VACUUM...")

    try {
      const beforeSize = this.getDatabaseSize()
      this.privateSqlite.exec("VACUUM")
      const afterSize = this.getDatabaseSize()

      console.log(
        `[DatabaseConnectionManager] VACUUM completed. Size reduced from ${beforeSize}MB to ${afterSize}MB`
      )
    } catch (error) {
      console.error("[DatabaseConnectionManager] VACUUM failed:", error)
    }
  }

  /**
   * 获取数据库文件大小（MB）
   */
  getDatabaseSize(): number {
    const dbPath = this.getPrivateDbPath()
    if (!fs.existsSync(dbPath)) {
      return 0
    }

    const stats = fs.statSync(dbPath)
    return Math.round((stats.size / 1024 / 1024) * 100) / 100 // 保留 2 位小数
  }

  /**
   * 获取数据库统计信息
   */
  getDatabaseStats() {
    if (!this.privateSqlite) {
      return null
    }

    try {
      const pageCount = this.privateSqlite.pragma("page_count", { simple: true }) as number
      const pageSize = this.privateSqlite.pragma("page_size", { simple: true }) as number
      const freelistCount = this.privateSqlite.pragma("freelist_count", { simple: true }) as number
      const journalMode = this.privateSqlite.pragma("journal_mode", { simple: true }) as string

      return {
        pageCount,
        pageSize,
        freelistCount,
        journalMode,
        totalSize: pageCount * pageSize,
        usedSize: (pageCount - freelistCount) * pageSize,
        fileSizeMB: this.getDatabaseSize(),
      }
    } catch (error) {
      console.error("[DatabaseConnectionManager] Failed to get stats:", error)
      return null
    }
  }

  /**
   * 优雅关闭所有数据库连接
   *
   * 应在应用退出前调用
   */
  closeAll(): void {
    console.log("[DatabaseConnectionManager] Closing all database connections...")

    if (this.privateSqlite) {
      try {
        // 确保所有待处理的事务完成
        if (this.privateSqlite.inTransaction) {
          console.warn("[DatabaseConnectionManager] Warning: Database has pending transaction")
        }

        // 执行 WAL checkpoint - 将 WAL 文件的内容合并到主数据库
        this.privateSqlite.pragma("wal_checkpoint(TRUNCATE)")

        // 关闭连接
        this.privateSqlite.close()
        this.privateSqlite = null
        this.privateConnection = null

        console.log("[DatabaseConnectionManager] Private Mode database closed successfully")
      } catch (error) {
        console.error("[DatabaseConnectionManager] Error closing database:", error)
      }
    }
  }

  /**
   * 检查数据库完整性
   */
  async checkIntegrity(): Promise<boolean> {
    if (!this.privateSqlite) {
      return true
    }

    try {
      const result = this.privateSqlite.pragma("integrity_check", { simple: true })
      const isOk = result === "ok"

      if (isOk) {
        console.log("[DatabaseConnectionManager] Database integrity check passed")
      } else {
        console.error("[DatabaseConnectionManager] Database integrity check failed:", result)
      }

      return isOk
    } catch (error) {
      console.error("[DatabaseConnectionManager] Integrity check error:", error)
      return false
    }
  }

  /**
   * 备份数据库
   *
   * @param backupPath - 备份文件路径（可选，默认为 userData/backups/）
   */
  async backup(backupPath?: string): Promise<string> {
    const dbPath = this.getPrivateDbPath()

    if (!fs.existsSync(dbPath)) {
      throw new Error("Database file does not exist")
    }

    // 生成备份路径
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const defaultBackupDir = path.join(app.getPath("userData"), "backups")
    const finalBackupPath =
      backupPath || path.join(defaultBackupDir, `klee-private-${timestamp}.db`)

    // 确保备份目录存在
    const backupDir = path.dirname(finalBackupPath)
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    // 执行 WAL checkpoint 确保数据一致性
    if (this.privateSqlite) {
      this.privateSqlite.pragma("wal_checkpoint(TRUNCATE)")
    }

    // 复制数据库文件
    fs.copyFileSync(dbPath, finalBackupPath)

    console.log(`[DatabaseConnectionManager] Database backed up to: ${finalBackupPath}`)

    return finalBackupPath
  }
}

// 导出单例实例
export const dbManager = DatabaseConnectionManager.getInstance()
