import { Hono } from "hono"
import { randomUUID } from "node:crypto"
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  getUserChats,
  getChatById,
  getChatMessages,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  saveMessages,
  validateKnowledgeBaseAccess,
  validateNoteAccess,
  type UpdateChatSessionData,
} from "../../db/queries/index.js"
import type { ChatMessage } from "../../db/schema.js"
import {
  createChatSessionRequestSchema,
  updateChatSessionSchema,
} from "../../db/schema.js"
import { findRelevantContent } from "../lib/ai/embedding.js"
import { findRelevantNoteContent } from "../lib/ai/noteEmbedding.js"
import { getKleeModel } from "../lib/ai/provider.js"

// ==================== 常量配置 ====================
const DEFAULT_CHAT_TITLE = "New Chat"
const DEFAULT_MODEL = "qwen3-30b-a3b-instruct-2507"

const VALID_MODELS = [
  "qwen3-30b-a3b-instruct-2507",
  "qwen3-235b-a22b-instruct-2507",
  "qwen3-coder-flash",
  "qwen3-coder-plus",
] as const

// ==================== Schema 定义 ====================
const uiMessagePartSchema = z.object({ type: z.string() }).passthrough()

const uiMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(uiMessagePartSchema),
})

const createChatRequestSchema = z.object({
  id: z.string().uuid(),
  message: uiMessageSchema,
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
  webSearch: z.boolean().optional(),
  knowledgeBaseIds: z.array(z.string().uuid()).optional(),
  noteIds: z.array(z.string().uuid()).optional(),
  chatConfigId: z.string().uuid().optional(),
})

type StoredMessageParts = UIMessage["parts"]

function normalizeModelName(modelName?: string): string {
  if (!modelName) return DEFAULT_MODEL
  const cleanModelName = modelName.includes(":")
    ? modelName.split(":")[1]
    : modelName
  if (VALID_MODELS.includes(cleanModelName as (typeof VALID_MODELS)[number])) {
    return cleanModelName
  }
  console.warn(`Invalid model name: ${modelName}, fallback to ${DEFAULT_MODEL}`)
  return DEFAULT_MODEL
}

const extractMessageTitle = (message: UIMessage): string | undefined => {
  for (const part of message.parts) {
    if (part.type === "text" && typeof part.text === "string") {
      const trimmed = part.text.trim()
      if (!trimmed) continue
      return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed
    }
  }
  return undefined
}

const mapDbMessageToUI = ({
  id,
  role,
  parts,
}: Pick<ChatMessage, "id" | "role" | "parts">): UIMessage => ({
  id,
  role: role as UIMessage["role"],
  parts: parts as StoredMessageParts,
})

