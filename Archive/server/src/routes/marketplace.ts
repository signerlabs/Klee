import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import {
  getPublicAgents,
  getPublicKnowledgeBases,
  getAgentByShareSlug,
  getKnowledgeBaseByShareSlug,
  countPublicAgents,
  countPublicKnowledgeBases,
} from "../../db/queries/index.js"

/**
 * 市场浏览路由
 * 提供公开 Agents 和知识库的浏览、搜索、详情查询
 * 所有端点均为公开访问，无需认证
 */
const marketplace = new Hono()
  /**
   * T051: GET /api/marketplace/agents
   * 获取公开 Agent 列表（支持分页和搜索）
   */
  .get(
    "/agents",
    zValidator(
      "query",
      z.object({
        page: z.string().optional().default("1"),
        search: z.string().optional(),
      })
    ),
    async (c) => {
      try {
        const { page, search } = c.req.valid("query")
        const pageNum = parseInt(page, 10) || 1
        const limit = 20

        const agents = await getPublicAgents(pageNum, limit, search)
        const total = await countPublicAgents(search)

        return c.json({
          agents,
          pagination: {
            page: pageNum,
            limit,
            total,
            hasMore: pageNum * limit < total,
          },
        })
      } catch (error) {
        console.error("Error fetching public agents:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * T052: GET /api/marketplace/knowledge-bases
   * 获取公开知识库列表（支持分页和搜索）
   */
  .get(
    "/knowledge-bases",
    zValidator(
      "query",
      z.object({
        page: z.string().optional().default("1"),
        search: z.string().optional(),
      })
    ),
    async (c) => {
      try {
        const { page, search } = c.req.valid("query")
        const pageNum = parseInt(page, 10) || 1
        const limit = 20

        const knowledgeBases = await getPublicKnowledgeBases(
          pageNum,
          limit,
          search
        )
        const total = await countPublicKnowledgeBases(search)

        return c.json({
          knowledgeBases,
          pagination: {
            page: pageNum,
            limit,
            total,
            hasMore: pageNum * limit < total,
          },
        })
      } catch (error) {
        console.error("Error fetching public knowledge bases:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * T053: GET /api/marketplace/agents/:shareSlug
   * 通过 shareSlug 获取 Agent 详情（包含关联知识库）
   */
  .get(
    "/agents/:shareSlug",
    zValidator("param", z.object({ shareSlug: z.string() })),
    async (c) => {
      try {
        const { shareSlug } = c.req.valid("param")

        const agent = await getAgentByShareSlug(shareSlug)

        if (!agent) {
          return c.json({ error: "Agent not found or not public" }, 404)
        }

        return c.json({ agent })
      } catch (error) {
        console.error("Error fetching agent details:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * T054: GET /api/marketplace/knowledge-bases/:shareSlug
   * 通过 shareSlug 获取知识库详情
   */
  .get(
    "/knowledge-bases/:shareSlug",
    zValidator("param", z.object({ shareSlug: z.string() })),
    async (c) => {
      try {
        const { shareSlug } = c.req.valid("param")

        const knowledgeBase = await getKnowledgeBaseByShareSlug(shareSlug)

        if (!knowledgeBase) {
          return c.json(
            { error: "Knowledge base not found or not public" },
            404
          )
        }

        return c.json({ knowledgeBase })
      } catch (error) {
        console.error("Error fetching knowledge base details:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )

export default marketplace
