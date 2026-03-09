import type { UIMessage } from 'ai'
import type { LocalChatMessage as DBLocalChatMessage } from '../db/schema'

export type LocalChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

const VALID_ROLES: ReadonlySet<LocalChatMessage['role']> = new Set(['user', 'assistant'])

function normalizeRole(role: string): LocalChatMessage['role'] {
  if (VALID_ROLES.has(role as LocalChatMessage['role'])) {
    return role as LocalChatMessage['role']
  }

  console.warn('[LocalChat] Invalid role detected in DB record:', role)
  return 'assistant'
}

type ParsedPart = {
  type?: string
  text?: string
}

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

export function dbMessageToLocalMessage(message: DBLocalChatMessage): LocalChatMessage {
  const createdAt = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt)

  return {
    id: message.id,
    role: normalizeRole(message.role),
    content: extractTextFromParts(message.parts),
    createdAt,
  }
}

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

export function localMessagesToUIMessages(messages: LocalChatMessage[]): UIMessage[] {
  return messages.map(localMessageToUIMessage)
}
