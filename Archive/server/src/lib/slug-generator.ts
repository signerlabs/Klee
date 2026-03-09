// shareSlug 生成工具
// 使用 nanoid 生成唯一的分享链接标识符

import { nanoid } from 'nanoid'
import { db } from '../../db/db.js'
import { chatConfigs, knowledgeBases } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

/**
 * 生成唯一的分享 slug
 * 使用 10 字符长度,URL 安全字符集
 * 碰撞概率: 生成 1 billion IDs 需要 ~25 years 才有 1% 碰撞概率
 */
export function generateShareSlug(): string {
  return nanoid(10)
}

/**
 * 生成唯一的分享 slug（带冲突检测）
 * 如果生成的 slug 已存在，自动重试最多 3 次
 * T075: 处理 shareSlug 冲突
 */
export async function generateUniqueShareSlug(maxRetries = 3): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const slug = generateShareSlug()

    // 检查 slug 是否已存在于 chatConfigs 或 knowledgeBases 表中
    const [existingChatConfig] = await db
      .select({ shareSlug: chatConfigs.shareSlug })
      .from(chatConfigs)
      .where(eq(chatConfigs.shareSlug, slug))
      .limit(1)

    const [existingKnowledgeBase] = await db
      .select({ shareSlug: knowledgeBases.shareSlug })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.shareSlug, slug))
      .limit(1)

    // 如果两个表中都不存在，返回这个 slug
    if (!existingChatConfig && !existingKnowledgeBase) {
      return slug
    }

    // 否则重试
    console.warn(`ShareSlug collision detected (${slug}), retrying... (attempt ${attempt + 1}/${maxRetries})`)
  }

  // 如果所有重试都失败了（极其罕见），抛出错误
  throw new Error('Failed to generate unique share slug after maximum retries')
}
