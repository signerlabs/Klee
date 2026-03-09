/**
 * 本地消息 IPC 处理器（Private Mode）
 *
 * 提供渲染进程与主进程之间的聊天消息操作接口
 */

import { ipcMain } from 'electron'
import { dbManager } from '../local/db/connection-manager'
import {
  createMessage,
  createMessages,
  getMessagesByChatId,
  getMessageById,
  deleteMessagesByChatId,
  deleteMessage,
  getLastMessageByChatId,
  getMessageCountByChatId,
} from '../local/db/queries/messages'
import {
  wrapIPCHandler,
  validateParams,
  IPCLogger,
} from './error-handler'
import { DB_CHANNELS, IPCErrorCode } from './channels'
import {
  createChatMessageRequestSchema,
  uuidSchema,
  type NewLocalChatMessage,
} from '../local/db/schema'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

/**
 * 注册所有消息相关的 IPC 处理器
 */
export function registerMessageHandlers() {
  /**
   * 创建新的聊天消息
   */
  ipcMain.handle(
    DB_CHANNELS.CREATE_MESSAGE,
    wrapIPCHandler(
      validateParams(
        z.object({
          id: z.string().uuid().optional(), // 可选，服务端生成
          chatId: uuidSchema,
          role: z.enum(['user', 'assistant']),
          parts: z.string(), // JSON 字符串
          attachments: z.string().optional(), // JSON 字符串
        })
      )(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.debug(DB_CHANNELS.CREATE_MESSAGE, 'Creating message', {
          chatId: params.chatId,
          role: params.role,
        })

        const messageData: Omit<NewLocalChatMessage, "createdAt"> = {
          id: params.id || uuidv4(),
          chatId: params.chatId,
          role: params.role,
          parts: params.parts,
          attachments: params.attachments || '[]',
        }

        const message = await createMessage(db as any, messageData)

        IPCLogger.info(DB_CHANNELS.CREATE_MESSAGE, 'Message created successfully', message.id)

        return message
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 批量创建消息（用于流式响应后保存）
   */
  ipcMain.handle(
    'db:create-messages',
    wrapIPCHandler(
      validateParams(
        z.object({
          messages: z.array(
            z.object({
              id: z.string().uuid().optional(),
              chatId: uuidSchema,
              role: z.enum(['user', 'assistant']),
              parts: z.string(),
              attachments: z.string().optional(),
            })
          ),
        })
      )(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.debug('db:create-messages', `Creating ${params.messages.length} messages`)

        const messagesData: Omit<NewLocalChatMessage, "createdAt">[] = params.messages.map((msg: any) => ({
          id: msg.id || uuidv4(),
          chatId: msg.chatId,
          role: msg.role,
          parts: msg.parts,
          attachments: msg.attachments || '[]',
        }))

        const createdMessages = await createMessages(db as any, messagesData)

        IPCLogger.info('db:create-messages', `Created ${createdMessages.length} messages`)

        return createdMessages
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 获取指定聊天会话的所有消息
   */
  ipcMain.handle(
    DB_CHANNELS.GET_MESSAGES,
    wrapIPCHandler(
      validateParams(z.object({ chatId: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.debug(DB_CHANNELS.GET_MESSAGES, 'Fetching messages', params.chatId)

        const messages = await getMessagesByChatId(db as any, params.chatId)

        IPCLogger.debug(
          DB_CHANNELS.GET_MESSAGES,
          `Fetched ${messages.length} messages for chat ${params.chatId}`
        )

        return messages
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 删除单个消息
   */
  ipcMain.handle(
    DB_CHANNELS.DELETE_MESSAGE,
    wrapIPCHandler(
      validateParams(z.object({ id: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.warn(DB_CHANNELS.DELETE_MESSAGE, 'Deleting message', params.id)

        const success = await deleteMessage(db as any, params.id)

        if (!success) {
          throw new Error(`Message not found: ${params.id}`)
        }

        IPCLogger.info(DB_CHANNELS.DELETE_MESSAGE, 'Message deleted successfully', params.id)

        return { deleted: true }
      }),
      IPCErrorCode.RECORD_NOT_FOUND
    )
  )

  /**
   * 删除指定聊天的所有消息
   */
  ipcMain.handle(
    'db:delete-messages-by-chat',
    wrapIPCHandler(
      validateParams(z.object({ chatId: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.warn('db:delete-messages-by-chat', 'Deleting all messages for chat', params.chatId)

        const count = await deleteMessagesByChatId(db as any, params.chatId)

        IPCLogger.info('db:delete-messages-by-chat', `Deleted ${count} messages`)

        return { count }
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 获取聊天的最后一条消息
   */
  ipcMain.handle(
    'db:get-last-message',
    wrapIPCHandler(
      validateParams(z.object({ chatId: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        const lastMessage = await getLastMessageByChatId(db as any, params.chatId)

        return lastMessage || null
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 获取聊天的消息数量
   */
  ipcMain.handle(
    'db:get-message-count',
    wrapIPCHandler(
      validateParams(z.object({ chatId: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        const count = await getMessageCountByChatId(db as any, params.chatId)

        return { count }
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  IPCLogger.info('message-handlers', 'All message IPC handlers registered')
}
