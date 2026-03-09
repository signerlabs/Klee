/**
 * Cloud Mode - 聊天相关类型
 *
 * 所有类型均从 Hono RPC 自动推断
 */

import type { InferResponseType, InferRequestType } from 'hono/client'
import type { honoClient } from '@/lib/hono-client'

/**
 * 获取会话详情响应类型
 * 从 GET /api/chat/:id 推断
 */
export type GetConversationResponse = InferResponseType<
  (typeof honoClient.api.chat)[':id']['$get'],
  200
>

/**
 * 获取会话列表响应类型
 * 从 GET /api/chat 推断
 */
export type GetConversationsResponse = InferResponseType<
  (typeof honoClient.api.chat)['$get'],
  200
>

/**
 * 创建会话请求类型
 * 从 POST /api/chat/create 推断
 */
export type CreateConversationPayload = InferRequestType<
  typeof honoClient.api.chat.create['$post']
>['json']

/**
 * 更新会话请求类型
 * 从 PUT /api/chat/:id 推断
 */
export type UpdateConversationPayload = InferRequestType<
  typeof honoClient.api.chat[':id']['$put']
>['json']

/**
 * 获取聊天配置列表响应类型
 * 从 GET /api/chat-configs 推断
 */
export type GetChatConfigsResponse = InferResponseType<
  typeof honoClient.api['chat-configs']['$get'],
  200
>

/**
 * 创建聊天配置请求类型
 * 从 POST /api/chat-configs 推断
 */
export type CreateChatConfigPayload = InferRequestType<
  typeof honoClient.api['chat-configs']['$post']
>['json']

/**
 * 更新聊天配置请求类型
 * 从 PUT /api/chat-configs/:id 推断
 */
export type UpdateChatConfigPayload = InferRequestType<
  typeof honoClient.api['chat-configs'][':id']['$put']
>['json']

/**
 * 设置配置知识库请求类型
 * 从 PUT /api/chat-configs/:id/knowledge-bases 推断
 */
export type SetConfigKnowledgeBasesPayload = InferRequestType<
  typeof honoClient.api['chat-configs'][':id']['knowledge-bases']['$put']
>['json']

/**
 * 聊天配置类型
 * 注意：服务器返回 'configs' 字段
 */
export type ChatConfig = GetChatConfigsResponse['configs'][number]

/**
 * 会话类型
 * 注意：服务器返回 'chats' 字段
 */
export type Conversation = GetConversationsResponse['chats'][number]
