import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { marketplaceKeys } from '@/lib/queryKeys'

/**
 * T062: 获取市场公开知识库列表 (支持分页和搜索)
 */
export function useMarketplaceKnowledgeBases(
  page: number = 1,
  search?: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: marketplaceKeys.knowledgeBasesList({ page, search }),
    queryFn: async () => {
      const res = await honoClient.api.marketplace['knowledge-bases'].$get({
        query: {
          page: String(page),
          ...(search && { search }),
        },
      })

      if (!res.ok) {
        throw new Error('Failed to fetch marketplace knowledge bases')
      }

      return res.json()
    },
    staleTime: 2 * 60 * 1000, // 2 分钟缓存
    ...options, // 允许覆盖任何查询选项
  })
}
