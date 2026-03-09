import { openai } from "@ai-sdk/openai"
import { embedMany } from "ai"
import { db } from "../../../db/db.js"
import { embeddings } from "../../../db/schema.js"
import { sql } from "drizzle-orm"

/**
 * 文本分块配置
 */
const CHUNK_CONFIG = {
  size: 800, // 每块字符数
  overlap: 100, // 重叠字符数 (12.5%)
} as const

/**
 * 将长文本分割成较小的块,带有重叠以保持上下文连续性
 *
 * @param text - 要分割的原始文本
 * @returns 文本块数组
 *
 * @example
 * const chunks = generateChunks("很长的文本内容...", 500, 50)
 * // 返回: ["第一块...", "第二块...", ...]
 */
export function generateChunks(
  text: string,
  chunkSize: number = CHUNK_CONFIG.size,
  overlap: number = CHUNK_CONFIG.overlap
): string[] {
  const chunks: string[] = []

  // 清理文本: 规范化空白字符
  const cleanedText = text
    .replace(/\r\n/g, "\n") // 统一换行符
    .replace(/\n{3,}/g, "\n\n") // 压缩多余空行
    .trim()

  if (cleanedText.length === 0) {
    return []
  }

  // 如果文本短于块大小,直接返回
  if (cleanedText.length <= chunkSize) {
    return [cleanedText]
  }

  let startIndex = 0

  while (startIndex < cleanedText.length) {
    const endIndex = startIndex + chunkSize

    // 提取当前块
    let chunk = cleanedText.slice(startIndex, endIndex)

    // 如果不是最后一块,尝试在句子边界处切分
    if (endIndex < cleanedText.length) {
      // 寻找最后的句子分隔符 (. ! ? \n)
      const sentenceEnd = chunk.match(/[.!?\n][^.!?\n]*$/)
      if (sentenceEnd && sentenceEnd.index) {
        chunk = chunk.slice(0, sentenceEnd.index + 1)
      }
    }

    chunks.push(chunk.trim())

    // 移动到下一块的起始位置 (考虑重叠)
    startIndex += chunk.length - overlap

    // 防止死循环: 如果块太小导致无法前进
    if (chunk.length <= overlap) {
      startIndex = endIndex
    }
  }

  return chunks.filter((chunk) => chunk.length > 0)
}

/**
 * Embedding 配置常量
 * 使用 OpenAI text-embedding-3-small 模型，显式指定 1536 维度
 *
 * 注意：虽然 text-embedding-3-small 默认是 1536 维，但我们显式指定维度以确保：
 * 1. 与数据库 schema.ts 中的 vector(1536) 类型严格匹配
 * 2. 防止未来 OpenAI API 默认值变更导致的维度不匹配
 * 3. 代码意图明确，便于维护
 */
const EMBEDDING_CONFIG = {
  model: openai.embedding("text-embedding-3-small"),
  dimensions: 1536,
  providerOptions: {
    openai: {
      dimensions: 1536, // 显式指定维度，与数据库 vector 类型严格匹配
    },
  },
} as const

/**
 * 使用 OpenAI 为文本块批量生成向量 embeddings
 *
 * @param chunks - 文本块数组
 * @returns 向量数组 (每个向量是 1536 维的数字数组)
 *
 * @throws 如果 API 调用失败
 *
 * @example
 * const embeddings = await generateEmbeddings(["文本1", "文本2"])
 * // 返回: [[0.1, 0.2, ...], [0.3, 0.4, ...]]
 */
export async function generateEmbeddings(
  chunks: string[]
): Promise<number[][]> {
  if (chunks.length === 0) {
    return []
  }

  try {
    const { embeddings: embeddingVectors } = await embedMany({
      model: EMBEDDING_CONFIG.model,
      values: chunks,
      providerOptions: EMBEDDING_CONFIG.providerOptions,
    })

    return embeddingVectors
  } catch (error) {
    console.error("Failed to generate embeddings:", error)
    throw new Error(
      `Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * 使用向量相似度搜索查找知识库中最相关的内容
 *
 * @param params - 搜索参数对象
 * @param params.query - 用户查询文本
 * @param params.knowledgeBaseIds - 要搜索的知识库 ID 数组
 * @param params.limit - 返回结果数量 (默认 5)
 * @returns 相关内容数组,包含文本、相似度分数和来源文件信息
 *
 * @example
 * const results = await findRelevantContent({
 *   query: "什么是 RAG?",
 *   knowledgeBaseIds: ["kb-123", "kb-456"],
 *   limit: 3
 * })
 * // 返回: [{ content: "...", similarity: 0.92, fileId: "...", fileName: "..." }]
 */
export async function findRelevantContent({
  query,
  knowledgeBaseIds,
  limit = 5,
}: {
  query: string
  knowledgeBaseIds: string[]
  limit?: number
}): Promise<
  Array<{
    content: string
    similarity: number
    fileId: string
    fileName: string
  }>
> {
  try {
    // 如果没有指定知识库，返回空结果
    if (!knowledgeBaseIds || knowledgeBaseIds.length === 0) {
      return []
    }

    // 1. 为查询生成 embedding
    const [queryEmbedding] = await generateEmbeddings([query])

    if (!queryEmbedding) {
      throw new Error("Failed to generate query embedding")
    }

    // 2. 使用 pgvector 的余弦相似度搜索，支持多个知识库
    // SQL: 1 - (embedding <=> query) AS similarity
    // 使用 ANY() 支持多个知识库 ID
    const results = await db.execute(sql`
      SELECT
        e.content,
        e.file_id as "fileId",
        f.file_name as "fileName",
        e.knowledge_base_id as "knowledgeBaseId",
        1 - (e.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM ${embeddings} e
      JOIN knowledge_base_files f ON e.file_id = f.id
      WHERE e.knowledge_base_id = ANY(${sql.raw(`ARRAY[${knowledgeBaseIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
      ORDER BY e.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `)

    const rows = Array.isArray(results) ? results : results.rows
    return rows.map((row: any) => ({
      content: row.content as string,
      similarity: parseFloat(row.similarity as string),
      fileId: row.fileId as string,
      fileName: row.fileName as string,
    }))
  } catch (error) {
    console.error("Failed to find relevant content:", error)
    throw new Error(
      `Similarity search failed: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}
