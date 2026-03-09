import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  getUserKnowledgeBasesList,
  getKnowledgeBaseById,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBaseFiles,
  deleteKnowledgeBaseFile,
  shareKnowledgeBase,
} from "../../db/queries/index.js"
import {
  insertKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
  shareKnowledgeBaseSchema,
} from "../../db/schema.js"
import {
  processFile,
  KnowledgeBaseFileError,
} from "../lib/fileProcessor.js"

// Zod schema for file upload validation
const fileUploadSchema = z.object({
  file: z.instanceof(File, { message: "File is required" }),
})

const knowledgebase = new Hono()
  .use("*", requireAuth())
  .get("/", async (c) => {
    try {
      const knowledgeBases = await getUserKnowledgeBasesList(c.var.user.id)
      return c.json({ knowledgeBases })
    } catch (error) {
      console.error("Error fetching knowledge bases:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  .post("/", zValidator("json", insertKnowledgeBaseSchema), async (c) => {
    try {
      const { name, description } = c.req.valid("json")

      const knowledgeBase = await createKnowledgeBase({
        userId: c.var.user.id,
        name,
        description: description ?? undefined,
      })

      return c.json({ knowledgeBase }, 201)
    } catch (error) {
      console.error("Error creating knowledge base:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  .get(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      try {
        const { id: knowledgeBaseId } = c.req.valid("param")
        const knowledgeBase = await getKnowledgeBaseById(
          knowledgeBaseId,
          c.var.user.id
        )

        if (!knowledgeBase) {
          return c.json({ error: "Knowledge base not found" }, 404)
        }

        const files = await getKnowledgeBaseFiles(
          knowledgeBaseId,
          c.var.user.id
        )

        return c.json({
          knowledgeBase,
          files: files ?? [],
        })
      } catch (error) {
        console.error("Error fetching knowledge base:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  .put(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("json", updateKnowledgeBaseSchema),
    async (c) => {
      try {
        const { id: knowledgeBaseId } = c.req.valid("param")

        const existingKb = await getKnowledgeBaseById(
          knowledgeBaseId,
          c.var.user.id
        )
        if (!existingKb) {
          return c.json({ error: "Knowledge base not found" }, 404)
        }

        const knowledgeBase = await updateKnowledgeBase(
          knowledgeBaseId,
          c.var.user.id,
          c.req.valid("json")
        )

        if (!knowledgeBase) {
          return c.json({ error: "Failed to update knowledge base" }, 500)
        }

        return c.json({ knowledgeBase })
      } catch (error) {
        console.error("Error updating knowledge base:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  .delete(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      try {
        const { id: knowledgeBaseId } = c.req.valid("param")

        // T055: 删除知识库（使用事务保证级联删除的原子性）
        // FR-037 至 FR-042: 级联删除文件、嵌入、Agent 关联、chatSessions 引用
        const deletedKb = await deleteKnowledgeBase(
          knowledgeBaseId,
          c.var.user.id
        )

        if (!deletedKb) {
          return c.json({ error: "Knowledge base not found" }, 404)
        }

        return c.json({ success: true })
      } catch (error) {
        console.error("Error deleting knowledge base:", error)
        const message =
          error instanceof Error ? error.message : "Internal Server Error"

        // T055: 增强错误处理
        // 403 Forbidden: 非所有者尝试删除
        if (message.includes("access denied")) {
          return c.json(
            {
              error: "Forbidden",
              message: "You can only delete your own knowledge bases",
            },
            403
          )
        }

        // 404 Not Found: 知识库不存在
        if (message.includes("not found")) {
          return c.json(
            {
              error: "NotFound",
              message: "Knowledge base not found",
            },
            404
          )
        }

        // 500 Internal Error: 事务失败或其他错误
        return c.json(
          {
            error: "InternalError",
            message: "Failed to delete knowledge base. Please try again",
          },
          500
        )
      }
    }
  )
  .post(
    "/:id/files",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("form", fileUploadSchema),
    async (c) => {
      try {
        const { id: knowledgeBaseId } = c.req.valid("param")

        // 验证用户拥有该知识库
        const kb = await getKnowledgeBaseById(knowledgeBaseId, c.var.user.id)
        if (!kb) {
          return c.json({ error: "Knowledge base not found" }, 404)
        }

        // 取验证后的 form data（类型安全！）
        const { file } = c.req.valid("form")

        // 将 File 转换为 Buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // 调用文件处理核心模块（同步处理：上传→提取→分块→向量化→存储）
        const result = await processFile(
          buffer,
          file.name,
          file.size,
          c.var.user.id,
          knowledgeBaseId
        )

        // 返回处理结果
        return c.json(result, 201)
      } catch (error) {
        console.error("Error uploading file:", error)
        if (error instanceof KnowledgeBaseFileError) {
          return c.json({ error: error.message }, error.statusCode)
        }

        const message =
          error instanceof Error ? error.message : "Internal Server Error"

        return c.json({ error: message }, 500)
      }
    }
  )
  .delete(
    "/:id/files/:fileId",
    zValidator(
      "param",
      z.object({ id: z.string().uuid(), fileId: z.string().uuid() })
    ),
    async (c) => {
      try {
        const { id: knowledgeBaseId, fileId } = c.req.valid("param")

        // 删除文件（会级联删除数据库记录和清理 Storage 文件）
        const deletedFile = await deleteKnowledgeBaseFile(
          fileId,
          knowledgeBaseId,
          c.var.user.id
        )

        if (!deletedFile) {
          return c.json({ error: "File not found or access denied" }, 404)
        }

        return c.json({ success: true })
      } catch (error) {
        console.error("Error deleting file:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  // T031: 创建分享/取消分享知识库的端点
  .put(
    "/:id/share",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("json", shareKnowledgeBaseSchema),
    async (c) => {
      try {
        const { id: knowledgeBaseId } = c.req.valid("param")
        const { isPublic } = c.req.valid("json")

        const knowledgeBase = await shareKnowledgeBase(
          knowledgeBaseId,
          c.var.user.id,
          isPublic
        )

        if (!knowledgeBase) {
          return c.json({ error: "Failed to update knowledge base" }, 500)
        }

        return c.json({ knowledgeBase })
      } catch (error) {
        console.error("Error sharing knowledge base:", error)
        const message =
          error instanceof Error ? error.message : "Internal Server Error"

        // T006: 处理 409 Conflict 错误（shareSlug 冲突）
        if (message.includes("Failed to generate unique share slug")) {
          return c.json(
            {
              error: "ConflictError",
              message: "Failed to generate unique share slug. Please try again",
            },
            409
          )
        }

        return c.json({ error: message }, 400)
      }
    }
  )

export default knowledgebase
