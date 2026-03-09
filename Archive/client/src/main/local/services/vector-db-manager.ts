/**
 * LanceDB 向量数据库管理器
 *
 * 功能:
 * - 连接到本地 LanceDB 数据库
 * - 为每个知识库创建独立的向量表
 * - 执行向量相似度搜索
 * - 管理向量表生命周期 (创建/删除)
 *
 * 表命名规则: kb_{knowledgeBaseId}
 */

import { app } from 'electron'
import path from 'node:path'
import * as lancedb from '@lancedb/lancedb'
import type { Connection, Table } from '@lancedb/lancedb'

/**
 * 向量记录接口
 */
export interface VectorRecord {
  id: string // 向量记录 ID (UUID)
  fileId: string // 所属文件 ID
  content: string // 文档片段文本内容
  embedding: number[] // 768维向量 (nomic-embed-text)
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
  id: string
  fileId: string
  content: string
  _distance: number // 余弦距离 (越小越相似)
}

/**
 * LanceDB 管理器类
 */
export class VectorDbManager {
  private connection: Connection | null = null
  private dbPath: string

  constructor() {
    // 数据库路径: {userData}/vector-db
    this.dbPath = path.join(app.getPath('userData'), 'vector-db')
  }

  /**
   * 连接到 LanceDB 数据库
   */
  async connect(): Promise<void> {
    if (this.connection) {
      console.log('[VectorDB] Already connected')
      return
    }

    try {
      console.log(`[VectorDB] Connecting to database at: ${this.dbPath}`)
      this.connection = await lancedb.connect(this.dbPath)
      console.log('[VectorDB] Connected successfully')
    } catch (error) {
      console.error('[VectorDB] Failed to connect:', error)
      throw new Error(
        `Failed to connect to LanceDB: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * 获取数据库连接
   */
  private async getConnection(): Promise<Connection> {
    if (!this.connection) {
      await this.connect()
    }
    return this.connection!
  }

  /**
   * 创建知识库向量表
   *
   * @param knowledgeBaseId - 知识库 ID
   * @returns 表对象
   */
  async createTable(knowledgeBaseId: string): Promise<Table> {
    try {
      const db = await this.getConnection()
      const tableName = `kb_${knowledgeBaseId}`

      console.log(`[VectorDB] Creating table: ${tableName}`)

      // 创建空表 (稍后会添加数据)
      const table = await db.createTable(tableName, [
        {
          id: 'placeholder',
          fileId: 'placeholder',
          content: 'placeholder',
          embedding: new Array(768).fill(0),
        },
      ])

      console.log(`[VectorDB] Table created: ${tableName}`)
      return table
    } catch (error) {
      console.error(`[VectorDB] Failed to create table for KB ${knowledgeBaseId}:`, error)
      throw new Error(
        `Failed to create vector table: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * 打开知识库向量表
   *
   * @param knowledgeBaseId - 知识库 ID
   * @returns 表对象
   */
  async openTable(knowledgeBaseId: string): Promise<Table> {
    try {
      const db = await this.getConnection()
      const tableName = `kb_${knowledgeBaseId}`

      console.log(`[VectorDB] Opening table: ${tableName}`)
      const table = await db.openTable(tableName)

      return table
    } catch (error) {
      console.error(`[VectorDB] Failed to open table for KB ${knowledgeBaseId}:`, error)
      throw new Error(
        `Failed to open vector table: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * 删除知识库向量表
   *
   * @param knowledgeBaseId - 知识库 ID
   */
  async dropTable(knowledgeBaseId: string): Promise<void> {
    try {
      const db = await this.getConnection()
      const tableName = `kb_${knowledgeBaseId}`

      console.log(`[VectorDB] Dropping table: ${tableName}`)
      await db.dropTable(tableName)

      console.log(`[VectorDB] Table dropped: ${tableName}`)
    } catch (error) {
      console.error(`[VectorDB] Failed to drop table for KB ${knowledgeBaseId}:`, error)
      throw new Error(
        `Failed to drop vector table: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * 检查表是否存在
   *
   * @param knowledgeBaseId - 知识库 ID
   * @returns 是否存在
   */
  async tableExists(knowledgeBaseId: string): Promise<boolean> {
    try {
      const db = await this.getConnection()
      const tableName = `kb_${knowledgeBaseId}`

      const tables = await db.tableNames()
      return tables.includes(tableName)
    } catch (error) {
      console.error(`[VectorDB] Failed to check table existence:`, error)
      return false
    }
  }

  /**
   * 向表中添加向量记录
   *
   * @param knowledgeBaseId - 知识库 ID
   * @param records - 向量记录数组
   */
  async addRecords(knowledgeBaseId: string, records: VectorRecord[]): Promise<void> {
    try {
      const table = await this.openTable(knowledgeBaseId)

      console.log(`[VectorDB] Adding ${records.length} records to KB ${knowledgeBaseId}`)
      await table.add(records as any)

      console.log(`[VectorDB] Records added successfully`)
    } catch (error) {
      console.error(`[VectorDB] Failed to add records:`, error)
      throw new Error(
        `Failed to add records to vector table: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * 删除文件的所有向量记录
   *
   * @param knowledgeBaseId - 知识库 ID
   * @param fileId - 文件 ID
   */
  async deleteFileRecords(knowledgeBaseId: string, fileId: string): Promise<void> {
    try {
      const table = await this.openTable(knowledgeBaseId)

      console.log(`[VectorDB] Deleting records for file ${fileId} in KB ${knowledgeBaseId}`)
      // 使用双引号包裹字段名，因为 LanceDB SQL 是大小写敏感的
      await table.delete(`"fileId" = '${fileId}'`)

      console.log(`[VectorDB] File records deleted successfully`)
    } catch (error) {
      console.error(`[VectorDB] Failed to delete file records:`, error)
      throw new Error(
        `Failed to delete file records: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * 向量相似度搜索
   *
   * @param knowledgeBaseId - 知识库 ID
   * @param queryEmbedding - 查询向量 (768维)
   * @param limit - 返回结果数量
   * @returns 搜索结果数组
   */
  async search(
    knowledgeBaseId: string,
    queryEmbedding: number[],
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      const table = await this.openTable(knowledgeBaseId)

      console.log(`[VectorDB] Searching in KB ${knowledgeBaseId}, limit: ${limit}`)

      // LanceDB search 返回 RecordBatchIterator
      const resultIterator = await table
        .search(queryEmbedding)
        .limit(limit)
        .toArray()

      console.log(`[VectorDB] Found ${resultIterator.length} results`)

      return resultIterator as unknown as SearchResult[]
    } catch (error) {
      console.error(`[VectorDB] Search failed:`, error)
      throw new Error(
        `Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * 多知识库搜索
   *
   * @param knowledgeBaseIds - 知识库 ID 数组
   * @param queryEmbedding - 查询向量
   * @param limit - 总返回结果数量
   * @returns 合并并排序的搜索结果
   */
  async searchMultiple(
    knowledgeBaseIds: string[],
    queryEmbedding: number[],
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      console.log(`[VectorDB] Searching in ${knowledgeBaseIds.length} knowledge bases`)

      // 并行搜索所有知识库
      const searchPromises = knowledgeBaseIds.map((kbId) =>
        this.search(kbId, queryEmbedding, limit).catch((error) => {
          console.error(`[VectorDB] Search failed for KB ${kbId}:`, error)
          return [] // 如果某个知识库搜索失败,返回空数组
        })
      )

      const allResults = await Promise.all(searchPromises)

      // 合并结果
      const merged = allResults.flat()

      // 按相似度排序 (距离越小越相似)
      merged.sort((a, b) => a._distance - b._distance)

      // 返回 top-N
      const topResults = merged.slice(0, limit)

      console.log(`[VectorDB] Multi-search completed, returning ${topResults.length} results`)
      return topResults
    } catch (error) {
      console.error(`[VectorDB] Multi-search failed:`, error)
      throw new Error(
        `Multi-search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * 获取表中的向量数量
   *
   * @param knowledgeBaseId - 知识库 ID
   * @returns 向量数量
   */
  async getRecordCount(knowledgeBaseId: string): Promise<number> {
    try {
      const table = await this.openTable(knowledgeBaseId)
      const count = await table.countRows()
      return count
    } catch (error) {
      console.error(`[VectorDB] Failed to get record count:`, error)
      return 0
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.connection) {
      console.log('[VectorDB] Closing connection')
      // LanceDB 的连接不需要显式关闭
      this.connection = null
    }
  }
}

// 导出单例实例
export const vectorDbManager = new VectorDbManager()
