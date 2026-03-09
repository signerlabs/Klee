import { sql } from "drizzle-orm"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"
import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar,
  jsonb,
  index,
  text,
  bigint,
  customType,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { z } from "zod"

// ==================== Chat ====================

// 聊天会话表 - 存储用户的聊天会话元数据
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    chatConfigId: uuid("chat_config_id").references(() => chatConfigs.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    // 每个 session 自己的配置（持久化保存）
    model: varchar("model", { length: 64 }).notNull(),
    systemPrompt: text("system_prompt"),
    webSearchEnabled: boolean("web_search_enabled").notNull().default(false),
    availableKnowledgeBaseIds: jsonb("available_knowledge_base_ids")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    availableNoteIds: jsonb("available_note_ids")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    starred: boolean("starred").notNull().default(false),
    visibility: varchar("visibility", { length: 16 })
      .notNull()
      .default("private"),
    lastContext: jsonb("last_context").$type<unknown>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_sessions_user_id_created_at_idx").on(
      table.userId,
      table.createdAt
    ),
    index("chat_sessions_chat_config_id_idx").on(table.chatConfigId),
  ]
)

// 聊天消息表 - 存储每条聊天消息的内容和元数据
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().notNull(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull(),
    parts: jsonb("parts").$type<unknown>().notNull(),
    attachments: jsonb("attachments")
      .$type<unknown>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_messages_chat_id_created_at_idx").on(
      table.chatId,
      table.createdAt
    ),
  ]
)

export type ChatSession = InferSelectModel<typeof chatSessions>
export type NewChatSession = InferInsertModel<typeof chatSessions>
export type ChatMessage = InferSelectModel<typeof chatMessages>
export type NewChatMessage = InferInsertModel<typeof chatMessages>

// 聊天会话 schemas
export const insertChatSessionSchema = createInsertSchema(chatSessions, {
  title: (schema) =>
    schema.min(1, "Title is required").max(200, "Title too long"),
  model: (schema) =>
    schema.min(1, "Model is required").max(64, "Model name too long"),
  systemPrompt: (schema) =>
    schema.max(5000, "System prompt too long").optional(),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
})

// 用于 POST /api/chat/create 的请求体 schema
// 注意：API 使用 webSearch，数据库使用 webSearchEnabled（路由层会做映射）
export const createChatSessionRequestSchema = z.object({
  id: z.string().uuid(),
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title too long")
    .optional(),
  model: z
    .string()
    .min(1, "Model is required")
    .max(64, "Model name too long")
    .optional(),
  systemPrompt: z.string().max(5000, "System prompt too long").optional(),
  webSearch: z.boolean().optional(), // API 层使用 webSearch，与前端保持一致
  chatConfigId: z.string().uuid().optional(),
})

// 用于 PUT /api/chat/:id 的请求体 schema
export const updateChatSessionSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title too long")
    .optional(),
  starred: z.boolean().optional(),
  visibility: z.enum(["private", "public"]).optional(),
})

// 聊天消息 schemas
export const insertChatMessageSchema = createInsertSchema(chatMessages, {
  role: (schema) => schema.min(1, "Role is required"),
}).omit({
  createdAt: true,
})

// ==================== Chat Configs ====================

// 聊天配置表 - 存储可复用的聊天配置预设
export const chatConfigs = pgTable(
  "chat_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    avatar: text("avatar"), // Agent 头像: emoji 或图片 URL
    defaultModel: varchar("default_model", { length: 64 }).notNull(),
    systemPrompt: text("system_prompt"),
    webSearchEnabled: boolean("web_search_enabled").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(false),
    shareSlug: varchar("share_slug", { length: 64 }),
    sourceShareSlug: varchar("source_share_slug", { length: 64 }), // 安装来源的 shareSlug
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_configs_user_id_idx").on(table.userId),
    index("chat_configs_share_slug_idx").on(table.shareSlug),
    index("chat_configs_source_share_slug_idx").on(table.sourceShareSlug),
    unique("chat_configs_share_slug_unique").on(table.shareSlug),
  ]
)

// 聊天配置与知识库的关联表 - 多对多关系
export const chatConfigKnowledgeBases = pgTable(
  "chat_config_knowledge_bases",
  {
    chatConfigId: uuid("chat_config_id")
      .notNull()
      .references(() => chatConfigs.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.chatConfigId, table.knowledgeBaseId] }),
    index("chat_config_kb_config_id_idx").on(table.chatConfigId),
    index("chat_config_kb_kb_id_idx").on(table.knowledgeBaseId),
  ]
)

export type ChatConfig = InferSelectModel<typeof chatConfigs>
export type NewChatConfig = InferInsertModel<typeof chatConfigs>
export type ChatConfigKnowledgeBase = InferSelectModel<
  typeof chatConfigKnowledgeBases
>
export type NewChatConfigKnowledgeBase = InferInsertModel<
  typeof chatConfigKnowledgeBases
>

export const insertChatConfigSchema = createInsertSchema(chatConfigs, {
  name: (schema) => schema.min(1, "Name is required").max(80, "Name too long"),
  avatar: (schema) => schema.max(500, "Avatar too long").optional(),
  defaultModel: (schema) =>
    schema.min(1, "Model is required").max(64, "Model name too long"),
  systemPrompt: (schema) =>
    schema.max(5000, "System prompt too long").optional(),
  shareSlug: (schema) => schema.max(64, "Share slug too long").optional(),
  sourceShareSlug: (schema) =>
    schema.max(64, "Source share slug too long").optional(),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
})

