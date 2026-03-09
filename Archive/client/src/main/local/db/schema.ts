/**
 * Private Mode 本地数据库 Schema（SQLite）
 *
 * 设计说明：
 * - 表名和字段名与云端 PostgreSQL schema 完全一致（server/db/schema.ts）
 * - 仅在 TypeScript 导出的常量名前加 local 前缀（如 localChatSessions）
 * - 保持相同的类型推导和验证模式
 * - UUID 使用 text 类型存储，在应用层生成
 * - 时间戳使用 integer 类型存储 Unix timestamp
 * - JSON 数据使用 text 类型，在应用层序列化/反序列化
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod'

// ==================== Chat Sessions（聊天会话）====================

/**
 * 本地聊天会话表 - 存储 Private Mode 下的对话元数据
 *
 * 对应 Cloud Mode 的 chat_sessions 表
 * Private Mode 简化：移除了 userId（单用户模式）, chatConfigId（无 Agent 分享）, visibility（无分享功能）, lastContext, webSearchEnabled（私有模式无网络搜索）
 */
export const localChatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(), // UUID，应用层生成
    title: text('title').notNull(),
    model: text('model').notNull(), // 本地模型 ID，如 'llama3:8b'
    systemPrompt: text('system_prompt'), // 系统提示词
    availableKnowledgeBaseIds: text('available_knowledge_base_ids').notNull().default('[]'), // JSON 数组，如 '["uuid1","uuid2"]'
    availableNoteIds: text('available_note_ids').notNull().default('[]'), // JSON 数组
    starred: integer('starred', { mode: 'boolean' }).notNull().default(false), // 收藏状态
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('chat_sessions_created_at_idx').on(table.createdAt)]
)

/**
 * 本地聊天消息表 - 存储 Private Mode 下的对话消息
 *
 * 对应 Cloud Mode 的 chat_messages 表
 * 保持与云端一致的 AI SDK 消息格式（parts + attachments）
 */
export const localChatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(), // UUID，应用层生成
    chatId: text('chat_id')
      .notNull()
      .references(() => localChatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user' 或 'assistant'
    parts: text('parts').notNull(), // JSON 字符串，AI SDK 消息部分 [{ type: 'text', text: '...' }]
    attachments: text('attachments').notNull().default('[]'), // JSON 字符串，附件数组
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('chat_messages_chat_id_created_at_idx').on(table.chatId, table.createdAt)]
)

// 类型导出 - 保持与 server/db/schema.ts 相同的命名模式
export type LocalChatSession = InferSelectModel<typeof localChatSessions>
export type NewLocalChatSession = InferInsertModel<typeof localChatSessions>
export type LocalChatMessage = InferSelectModel<typeof localChatMessages>
export type NewLocalChatMessage = InferInsertModel<typeof localChatMessages>

// Zod 验证器 - 与云端保持一致的验证规则
export const insertLocalChatSessionSchema = createInsertSchema(localChatSessions, {
  title: (schema) => schema.min(1, 'Title is required').max(200, 'Title too long'),
  model: (schema) => schema.min(1, 'Model is required').max(64, 'Model name too long'),
  systemPrompt: (schema) => schema.max(5000, 'System prompt too long').optional(),
}).omit({
  createdAt: true,
})

// 更新聊天会话的 schema（用于更新操作）
export const updateLocalChatSessionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').optional(),
  starred: z.boolean().optional(),
  model: z.string().min(1, 'Model is required').max(64, 'Model name too long').optional(),
  availableKnowledgeBaseIds: z.array(z.string().uuid()).optional(),
  availableNoteIds: z.array(z.string().uuid()).optional(),
})

export const insertLocalChatMessageSchema = createInsertSchema(localChatMessages, {
  role: (schema) => schema.min(1, 'Role is required'),
  parts: (schema) => schema.min(1, 'Parts is required'), // JSON 字符串验证
  attachments: (schema) => schema.optional(), // JSON 字符串，可选
}).omit({
  createdAt: true,
})

// ==================== Knowledge Bases（知识库）====================

/**
 * 本地知识库表 - 存储 Private Mode 下的知识库元数据
 *
 * 对应 Cloud Mode 的 knowledge_bases 表
 * Private Mode 简化：移除了 userId（单用户模式）, isPublic, shareSlug（无分享功能）
 */
export const localKnowledgeBases = sqliteTable(
  'knowledge_bases',
  {
    id: text('id').primaryKey(), // UUID，应用层生成
    name: text('name').notNull(),
    description: text('description'),
    starred: integer('starred', { mode: 'boolean' }).notNull().default(false), // 收藏状态
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('knowledge_bases_starred_created_at_idx').on(table.starred, table.createdAt),
  ]
)

/**
 * 本地知识库文件表 - 存储 Private Mode 下的知识库文档元数据
 *
 * 对应 Cloud Mode 的 knowledge_base_files 表
 * 注意：向量数据存储在 LanceDB 中，这里只存储元数据
 */
