// useCreateAgentFromChat mutation hook
// 用于从 Chat 会话创建 Agent (ChatConfig)

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys, marketplaceKeys } from '@/lib/queryKeys'
import type { InferRequestType, InferResponseType } from 'hono/client'

// 从 Hono RPC 推断类型
type RequestType = InferRequestType<typeof honoClient.api['chat-configs']['$post']>['json']
type ResponseType = InferResponseType<typeof honoClient.api['chat-configs']['$post']>

/**
 * 创建 Agent mutation hook
 * 支持从 Chat 会话预填充配置或独立创建
 */
export function useCreateAgentFromChat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: RequestType) => {
      const res = await honoClient.api['chat-configs'].$post({
        json: data,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as any).error || 'Failed to create agent')
      }

      return (await res.json()) as ResponseType
    },

    // 成功后失效相关缓存
    onSuccess: (data, variables) => {
      // 1. 失效 ChatConfig 列表缓存（已有的逻辑）
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })

      // 2. 如果创建的是公开 Agent（isPublic=true），失效市场列表缓存
      if (variables.isPublic) {
        queryClient.invalidateQueries({ queryKey: marketplaceKeys.agents() })
      }

      // 3. 不需要失效知识库缓存
      // 原因：创建 Agent 不会修改知识库数据，只是引用它们
      // Chat 页面使用的知识库列表（useKnowledgeBases）数据没有变化
      // 知识库的关联关系存储在 chat_config_knowledge_bases 表中
      // 这个关系数据会在查询 ChatConfig 详情时获取，而不是在知识库列表中
    },

    onError: (error) => {
      console.error('Error creating agent:', error)
    },
  })
}
