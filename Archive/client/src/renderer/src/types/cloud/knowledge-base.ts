/**
 * Cloud Mode - 知识库相关类型
 *
 * 所有类型均从 Hono RPC 自动推断，确保类型安全和单一数据源
 */

import type { InferResponseType, InferRequestType } from 'hono/client'
import type { honoClient } from '@/lib/hono-client'

/**
 * 知识库详情响应类型（包含文件列表）
 * 从 GET /api/knowledgebase/:id 推断
 */
export type GetKnowledgeBaseResponse = InferResponseType<
  (typeof honoClient.api.knowledgebase)[':id']['$get'],
  200
>

/**
 * 知识库列表响应类型
 * 从 GET /api/knowledgebase 推断
 */
export type GetKnowledgeBasesResponse = InferResponseType<
  (typeof honoClient.api.knowledgebase)['$get'],
  200
>

/**
 * 知识库列表项类型
 */
export type KnowledgeBaseListItem = GetKnowledgeBasesResponse['knowledgeBases'][number]

/**
 * 知识库详情类型
 */
export type KnowledgeBase = GetKnowledgeBaseResponse['knowledgeBase']

/**
 * 知识库文件类型
 */
export type KnowledgeBaseFile = GetKnowledgeBaseResponse['files'][number]

/**
 * 创建知识库的请求参数类型
 * 从 POST /api/knowledgebase 推断
 */
export type CreateKnowledgeBasePayload = InferRequestType<
  (typeof honoClient.api.knowledgebase)['$post']
>['json']

/**
 * 更新知识库的请求参数类型
 * 从 PUT /api/knowledgebase/:id 推断
 */
export type UpdateKnowledgeBasePayload = InferRequestType<
  (typeof honoClient.api.knowledgebase)[':id']['$put']
>['json']

/**
 * 知识库表单验证错误类型
 */
export type KnowledgeBaseFormErrors = Partial<Record<keyof UpdateKnowledgeBasePayload, string>>

/**
 * 知识库创建表单验证错误类型
 */
export type CreateKnowledgeBaseFormErrors = Partial<
  Record<keyof CreateKnowledgeBasePayload, string>
>
