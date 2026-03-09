// useShareAgent mutation hook
// 用于分享或取消分享 Agent 到市场

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys, marketplaceKeys } from '@/lib/queryKeys'
import type { InferRequestType, InferResponseType } from 'hono/client'

// 从 Hono RPC 推断类型
type RequestType = InferRequestType<
  typeof honoClient.api['chat-configs'][':id']['share']['$put']
>
type ResponseType = InferResponseType<
  typeof honoClient.api['chat-configs'][':id']['share']['$put']
>

/**
 * 分享 Agent mutation hook
 * 支持分享和取消分享
 */
export function useShareAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isPublic }: { id: string; isPublic: boolean }) => {
      const res = await honoClient.api['chat-configs'][':id']['share'].$put({
        param: { id },
        json: { isPublic },
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as any).error || 'Failed to share agent')
      }

      return (await res.json()) as ResponseType
    },

    // 成功后失效相关缓存
    onSuccess: (data, variables) => {
      // 失效 ChatConfig 列表缓存
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })

      // 失效 ChatConfig 详情缓存
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.detail(variables.id) })

      // 如果是分享操作,失效市场 Agents 列表缓存
      if (variables.isPublic) {
        queryClient.invalidateQueries({ queryKey: marketplaceKeys.agents() })
      }
    },

    onError: (error) => {
      console.error('Error sharing agent:', error)
    },
  })
}