export const updateChatConfigSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(80, "Name too long")
    .optional(),
  avatar: z.string().max(500, "Avatar too long").optional(),
  defaultModel: z
    .string()
    .min(1, "Model is required")
    .max(64, "Model name too long")
    .optional(),
  systemPrompt: z.string().max(5000, "System prompt too long").optional(),
  webSearchEnabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  shareSlug: z.string().max(64, "Share slug too long").optional(),
  sourceShareSlug: z.string().max(64, "Source share slug too long").optional(),
})

// 聊天配置-知识库关联 schema
export const insertChatConfigKnowledgeBaseSchema = createInsertSchema(
  chatConfigKnowledgeBases
)

// 用于 PUT /api/chat-configs/:id/knowledge-bases 的请求体 schema
export const setChatConfigKnowledgeBasesSchema = z.object({
  knowledgeBaseIds: z.array(z.string().uuid()),
})

// T026: 用于 PUT /api/chat-configs/:id/share 的请求体 schema
export const shareChatConfigSchema = z.object({
  isPublic: z.boolean({
    required_error: "isPublic is required",
    invalid_type_error: "isPublic must be a boolean",
  }),
})

// T042: 用于 POST /api/chat-configs/install 的请求体 schema
export const installAgentSchema = z.object({
  shareSlug: z
    .string({
      required_error: "shareSlug is required",
      invalid_type_error: "shareSlug must be a string",
    })
    .min(1, "shareSlug cannot be empty")
    .max(64, "shareSlug too long"),
})

// ==================== Knowledge Base ====================

// 自定义 vector 类型用于 pgvector 扩展存储高维向量
// 使用 OpenAI text-embedding-3-small 模型，默认维度 1536
// 注意：如果更改 embedding 模型或维度，需要同步更新 src/lib/ai/embedding.ts 中的配置
const vector = customType<{
  data: number[]
  driverData: string
  config: { dimensions: number }
}>({
  dataType: (config) => `vector(${config?.dimensions ?? 1536})`,
  toDriver: (value: number[]) => JSON.stringify(value),
  fromDriver: (value: string) => {
    if (typeof value === "string") {
      return JSON.parse(value.replace(/^\[/, "[").replace(/\]$/, "]"))
    }
    return value
  },
})

// 知识库表 - 存储知识库的元数据
export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    starred: boolean("starred").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(false), // 是否分享到市场
    shareSlug: varchar("share_slug", { length: 64 }), // 唯一分享标识符
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_bases_user_id_idx").on(table.userId),
    index("knowledge_bases_share_slug_idx").on(table.shareSlug),
    unique("knowledge_bases_share_slug_unique").on(table.shareSlug),
  ]
)

// 知识库文件表 - 存储上传文件的元数据和 Supabase Storage 路径
export const knowledgeBaseFiles = pgTable(
  "knowledge_base_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    fileType: varchar("file_type", { length: 128 }),
    storagePath: text("storage_path"), // 允许 null，上传完成后更新
    contentText: text("content_text"),
    status: varchar("status", { length: 20 }).notNull().default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("kb_files_kb_id_idx").on(table.knowledgeBaseId)]
)

// Embeddings 表 - 存储文本块的向量表示，用于 RAG 检索
// 注意：向量索引需要在 migration SQL 中手动添加 HNSW 索引
export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => knowledgeBaseFiles.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("embeddings_kb_id_idx").on(table.knowledgeBaseId),
    index("embeddings_file_id_idx").on(table.fileId),
  ]
)

export type KnowledgeBase = InferSelectModel<typeof knowledgeBases>
export type NewKnowledgeBase = InferInsertModel<typeof knowledgeBases>
export type UpdateKnowledgeBase = Partial<
  Omit<NewKnowledgeBase, "id" | "userId" | "createdAt" | "updatedAt">
>
export type KnowledgeBaseFile = InferSelectModel<typeof knowledgeBaseFiles>
export type NewKnowledgeBaseFile = InferInsertModel<typeof knowledgeBaseFiles>
export type Embedding = InferSelectModel<typeof embeddings>
export type NewEmbedding = InferInsertModel<typeof embeddings>

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBases, {
  name: (schema) => schema.min(1, "Name is required").max(200, "Name too long"),
  description: (schema) => schema.max(1000, "Description too long").optional(),
}).omit({
  id: true,
  userId: true,
  starred: true,
  createdAt: true,
  updatedAt: true,
})

export const updateKnowledgeBaseSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(200, "Name too long")
    .optional(),
  description: z.string().max(1000, "Description too long").optional(),
  starred: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  shareSlug: z.string().max(64, "Share slug too long").optional(),
})

// T034: Zod 验证器用于分享知识库
export const shareKnowledgeBaseSchema = z.object({
  isPublic: z.boolean({
    required_error: "isPublic is required",
    invalid_type_error: "isPublic must be a boolean",
  }),
})

// ==================== Note ====================

// 笔记表 - 存储用户的笔记内容和元数据
export const notes = pgTable("note", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  starred: boolean("starred").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type Note = InferSelectModel<typeof notes>
export type NewNote = InferInsertModel<typeof notes>
export type UpdateNote = Partial<
  Omit<NewNote, "id" | "userId" | "createdAt" | "updatedAt">
>


export const noteIdParamSchema = z.object({ id: z.string().uuid() })

export const getNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const createNoteSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  content: z.string().optional().default(""),
})

export const updateNoteSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title too long")
    .optional(),
  content: z.string().optional(),
  starred: z.boolean().optional(),
})

// ==================== Note Embeddings ====================

// 笔记嵌入表 - 存储笔记文本块的向量表示，用于 RAG 检索
export const noteEmbeddings = pgTable(
  "note_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, {
        onDelete: "cascade",
      }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("note_embeddings_note_id_idx").on(table.noteId)]
)

export type NoteEmbedding = InferSelectModel<typeof noteEmbeddings>
export type NewNoteEmbedding = InferInsertModel<typeof noteEmbeddings>
