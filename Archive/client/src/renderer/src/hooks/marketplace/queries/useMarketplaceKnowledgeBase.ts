import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { marketplaceKeys } from '@/lib/queryKeys'

/**
 * T064: 获取单个知识库详情 (通过 shareSlug)
 */
export function useMarketplaceKnowledgeBase(shareSlug: string | undefined) {
  return useQuery({
    queryKey: marketplaceKeys.knowledgeBaseDetail(shareSlug || ''),
    queryFn: async () => {
      if (!shareSlug) {
        throw new Error('Share slug is required')
      }

      const res = await honoClient.api.marketplace['knowledge-bases'][
        ':shareSlug'
      ].$get({
        param: { shareSlug },
      })

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Knowledge base not found')
        }
        throw new Error('Failed to fetch knowledge base details')
      }

      return res.json()
    },
    enabled: !!shareSlug,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  })
}
