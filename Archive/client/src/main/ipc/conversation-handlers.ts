/**
 * 本地对话 IPC 处理器（Private Mode）
 *
 * 提供渲染进程与主进程之间的聊天会话操作接口
 */

import { ipcMain } from 'electron'
import { dbManager } from '../local/db/connection-manager'
import {
  createConversation,
  getAllConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  toggleConversationStarred,
  getStarredConversations,
} from '../local/db/queries/conversations'
import {
  wrapIPCHandler,
  validateParams,
  IPCLogger,
  createErrorResponse,
} from './error-handler'
import { DB_CHANNELS, IPCErrorCode } from './channels'
import {
  createChatSessionRequestSchema,
  updateLocalChatSessionSchema,
  uuidSchema,
  type NewLocalChatSession,
} from '../local/db/schema'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

/**
 * 注册所有对话相关的 IPC 处理器
 */
export function registerConversationHandlers() {
  /**
   * 创建新的聊天会话
   */
  ipcMain.handle(
    DB_CHANNELS.CREATE_CONVERSATION,
    wrapIPCHandler(
      validateParams(
        createChatSessionRequestSchema.omit({ id: true }).extend({
          // id 可选，客户端不提供时由服务端生成
          id: z.string().uuid().optional(),
        })
      )(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.info(DB_CHANNELS.CREATE_CONVERSATION, 'Creating conversation', params)

        const conversationData: Omit<NewLocalChatSession, 'createdAt'> = {
          id: params.id || uuidv4(),
          title: params.title,
          model: params.model,
          systemPrompt: params.systemPrompt,
          availableKnowledgeBaseIds: '[]', // 默认值
          availableNoteIds: '[]', // 默认值
          starred: false,
        }

        const conversation = await createConversation(db as any, conversationData as any)

        IPCLogger.info(
          DB_CHANNELS.CREATE_CONVERSATION,
          'Conversation created successfully',
          conversation.id
        )

        return conversation
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 获取所有聊天会话
   */
  ipcMain.handle(
    DB_CHANNELS.GET_CONVERSATIONS,
    wrapIPCHandler(async (event, params) => {
      const db = await dbManager.getConnection('private')

      if (!db) {
        throw new Error('Private mode database not initialized')
      }

      IPCLogger.debug(DB_CHANNELS.GET_CONVERSATIONS, 'Fetching all conversations')

      const conversations = await getAllConversations(db as any)

      IPCLogger.debug(
        DB_CHANNELS.GET_CONVERSATIONS,
        `Fetched ${conversations.length} conversations`
      )

      return conversations
    }, IPCErrorCode.DB_QUERY_ERROR)
  )

  /**
   * 获取指定 ID 的聊天会话
   */
  ipcMain.handle(
    DB_CHANNELS.GET_CONVERSATION,
    wrapIPCHandler(
      validateParams(z.object({ id: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.debug(DB_CHANNELS.GET_CONVERSATION, 'Fetching conversation', params.id)

        const conversation = await getConversationById(db as any, params.id)

        // 返回 null 而不是抛出错误，让调用者决定如何处理
        if (!conversation) {
          IPCLogger.debug(DB_CHANNELS.GET_CONVERSATION, 'Conversation not found', params.id)
          return null
        }

        return conversation
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 更新聊天会话
   */
  ipcMain.handle(
    DB_CHANNELS.UPDATE_CONVERSATION,
    wrapIPCHandler(
      validateParams(
        z.object({
          id: uuidSchema,
          data: updateLocalChatSessionSchema,
        })
      )(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.info(DB_CHANNELS.UPDATE_CONVERSATION, 'Updating conversation', params.id)

        const updated = await updateConversation(db as any, params.id, params.data)

        if (!updated) {
          throw new Error(`Failed to update conversation: ${params.id}`)
        }

        IPCLogger.info(DB_CHANNELS.UPDATE_CONVERSATION, 'Conversation updated successfully')

        return updated
      }),
      IPCErrorCode.DB_QUERY_ERROR
    )
  )

  /**
   * 删除聊天会话（级联删除消息）
   */
  ipcMain.handle(
    DB_CHANNELS.DELETE_CONVERSATION,
    wrapIPCHandler(
      validateParams(z.object({ id: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.warn(DB_CHANNELS.DELETE_CONVERSATION, 'Deleting conversation', params.id)

        const success = await deleteConversation(db as any, params.id)

        if (!success) {
          throw new Error(`Conversation not found: ${params.id}`)
        }

        IPCLogger.info(
          DB_CHANNELS.DELETE_CONVERSATION,
          'Conversation deleted successfully',
          params.id
        )

        return { deleted: true }
      }),
      IPCErrorCode.RECORD_NOT_FOUND
    )
  )

  /**
   * 切换聊天会话的收藏状态
   */
  ipcMain.handle(
    DB_CHANNELS.STAR_CONVERSATION,
    wrapIPCHandler(
      validateParams(z.object({ id: uuidSchema }))(async (event, params) => {
        const db = await dbManager.getConnection('private')

        if (!db) {
          throw new Error('Private mode database not initialized')
        }

        IPCLogger.info(DB_CHANNELS.STAR_CONVERSATION, 'Toggling star for conversation', params.id)

        const updated = await toggleConversationStarred(db as any, params.id)

        if (!updated) {
          throw new Error(`Conversation not found: ${params.id}`)
        }

        IPCLogger.info(
          DB_CHANNELS.STAR_CONVERSATION,
          `Conversation star toggled to ${updated.starred}`
        )

        return updated
      }),
      IPCErrorCode.RECORD_NOT_FOUND
    )
  )

  IPCLogger.info('conversation-handlers', 'All conversation IPC handlers registered')
}
