/**
 * Private Mode - 本地聊天消息类型
 *
 * 这些类型用于 Private Mode 的本地 SQLite 数据库
 */

import type { UIMessage } from 'ai'

/**
 * 本地聊天消息类型（应用层）
 */
export type LocalChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

/**
 * 数据库消息类型（从 IPC 接收）
 */
export type DBLocalChatMessage = {
  id: string
  role: string
  parts: string
  createdAt: Date | number
}

/**
 * 有效的消息角色
 */
const VALID_ROLES: ReadonlySet<LocalChatMessage['role']> = new Set(['user', 'assistant'])

/**
 * 标准化角色（处理无效值）
 */
function normalizeRole(role: string): LocalChatMessage['role'] {
  if (VALID_ROLES.has(role as LocalChatMessage['role'])) {
    return role as LocalChatMessage['role']
  }

  console.warn('[LocalChat] Invalid role detected in DB record:', role)
  return 'assistant'
}

/**
 * 解析后的消息部分
 */
type ParsedPart = {
  type?: string
  text?: string
}

/**
 * 从 JSON 字符串中提取文本内容
 */
function extractTextFromParts(partsJSON: string): string {
  try {
    const parts = JSON.parse(partsJSON) as ParsedPart[] | ParsedPart | undefined

    if (Array.isArray(parts)) {
      const firstTextPart = parts.find((part) => part?.type === 'text' && typeof part.text === 'string')
      if (firstTextPart?.text) {
        return firstTextPart.text
      }
    } else if (parts && typeof parts === 'object' && typeof (parts as ParsedPart).text === 'string') {
      return (parts as ParsedPart).text ?? ''
    }
  } catch (error) {
    console.warn('[LocalChat] Failed to parse message parts', error)
  }

  return ''
}

/**
 * 转换数据库消息为应用层消息
 */
export function dbMessageToLocalMessage(message: DBLocalChatMessage): LocalChatMessage {
  const createdAt = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt)

  return {
    id: message.id,
    role: normalizeRole(message.role),
    content: extractTextFromParts(message.parts),
    createdAt,
  }
}

/**
 * 转换应用层消息为 AI SDK UIMessage
 */
export function localMessageToUIMessage(message: LocalChatMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [
      {
        type: 'text',
        text: message.content,
      },
    ],
  }
}

/**
 * 批量转换消息
 */
export function localMessagesToUIMessages(messages: LocalChatMessage[]): UIMessage[] {
  return messages.map(localMessageToUIMessage)
}
