import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  getUserChatConfigs,
  getChatConfigById,
  getChatConfigByShareSlug,
  getChatConfigKnowledgeBases,
  createChatConfig,
  updateChatConfig,
  deleteChatConfig,
  setChatConfigKnowledgeBases,
  shareChatConfig,
  installAgent,
  checkAgentInstalled,
  validateKnowledgeBaseAccess,
} from "../../db/queries/index.js"
import {
  insertChatConfigSchema,
  updateChatConfigSchema,
  setChatConfigKnowledgeBasesSchema,
  shareChatConfigSchema,
  installAgentSchema,
} from "../../db/schema.js"
import { generateUniqueShareSlug } from "../lib/slug-generator.js"

// 创建 ChatConfig 的请求 schema（扩展基础 schema 添加 knowledgeBaseIds）
const createChatConfigRequestSchema = z.object({
  name: z.string().min(1, "Name is required").max(80, "Name too long"),
  avatar: z.string().max(500, "Avatar too long").optional().nullable(),
  defaultModel: z
    .string()
    .min(1, "Model is required")
    .max(64, "Model name too long"),
  systemPrompt: z
    .string()
    .max(5000, "System prompt too long")
    .optional()
    .nullable(),
  webSearchEnabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  shareSlug: z.string().max(64, "Share slug too long").optional().nullable(),
  sourceShareSlug: z
    .string()
    .max(64, "Source share slug too long")
    .optional()
    .nullable(),
  knowledgeBaseIds: z.array(z.string().uuid()).optional(),
})

/**
 * 聊天配置路由
 * 支持聊天配置的 CRUD、知识库关联、分享等功能
 */
