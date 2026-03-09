import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { marketplaceKeys } from '@/lib/queryKeys'

/**
 * T063: 获取单个 Agent 详情 (通过 shareSlug)
 */
export function useMarketplaceAgent(shareSlug: string | undefined) {
  return useQuery({
    queryKey: marketplaceKeys.agentDetail(shareSlug || ''),
    queryFn: async () => {
      if (!shareSlug) {
        throw new Error('Share slug is required')
      }

      const res = await honoClient.api.marketplace.agents[':shareSlug'].$get({
        param: { shareSlug },
      })

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Agent not found')
        }
        throw new Error('Failed to fetch agent details')
      }

      return res.json()
    },
    enabled: !!shareSlug,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  })
}
