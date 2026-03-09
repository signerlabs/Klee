/**
 * Private Mode - 本地会话类型
 */

/**
 * 本地会话类型
 */
export type LocalConversation = {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 数据库会话类型（从 IPC 接收）
 */
export type DBLocalConversation = {
  id: string
  title: string
  createdAt: Date | number
  updatedAt: Date | number
}

/**
 * 转换数据库会话为应用层会话
 */
export function dbConversationToLocal(conversation: DBLocalConversation): LocalConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt instanceof Date
      ? conversation.createdAt
      : new Date(conversation.createdAt),
    updatedAt: conversation.updatedAt instanceof Date
      ? conversation.updatedAt
      : new Date(conversation.updatedAt),
  }
}
