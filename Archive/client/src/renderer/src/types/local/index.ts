/**
 * Private Mode 类型统一导出
 *
 * 这些类型用于本地 SQLite 数据库和 Ollama 集成
 */

// 聊天消息
export type {
  LocalChatMessage,
  DBLocalChatMessage,
} from './chat'

export {
  dbMessageToLocalMessage,
  localMessageToUIMessage,
  localMessagesToUIMessages,
} from './chat'

// 会话
export type {
  LocalConversation,
  DBLocalConversation,
} from './conversation'

export {
  dbConversationToLocal,
} from './conversation'

// 模型
export type {
  OllamaModel,
  OllamaModelListResponse,
  OllamaSource,
  OllamaInitProgress,
  OllamaReadyStatus,
} from './model'