export const localKnowledgeBaseFiles = sqliteTable(
  'knowledge_base_files',
  {
    id: text('id').primaryKey(), // UUID，应用层生成
    knowledgeBaseId: text('knowledge_base_id')
      .notNull()
      .references(() => localKnowledgeBases.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(), // 文件大小（字节）
    fileType: text('file_type'), // 文件类型，如 'application/pdf'
    storagePath: text('storage_path').notNull(), // 本地文件系统路径
    contentText: text('content_text'), // 提取的文本内容
    status: text('status').notNull().default('processing'), // 'processing' | 'completed' | 'failed'
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('kb_files_kb_id_idx').on(table.knowledgeBaseId)]
)

// 类型导出
export type LocalKnowledgeBase = InferSelectModel<typeof localKnowledgeBases>
export type NewLocalKnowledgeBase = InferInsertModel<typeof localKnowledgeBases>
export type LocalKnowledgeBaseFile = InferSelectModel<typeof localKnowledgeBaseFiles>
export type NewLocalKnowledgeBaseFile = InferInsertModel<typeof localKnowledgeBaseFiles>

// Zod 验证器
export const insertLocalKnowledgeBaseSchema = createInsertSchema(localKnowledgeBases, {
  name: (schema) => schema.min(1, 'Name is required').max(200, 'Name too long'),
  description: (schema) => schema.max(1000, 'Description too long').optional(),
}).omit({
  createdAt: true,
  updatedAt: true,
})

// 更新知识库的 schema
export const updateLocalKnowledgeBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long').optional(),
  description: z.string().max(1000, 'Description too long').optional(),
  starred: z.boolean().optional(),
})

export const insertLocalKnowledgeBaseFileSchema = createInsertSchema(localKnowledgeBaseFiles, {
  fileName: (schema) => schema.min(1, 'File name is required').max(255, 'File name too long'),
  fileSize: (schema) => schema.min(1, 'File size must be greater than 0'),
  storagePath: (schema) =>
    schema.min(1, 'Storage path is required').max(1000, 'Storage path too long'),
}).omit({
  createdAt: true,
})

// ==================== Models（本地模型配置）====================

/**
 * 本地模型表 - 存储 Private Mode 下已下载的 Ollama 模型元数据
 *
 * 云端没有对应的表，这是 Private Mode 特有的
 */
export const localModels = sqliteTable(
  'models',
  {
    id: text('id').primaryKey(), // 模型 ID，如 'llama3:8b'
    name: text('name').notNull(), // 显示名称
    size: integer('size').notNull(), // 模型大小（字节）
    family: text('family').notNull(), // 模型家族，如 'llama'
    parameterSize: text('parameter_size').notNull(), // 参数大小，如 '8B'
    quantization: text('quantization').notNull(), // 量化级别，如 'Q4_0'
    downloadedAt: integer('downloaded_at', { mode: 'timestamp' }).notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }), // 最后使用时间
  },
  (table) => [index('models_last_used_at_idx').on(table.lastUsedAt)]
)

// 类型导出
export type LocalModel = InferSelectModel<typeof localModels>
export type NewLocalModel = InferInsertModel<typeof localModels>

// Zod 验证器
export const insertLocalModelSchema = createInsertSchema(localModels, {
  id: (schema) => schema.min(1, 'Model ID is required').max(64, 'Model ID too long'),
  name: (schema) => schema.min(1, 'Name is required').max(100, 'Name too long'),
  size: (schema) => schema.min(1, 'Size must be greater than 0'),
  family: (schema) => schema.min(1, 'Family is required').max(50, 'Family too long'),
  parameterSize: (schema) =>
    schema.min(1, 'Parameter size is required').max(20, 'Parameter size too long'),
  quantization: (schema) =>
    schema.min(1, 'Quantization is required').max(20, 'Quantization too long'),
}).omit({
  downloadedAt: true,
  lastUsedAt: true,
})

// ==================== 数据验证辅助函数 ====================

/**
 * 验证消息角色是否有效
 */
export const messageRoleSchema = z.enum(['user', 'assistant'])

/**
 * 验证 UUID 格式
 */
export const uuidSchema = z.string().uuid()

/**
 * 创建聊天会话的请求 schema
 */
export const createChatSessionRequestSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1).max(200),
  model: z.string().min(1).max(64),
  systemPrompt: z.string().max(5000).optional(),
})

/**
 * 创建消息的请求 schema
 */
export const createChatMessageRequestSchema = z.object({
  id: uuidSchema,
  chatId: uuidSchema,
  role: messageRoleSchema,
  parts: z.string().min(1), // JSON 字符串，如 '[{"type":"text","text":"Hello"}]'
  attachments: z.string().optional(), // JSON 字符串，可选
})

/**
 * 创建知识库的请求 schema（不包含自动生成的字段）
 */
export const createKnowledgeBaseRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
})

/**
 * 上传文件的请求 schema
 */
export const uploadFileRequestSchema = z.object({
  id: uuidSchema,
  knowledgeBaseId: uuidSchema,
  fileName: z.string().min(1).max(255),
  fileSize: z
    .number()
    .min(1)
    .max(100 * 1024 * 1024), // 最大 100MB
  fileType: z.string().optional(),
  storagePath: z.string().min(1).max(1000),
})

// ==================== Notes（笔记）====================

/**
 * 本地笔记表 - 存储 Private Mode 下的笔记
 *
 * 对应 Cloud Mode 的 notes 表
 * Private Mode 简化：移除了 userId（单用户模式）
 */
export const localNotes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(), // UUID，应用层生成
    title: text('title').notNull(),
    content: text('content').notNull(),
    starred: integer('starred', { mode: 'boolean' }).notNull().default(false), // 收藏状态
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('notes_starred_updated_at_idx').on(table.starred, table.updatedAt)
  ]
)

// 类型导出
export type LocalNote = InferSelectModel<typeof localNotes>
export type NewLocalNote = InferInsertModel<typeof localNotes>

// Zod 验证器
export const insertLocalNoteSchema = createInsertSchema(localNotes, {
  title: (schema) => schema.min(1, 'Title is required').max(200, 'Title too long'),
  content: (schema) => schema.optional().default(''),
}).omit({
  createdAt: true,
  updatedAt: true,
})

// 更新笔记的 schema
export const updateLocalNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  starred: z.boolean().optional(),
})
