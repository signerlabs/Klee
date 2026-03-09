/**
 * Cloud Mode 类型统一导出
 *
 * 所有类型从 Hono RPC 自动推断，确保端到端类型安全
 */

// 知识库
export type {
  GetKnowledgeBaseResponse,
  GetKnowledgeBasesResponse,
  KnowledgeBaseListItem,
  KnowledgeBase,
  KnowledgeBaseFile,
  CreateKnowledgeBasePayload,
  UpdateKnowledgeBasePayload,
  KnowledgeBaseFormErrors,
  CreateKnowledgeBaseFormErrors,
} from './knowledge-base'

// 聊天
export type {
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
} from './chat'

// 笔记
export type { GetNotesResponse, Note } from './note'

// 市场
export type {
  GetMarketplaceAgentsResponse,
  GetMarketplaceAgentResponse,
  MarketplaceAgent,
} from './marketplace'
