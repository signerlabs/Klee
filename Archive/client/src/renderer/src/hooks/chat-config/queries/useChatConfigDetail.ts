import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys } from '@/lib/queryKeys'

/**
 * 获取单个 ChatConfig 的详情（包含关联的知识库）
 */
export function useChatConfigDetail(configId: string | undefined) {
  return useQuery({
    queryKey: chatConfigKeys.detail(configId || ''),
    queryFn: async () => {
      if (!configId) {
        throw new Error('Config ID is required')
      }

      const res = await honoClient.api['chat-configs'][':id'].$get({
        param: { id: configId },
      })

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Chat config not found')
        }
        throw new Error('Failed to fetch chat config details')
      }

      return res.json()
    },
    enabled: !!configId,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  })
}
