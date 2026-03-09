// useChatConfigs query hook
// 用于获取用户的所有 ChatConfig (Agent) 列表

import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import type { InferResponseType } from 'hono/client'

// 从 Hono RPC 推断响应类型
type ResponseType = InferResponseType<typeof honoClient.api['chat-configs']['$get']>

/**
 * 获取用户的 ChatConfig 列表（仅 Cloud Mode）
 * 包含所有配置的基本信息
 * Private Mode: 查询被禁用
 */
export function useChatConfigs() {
  const { mode } = useMode()

  return useQuery({
    queryKey: chatConfigKeys.lists(),
    queryFn: async () => {
      const res = await honoClient.api['chat-configs'].$get()

      if (!res.ok) {
        throw new Error('Failed to fetch chat configs')
      }

      return (await res.json()) as ResponseType
    },
    staleTime: 2 * 60 * 1000, // 2 分钟陈旧时间
    // 仅在 Cloud Mode 下启用查询
    enabled: mode === 'cloud',
  })
}