const chatConfig = new Hono()
  .use("*", requireAuth()) // 所有路由都需要身份验证
  /**
   * GET /api/chat-configs
   * 获取当前用户的所有聊天配置列表
   */
  .get("/", async (c) => {
    try {
      const configs = await getUserChatConfigs(c.var.user.id)
      return c.json({ configs })
    } catch (error) {
      console.error("Error fetching chat configs:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  /**
   * POST /api/chat-configs
   * 创建新的聊天配置（可选关联知识库）
   */
  .post("/", zValidator("json", createChatConfigRequestSchema), async (c) => {
    try {
      const data = c.req.valid("json")

      console.log(
        "[DEBUG] Creating chat config with data:",
        JSON.stringify(data, null, 2)
      )

      // 如果要公开分享且没有提供 shareSlug，自动生成一个
      let shareSlug = data.shareSlug ?? null
      if (data.isPublic && !shareSlug) {
        shareSlug = await generateUniqueShareSlug()
        console.log("[DEBUG] Auto-generated shareSlug for public agent:", shareSlug)
      }

      // 创建配置
      const config = await createChatConfig({
        userId: c.var.user.id,
        name: data.name,
        avatar: data.avatar ?? null,
        defaultModel: data.defaultModel,
        systemPrompt: data.systemPrompt ?? null,
        webSearchEnabled: data.webSearchEnabled ?? false,
        isPublic: data.isPublic ?? false,
        shareSlug: shareSlug,
        sourceShareSlug: data.sourceShareSlug ?? null,
      })


      // 如果有知识库ID，验证后关联知识库
      if (data.knowledgeBaseIds && data.knowledgeBaseIds.length > 0) {
        // 验证知识库是否存在且可访问(用户自己的或公开的)
        const validKbIds = await validateKnowledgeBaseAccess(
          c.var.user.id,
          data.knowledgeBaseIds
        )

        if (validKbIds.length > 0) {
          await setChatConfigKnowledgeBases(config.id, validKbIds)
        }

        // 如果有无效的知识库ID，记录警告
        if (validKbIds.length < data.knowledgeBaseIds.length) {
          const invalidIds = data.knowledgeBaseIds.filter(id => !validKbIds.includes(id))
          console.warn('[WARN] Skipped invalid knowledge base IDs:', invalidIds)
        }
      }

      return c.json({ config }, 201)
    } catch (error) {
      console.error("[ERROR] Error creating chat config:", error)
      if (error instanceof Error) {
        console.error("[ERROR] Error message:", error.message)
        console.error("[ERROR] Error stack:", error.stack)
      }
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  /**
   * GET /api/chat-configs/shared/:shareSlug
   * 通过分享 slug 获取公开的聊天配置（无需身份验证）
   * 注意：此路由必须在 /:id 路由之前定义，避免 "shared" 被当作 UUID
   */
  .get(
    "/shared/:shareSlug",
    zValidator("param", z.object({ shareSlug: z.string() })),
    async (c) => {
      try {
        const { shareSlug } = c.req.valid("param")

        const config = await getChatConfigByShareSlug(shareSlug)

        if (!config) {
          return c.json({ error: "Shared config not found" }, 404)
        }

        // 获取关联的知识库
        const knowledgeBases = await getChatConfigKnowledgeBases(config.id)

        return c.json({
          config,
          knowledgeBases,
        })
      } catch (error) {
        console.error("Error fetching shared chat config:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * GET /api/chat-configs/:id
   * 获取单个聊天配置详情（含关联的知识库）
   */
  .get(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      try {
        const { id: configId } = c.req.valid("param")

        const config = await getChatConfigById(configId, c.var.user.id)

        if (!config) {
          return c.json({ error: "Chat config not found" }, 404)
        }

        // 获取关联的知识库
        const knowledgeBases = await getChatConfigKnowledgeBases(configId)

        return c.json({
          config,
          knowledgeBases,
        })
      } catch (error) {
        console.error("Error fetching chat config:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * PUT /api/chat-configs/:id
   * 更新聊天配置
   */
  .put(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("json", updateChatConfigSchema),
    async (c) => {
      try {
        const { id: configId } = c.req.valid("param")

        // 检查配置是否存在
        const existingConfig = await getChatConfigById(configId, c.var.user.id)
        if (!existingConfig) {
          return c.json({ error: "Chat config not found" }, 404)
        }

        const config = await updateChatConfig(
          configId,
          c.var.user.id,
          c.req.valid("json")
        )

        if (!config) {
          return c.json({ error: "Failed to update chat config" }, 500)
        }

        return c.json({ config })
      } catch (error) {
        console.error("Error updating chat config:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * DELETE /api/chat-configs/:id
   * T067: 删除聊天配置（会级联删除知识库关联）
   * FR-043 至 FR-047: 删除前先取消分享，已安装副本不受影响
   */
  .delete(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      try {
        const { id: configId } = c.req.valid("param")

        // T067: 删除配置（内部已处理取消分享和级联删除）
        const deleted = await deleteChatConfig(configId, c.var.user.id)

        if (!deleted) {
          return c.json({ error: "Agent not found" }, 404)
        }

        return c.json({ success: true })
      } catch (error) {
        console.error("Error deleting chat config:", error)
        const message =
          error instanceof Error ? error.message : "Internal Server Error"

        // T067: 增强错误处理
        // 403 Forbidden: 非所有者尝试删除
        if (message.includes("access denied")) {
          return c.json(
            {
              error: "Forbidden",
              message: "You can only delete your own agents",
            },
            403
          )
        }

        // 404 Not Found: Agent 不存在
        if (message.includes("not found")) {
          return c.json(
            {
              error: "NotFound",
              message: "Agent not found",
            },
            404
          )
        }

        // 500 Internal Error: 其他错误
        return c.json(
          {
            error: "InternalError",
            message: "Failed to delete agent. Please try again",
          },
          500
        )
      }
    }
  )
  /**
   * PUT /api/chat-configs/:id/knowledge-bases
   * 批量设置配置关联的知识库
   */
  .put(
    "/:id/knowledge-bases",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("json", setChatConfigKnowledgeBasesSchema),
    async (c) => {
      try {
        const { id: configId } = c.req.valid("param")
        const { knowledgeBaseIds } = c.req.valid("json")

        // 检查配置是否存在
        const existingConfig = await getChatConfigById(configId, c.var.user.id)
        if (!existingConfig) {
          return c.json({ error: "Chat config not found" }, 404)
        }

        // 批量设置知识库关联
        await setChatConfigKnowledgeBases(configId, knowledgeBaseIds)

        // 返回更新后的知识库列表
        const knowledgeBases = await getChatConfigKnowledgeBases(configId)

        return c.json({ knowledgeBases })
      } catch (error) {
        console.error("Error updating chat config knowledge bases:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * PUT /api/chat-configs/:id/share
   * 分享或取消分享 Agent 到市场
   */
  .put(
    "/:id/share",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("json", shareChatConfigSchema),
    async (c) => {
      try {
        const { id: configId } = c.req.valid("param")
        const { isPublic } = c.req.valid("json")

        // T020: 分享配置（使用 generateUniqueShareSlug）
        const config = await shareChatConfig(
          configId,
          c.var.user.id,
          isPublic
        )

        if (!config) {
          return c.json({ error: "Failed to update sharing status" }, 500)
        }

        return c.json({ config })
      } catch (error: any) {
        console.error("Error sharing chat config:", error)

        // 处理特定错误
        if (error.message === "Chat config not found") {
          return c.json({ error: "Chat config not found" }, 404)
        }
        if (error.message?.includes("must have")) {
          return c.json({ error: error.message }, 400)
        }

        // T020: 处理 409 Conflict 错误（shareSlug 冲突）
        if (error.message?.includes("Failed to generate unique share slug")) {
          return c.json(
            {
              error: "ConflictError",
              message: "Failed to generate unique share slug. Please try again",
            },
            409
          )
        }

        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * T038: POST /api/chat-configs/install
   * 从市场安装一个 Agent（复制公开的 ChatConfig）
   */
  .post("/install", zValidator("json", installAgentSchema), async (c) => {
    try {
      const { shareSlug } = c.req.valid("json")

      const installedAgent = await installAgent(shareSlug, c.var.user.id)

      return c.json({ agent: installedAgent }, 201)
    } catch (error) {
      console.error("Error installing agent:", error)

      // T036: 处理安装错误
      if (error instanceof Error) {
        if (error.message === "Agent not found or not publicly shared") {
          return c.json({ error: error.message }, 404)
        }
        if (error.message === "Agent already installed") {
          return c.json({ error: error.message }, 409) // Conflict
        }
        if (error.message === "Cannot install your own agent") {
          return c.json({ error: error.message }, 403) // Forbidden
        }
      }

      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  /**
   * T039: GET /api/chat-configs/check-installed/:shareSlug
   * 检查用户是否已安装某个 Agent
   */
  .get(
    "/check-installed/:shareSlug",
    zValidator("param", z.object({ shareSlug: z.string() })),
    async (c) => {
      try {
        const { shareSlug } = c.req.valid("param")

        const result = await checkAgentInstalled(c.var.user.id, shareSlug)

        return c.json(result)
      } catch (error) {
        console.error("Error checking installation status:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )

export default chatConfig
