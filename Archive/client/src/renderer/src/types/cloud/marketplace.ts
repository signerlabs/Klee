/**
 * Cloud Mode - 市场相关类型
 *
 * 所有类型均从 Hono RPC 自动推断
 */

import type { InferRequestType, InferResponseType } from 'hono/client'
import type { honoClient } from '@/lib/hono-client'

/**
 * 获取公开 Agent 列表响应类型
 * 从 GET /api/marketplace/agents 推断
 */
export type GetMarketplaceAgentsResponse = InferResponseType<
  typeof honoClient.api.marketplace.agents['$get'],
  200
>

/**
 * 获取 Agent 详情响应类型
 * 从 GET /api/marketplace/agents/:shareSlug 推断
 */
export type GetMarketplaceAgentResponse = InferResponseType<
  typeof honoClient.api.marketplace.agents[':shareSlug']['$get'],
  200
>

/**
 * Marketplace Agent 类型
 */
export type MarketplaceAgent = GetMarketplaceAgentsResponse['agents'][number]
