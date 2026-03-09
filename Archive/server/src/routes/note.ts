import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { requireAuth, getUser } from "../middleware/auth.middleware.js"
import {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  embedNote,
} from "../../db/queries/index.js"
import {
  getNotesQuerySchema,
  createNoteSchema,
  updateNoteSchema,
  noteIdParamSchema,
} from "../../db/schema.js"
import type { UpdateNote } from "../../db/schema.js"

const note = new Hono()
  .use("*", requireAuth())
  /**
   * GET /api/note - Get all notes for the current user (with pagination)
   */
  .get("/", zValidator("query", getNotesQuerySchema), async (c) => {
    try {
      const user = getUser(c)
      const query = c.req.valid("query")

      const { note, totalCount } = await getNotes(user.id, query)

      return c.json({
        note,
        pagination: {
          total: totalCount,
          page: query.page,
          pageSize: query.pageSize,
          totalPages: Math.ceil(totalCount / query.pageSize),
        },
      })
    } catch (error) {
      console.error("Error fetching notes:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  /**
   * POST /api/note - Create a new note
   */
  .post("/", zValidator("json", createNoteSchema), async (c) => {
    try {
      const user = getUser(c)
      const { title, content } = c.req.valid("json")

      const newNote = await createNote({
        userId: user.id,
        title,
        content: content ?? "",
        starred: false,
      })

      // 笔记内容保存后如需参与 RAG，可由客户端调用 embed 接口手动生成向量

      return c.json({ note: newNote }, 201)
    } catch (error) {
      console.error("Error creating note:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  /**
   * GET /api/note/:id - Get a single note by ID
   */
  .get("/:id", zValidator("param", noteIdParamSchema), async (c) => {
    try {
      const user = getUser(c)
      const { id: noteId } = c.req.valid("param")

      const noteRecord = await getNoteById(noteId, user.id)

      if (!noteRecord) {
        return c.json({ error: "Note not found" }, 404)
      }

      return c.json({ note: noteRecord })
    } catch (error) {
      console.error("Error fetching note:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  /**
   * PUT /api/note/:id - Update a note
   */
  .put(
    "/:id",
    zValidator("param", noteIdParamSchema),
    zValidator("json", updateNoteSchema),
    async (c) => {
      try {
        const user = getUser(c)
        const { id: noteId } = c.req.valid("param")
        const updateData: UpdateNote = c.req.valid("json")

        const existingNote = await getNoteById(noteId, user.id)
        if (!existingNote) {
          return c.json({ error: "Note not found" }, 404)
        }

        const updatedNote = await updateNote(noteId, user.id, updateData)

        // 更新接口仅保存内容，向量化由客户端在需要时调用 embed 接口完成

        return c.json({ note: updatedNote })
      } catch (error) {
        console.error("Error updating note:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )
  /**
   * DELETE /api/note/:id - Delete a note
   */
  .delete("/:id", zValidator("param", noteIdParamSchema), async (c) => {
    try {
      const user = getUser(c)
      const { id: noteId } = c.req.valid("param")

      const existingNote = await getNoteById(noteId, user.id)
      if (!existingNote) {
        return c.json({ error: "Note not found" }, 404)
      }

      await deleteNote(noteId, user.id)

      return c.json({ success: true })
    } catch (error) {
      console.error("Error deleting note:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })
  /**
   * POST /api/note/:id/embed - 对笔记内容进行向量化，用于RAG检索
   */
  .post("/:id/embed", zValidator("param", noteIdParamSchema), async (c) => {
    try {
      const user = getUser(c)
      const { id: noteId } = c.req.valid("param")

      // 使用查询函数验证笔记所有权并处理向量化
      const result = await embedNote(noteId, user.id)

      if (!result.success) {
        return c.json(
          {
            error: result.error || "Failed to process note embedding",
          },
          404
        )
      }

      return c.json({
        success: true,
        chunksCount: result.chunksCount,
        textLength: result.textLength,
      })
    } catch (error) {
      console.error("Error embedding note:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })

export default note