// ==================== 路由定义 ====================
const chat = new Hono()
  .use("*", requireAuth())

  // 获取聊天列表
  .get("/", async (c) => {
    try {
      const chats = await getUserChats(c.var.user.id)
      return c.json({ chats })
    } catch (error) {
      console.error("Error fetching chats:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })

  // 创建聊天
  .post("/create", zValidator("json", createChatSessionRequestSchema), async (c) => {
    try {
      const { id, title, model, systemPrompt, webSearch, chatConfigId } = c.req.valid("json")
      const user = c.var.user

      const existingChat = await getChatById(id, user.id)
      if (existingChat) return c.json({ chat: existingChat })

      const normalizedModel = normalizeModelName(model)
      await createChatSession({
        id,
        userId: user.id,
        title: title ?? DEFAULT_CHAT_TITLE,
        chatConfigId: chatConfigId ?? null,
        model: normalizedModel,
        systemPrompt: systemPrompt ?? null,
        webSearchEnabled: webSearch ?? false,
        availableKnowledgeBaseIds: [],
        availableNoteIds: [],
        visibility: "private",
      })

      const chat = await getChatById(id, user.id)
      return c.json({ chat })
    } catch (error) {
      console.error("Error creating chat:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })

  // 获取单个聊天详情
  .get("/:id", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    try {
      const { id: chatId } = c.req.valid("param")
      const chatRecord = await getChatById(chatId, c.var.user.id)
      if (!chatRecord) return c.json({ error: "Chat not found" }, 404)

      const filteredKbIds = await validateKnowledgeBaseAccess(
        c.var.user.id,
        (chatRecord.availableKnowledgeBaseIds ?? []) as string[]
      )
      const filteredNoteIds = await validateNoteAccess(
        c.var.user.id,
        (chatRecord.availableNoteIds ?? []) as string[]
      )

      const messages = await getChatMessages(chatId)
      return c.json({
        chat: {
          ...chatRecord,
          availableKnowledgeBaseIds: filteredKbIds,
          availableNoteIds: filteredNoteIds,
        },
        messages: messages.map(mapDbMessageToUI),
      })
    } catch (error) {
      console.error("Error fetching chat detail:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })

  // 核心对话接口：流式聊天 + RAG 支持
  .post("/", zValidator("json", createChatRequestSchema), async (c) => {
    try {
      const {
        id: chatId,
        message: incomingMessage,
        model,
        systemPrompt,
        webSearch,
        knowledgeBaseIds,
        noteIds,
        chatConfigId,
      } = c.req.valid("json")

      const user = c.var.user
      const message = incomingMessage as UIMessage
      const chatRecord = await getChatById(chatId, user.id)
      const messagesFromDb = await getChatMessages(chatId)
      const uiMessages = messagesFromDb.map(mapDbMessageToUI)
      const conversation: UIMessage[] = [...uiMessages, message]

      // 验证知识库权限
      const effectiveKbIds = knowledgeBaseIds?.length
        ? await validateKnowledgeBaseAccess(user.id, knowledgeBaseIds)
        : []
      const effectiveNoteIds = noteIds?.length
        ? await validateNoteAccess(user.id, noteIds)
        : []

      // RAG 检索逻辑
      let knowledgeBaseContext = ""
      if (
        ((effectiveKbIds && effectiveKbIds.length > 0) ||
          (effectiveNoteIds && effectiveNoteIds.length > 0)) &&
        message.role === "user"
      ) {
        try {
          const userMessageText = message.parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(" ")

          if (userMessageText) {
            const kbDocs = effectiveKbIds.length
              ? await findRelevantContent({
                  query: userMessageText,
                  knowledgeBaseIds: effectiveKbIds,
                  limit: 3,
                })
              : []

            const noteDocs = effectiveNoteIds.length
              ? await findRelevantNoteContent({
                  query: userMessageText,
                  noteIds: effectiveNoteIds,
                  userId: user.id,
                  limit: 3,
                })
              : []

            const kbResults = kbDocs.map((doc) => ({
              content: doc.content,
              similarity: doc.similarity,
              sourceType: "knowledge_base",
              sourceId: doc.fileId,
              sourceName: doc.fileName,
            }))

            const relevantDocs = [...kbResults, ...noteDocs]
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 3)

            if (relevantDocs.length > 0) {
              knowledgeBaseContext = `\n\n--- KNOWLEDGE BASE AND NOTES CONTEXT ---\nRelevant information from the user's knowledge:\n\n${relevantDocs
                .map(
                  (doc, idx) =>
                    `[${doc.sourceType === "knowledge_base" ? "Document" : "Note"} ${idx + 1}: ${doc.sourceName}]\n${doc.content}\n`
                )
                .join("\n---\n\n")}\n--- END OF CONTEXT ---`
            }
          }
        } catch (err) {
          console.error("RAG retrieval failed:", err)
        }
      }

      // 确保会话存在
      if (!chatRecord) {
        const inferredTitle = extractMessageTitle(message) ?? DEFAULT_CHAT_TITLE
        const normalizedModel = normalizeModelName(model)
        await createChatSession({
          id: chatId,
          userId: user.id,
          title: inferredTitle,
          chatConfigId: chatConfigId ?? null,
          model: normalizedModel,
          systemPrompt: systemPrompt ?? null,
          webSearchEnabled: webSearch ?? false,
          availableKnowledgeBaseIds: effectiveKbIds ?? [],
          availableNoteIds: effectiveNoteIds ?? [],
          visibility: "private",
        })
      } else if (message.role === "user") {
        const updates: UpdateChatSessionData = {}
        const inferredTitle = extractMessageTitle(message)
        if (inferredTitle && (chatRecord.title === "New Chat" || !chatRecord.title.trim())) {
          updates.title = inferredTitle
        }

        const normalizedModel = normalizeModelName(model)
        if (normalizedModel !== chatRecord.model) updates.model = normalizedModel

        if ((webSearch ?? false) !== chatRecord.webSearchEnabled) {
          updates.webSearchEnabled = webSearch ?? false
        }

        if (
          JSON.stringify(chatRecord.availableKnowledgeBaseIds ?? []) !==
          JSON.stringify(effectiveKbIds ?? [])
        ) {
          updates.availableKnowledgeBaseIds = effectiveKbIds ?? []
        }

        if (
          JSON.stringify(chatRecord.availableNoteIds ?? []) !==
          JSON.stringify(effectiveNoteIds ?? [])
        ) {
          updates.availableNoteIds = effectiveNoteIds ?? []
        }

        if (Object.keys(updates).length > 0) {
          await updateChatSession(chatId, updates)
        }
      }

      // 保存用户消息
      if (message.role === "user") {
        await saveMessages({
          messages: [
            {
              id: message.id,
              chatId,
              role: message.role,
              parts: message.parts,
              attachments: [],
              createdAt: new Date(),
            },
          ],
        })
      }

      // 创建流式响应
      const stream = createUIMessageStream({
        originalMessages: conversation,
        generateId: randomUUID,
        execute: ({ writer }) => {
          const systemText =
            chatRecord?.systemPrompt ??
            systemPrompt ??
            "You are a helpful assistant Klee."

          const rawModel = model ?? chatRecord?.model
          const normalizedModel = normalizeModelName(rawModel)

          const result = streamText({
            model: webSearch ? "perplexity/sonar" : getKleeModel(normalizedModel),
            messages: convertToModelMessages(conversation),
            system: systemText + knowledgeBaseContext,
            experimental_transform: smoothStream({ chunking: "word" }),
          })

          result.consumeStream()
          writer.merge(
            result.toUIMessageStream({
              sendSources: false,
              sendReasoning: false,
            })
          )
        },
        onFinish: async ({ messages }) => {
          if (!messages?.length) return
          try {
            await saveMessages({
              messages: messages.map((m) => ({
                id: m.id,
                chatId,
                role: m.role,
                parts: m.parts ?? [],
                attachments: [],
                createdAt: new Date(),
              })),
            })
          } catch (err) {
            console.error("Persist messages failed:", err)
          }
        },
        onError: (err) => {
          console.error("Chat stream error:", err)
          return "生成回复时出错，请稍后重试。"
        },
      })

      const sseStream = stream.pipeThrough(new JsonToSseTransformStream())
      return c.newResponse(sseStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      })
    } catch (error) {
      console.error("Error generating chat response:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })

  // 更新聊天
  .put(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator("json", updateChatSessionSchema),
    async (c) => {
      try {
        const { id: chatId } = c.req.valid("param")
        const chatRecord = await getChatById(chatId, c.var.user.id)
        if (!chatRecord) return c.json({ error: "Chat not found" }, 404)
        const updateData = c.req.valid("json")
        if (!Object.keys(updateData).length) return c.json({ chat: chatRecord })
        await updateChatSession(chatId, updateData)
        const updated = await getChatById(chatId, c.var.user.id)
        return c.json({ chat: updated ?? chatRecord })
      } catch (error) {
        console.error("Error updating chat:", error)
        return c.json({ error: "Internal Server Error" }, 500)
      }
    }
  )

  // 删除聊天
  .delete("/:id", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    try {
      const { id: chatId } = c.req.valid("param")
      const chatRecord = await getChatById(chatId, c.var.user.id)
      if (!chatRecord) return c.json({ error: "Chat not found" }, 404)
      await deleteChatSession(chatId, c.var.user.id)
      return c.json({ success: true })
    } catch (error) {
      console.error("Error deleting chat:", error)
      return c.json({ error: "Internal Server Error" }, 500)
    }
  })

export default chat
