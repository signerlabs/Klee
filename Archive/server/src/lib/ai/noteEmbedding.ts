import { eq } from "drizzle-orm"
import { generateChunks, generateEmbeddings } from "./embedding.js"
import { db } from "../../../db/db.js"
import { notes, noteEmbeddings } from "../../../db/schema.js"
import { sql } from "drizzle-orm"

/**
 * 笔记向量化处理结果
 */
export interface ProcessNoteEmbeddingResult {
  success: boolean
  chunksCount?: number
  textLength?: number
  error?: string
  skipped?: boolean
  reason?: string
  processingTimeMs?: number
}

/**
 * 处理笔记向量化
 *
 * @param noteId - 笔记ID
 * @returns 处理结果，包含成功状态和相关统计信息
 *
 * @example
 * const result = await processNoteEmbedding("note-123")
 * if (result.success) {
 *   console.log(`处理了 ${result.chunksCount} 个文本块`)
 * }
 */
export async function processNoteEmbedding(
  noteId: string
): Promise<ProcessNoteEmbeddingResult> {
  try {
    const startTime = Date.now()

    // 1. 获取笔记内容
    const [note] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1)

    if (!note) {
      return {
        success: false,
        error: "Note not found",
      }
    }

    // 2. 清理已有的向量记录(如果存在)
    await db.delete(noteEmbeddings).where(eq(noteEmbeddings.noteId, noteId))

    // 3. 文本分块
    const text = note.content
    const chunks = generateChunks(text)

    if (chunks.length === 0) {
      return {
        success: false,
        error: "No chunks generated from note content",
      }
    }

    // 4. 生成向量
    const embeddingVectors = await generateEmbeddings(chunks)

    // 5. 批量插入 embeddings 到数据库
    const embeddingRecords = chunks.map((chunk, index) => ({
      noteId,
      content: chunk,
      embedding: embeddingVectors[index],
    }))

    await db.insert(noteEmbeddings).values(embeddingRecords)

    const processingTimeMs = Date.now() - startTime

    // 返回处理结果
    return {
      success: true,
      chunksCount: chunks.length,
      textLength: text.length,
      processingTimeMs,
    }
  } catch (error) {
    console.error("Error processing note embedding:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * 使用向量相似度搜索查找笔记中最相关的内容
 *
 * @param params - 搜索参数对象
 * @param params.query - 用户查询文本
 * @param params.noteIds - 要搜索的笔记 ID 数组
 * @param params.limit - 返回结果数量 (默认 5)
 * @returns 相关内容数组，包含文本、相似度分数和来源信息
 *
 * @example
 * const results = await findRelevantNoteContent({
 *   query: "什么是 RAG?",
 *   noteIds: ["note-123", "note-456"],
 *   userId: "user-123",
 *   limit: 3
 * })
 */
export async function findRelevantNoteContent({
  query,
  noteIds,
  userId,
  limit = 5,
}: {
  query: string
  noteIds: string[]
  userId: string
  limit?: number
}): Promise<
  Array<{
    content: string
    similarity: number
    sourceType: string
    sourceId: string
    sourceName: string
  }>
> {
  try {
    // 如果没有指定笔记，返回空结果
    if (!noteIds || noteIds.length === 0) {
      return []
    }

    // 1. 为查询生成 embedding
    const [queryEmbedding] = await generateEmbeddings([query])

    if (!queryEmbedding) {
      throw new Error("Failed to generate query embedding")
    }

    // 2. 构建笔记查询
    const noteQuery = sql`
      SELECT
        e.content,
        'note' as "sourceType",
        e.note_id as "sourceId",
        n.title as "sourceName",
        1 - (e.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM ${noteEmbeddings} e
      JOIN note n ON e.note_id = n.id
      WHERE e.note_id = ANY(${sql.raw(`ARRAY[${noteIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
        AND n.user_id = ${userId}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `

    const results = await db.execute(noteQuery)

    const rows = Array.isArray(results) ? results : results.rows
    return rows.map((row: any) => ({
      content: row.content as string,
      similarity: parseFloat(row.similarity as string),
      sourceType: row.sourceType as string,
      sourceId: row.sourceId as string,
      sourceName: row.sourceName as string,
    }))
  } catch (error) {
    console.error("Failed to find relevant note content:", error)
    throw new Error(
      `Note similarity search failed: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}
