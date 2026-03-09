/**
 * IPC Channel Constants (Renderer-safe copy)
 *
 * This is a copy of the IPC channels from the main process.
 * We keep this separate to avoid importing main process code in the renderer.
 */

export const DB_CHANNELS = {
  // Conversation operations
  GET_CONVERSATIONS: 'db:get-conversations',
  GET_CONVERSATION: 'db:get-conversation',
  CREATE_CONVERSATION: 'db:create-conversation',
  UPDATE_CONVERSATION: 'db:update-conversation',
  DELETE_CONVERSATION: 'db:delete-conversation',
  TOGGLE_CONVERSATION_STARRED: 'db:toggle-conversation-starred',

  // Message operations
  GET_MESSAGES: 'db:get-messages',
  GET_MESSAGE: 'db:get-message',
  CREATE_MESSAGE: 'db:create-message',
  DELETE_MESSAGE: 'db:delete-message',
  GET_LAST_MESSAGE: 'db:get-last-message',
  GET_MESSAGE_COUNT: 'db:get-message-count',
} as const

export const IPCErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DB_QUERY_ERROR: 'DB_QUERY_ERROR',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type IPCErrorCode = (typeof IPCErrorCode)[keyof typeof IPCErrorCode]
