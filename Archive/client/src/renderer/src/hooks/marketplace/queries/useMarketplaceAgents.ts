import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { marketplaceKeys } from '@/lib/queryKeys'

/**
 * T061: 获取市场公开 Agent 列表 (支持分页和搜索)
 */
export function useMarketplaceAgents(
  page: number = 1,
  search?: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: marketplaceKeys.agentsList({ page, search }),
    queryFn: async () => {
      const res = await honoClient.api.marketplace.agents.$get({
        query: {
          page: String(page),
          ...(search && { search }),
        },
      })

      if (!res.ok) {
        throw new Error('Failed to fetch marketplace agents')
      }

      return res.json()
    },
    staleTime: 2 * 60 * 1000, // 2 分钟缓存
    ...options, // 允许覆盖任何查询选项
  })
}
