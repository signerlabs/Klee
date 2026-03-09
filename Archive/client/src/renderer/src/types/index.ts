/**
 * 类型定义统一导出入口
 *
 * 使用指南：
 *
 * 1. Cloud Mode 类型（从 Hono RPC 推断）
 *    import { KnowledgeBase, ChatConfig } from '@/types'
 *    或
 *    import { KnowledgeBase } from '@/types/cloud'
 *
 * 2. Private Mode 类型（本地定义）
 *    import { LocalChatMessage, OllamaModel } from '@/types'
 *    或
 *    import { LocalChatMessage } from '@/types/local'
 *
 * 3. 共享类型
 *    import { AppMode, MessageRole } from '@/types'
 *    或
 *    import { AppMode } from '@/types/shared'
 *
 * 注意：
 * - Cloud Mode 类型依赖 Hono RPC，需要先构建 server
 * - 不要手动定义已有的推断类型，保持单一数据源
 * - Private Mode 类型独立定义，不依赖后端
 */

// ==================== Cloud Mode ====================
export type {
  // 知识库
  GetKnowledgeBaseResponse,
  GetKnowledgeBasesResponse,
  KnowledgeBaseListItem,
  KnowledgeBase,
  KnowledgeBaseFile,
  CreateKnowledgeBasePayload,
  UpdateKnowledgeBasePayload,
  KnowledgeBaseFormErrors,
  CreateKnowledgeBaseFormErrors,

  // 聊天
  GetConversationResponse,
  GetConversationsResponse,
  CreateConversationPayload,
  UpdateConversationPayload,
  GetChatConfigsResponse,
  CreateChatConfigPayload,
  UpdateChatConfigPayload,
  SetConfigKnowledgeBasesPayload,
  ChatConfig,
  Conversation,

  // 笔记
  GetNotesResponse,
  Note,

  // 市场
  GetMarketplaceAgentsResponse,
  GetMarketplaceAgentResponse,
  MarketplaceAgent,
} from './cloud'

// ==================== Private Mode ====================
export type {
  // 聊天消息
  LocalChatMessage,
  DBLocalChatMessage,

  // 会话
  LocalConversation,
  DBLocalConversation,

  // 模型
  OllamaModel,
  OllamaModelListResponse,
  OllamaSource,
  OllamaInitProgress,
  OllamaReadyStatus,
} from './local'

export {
  // 聊天消息转换函数
  dbMessageToLocalMessage,
  localMessageToUIMessage,
  localMessagesToUIMessages,

  // 会话转换函数
  dbConversationToLocal,
} from './local'

// ==================== 共享类型 ====================
export type {
  AppMode,
  MessageRole,
  AppError,
  PaginationParams,
  PaginatedResponse,
} from './shared'
