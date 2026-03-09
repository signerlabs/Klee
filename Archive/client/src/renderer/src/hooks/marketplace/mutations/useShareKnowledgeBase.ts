import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys, marketplaceKeys } from '@/lib/queryKeys'

/**
 * T035: 分享或取消分享知识库到市场
 */
export function useShareKnowledgeBase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isPublic }: { id: string; isPublic: boolean }) => {
      const res = await honoClient.api.knowledgebase[':id'].share.$put({
        param: { id },
        json: { isPublic },
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(
          ('error' in error ? error.error : 'Failed to share knowledge base') ||
            'Failed to share knowledge base'
        )
      }

      const result = await res.json()
      if ('error' in result && typeof result.error === 'string') {
        throw new Error(result.error)
      }

      return result
    },
    // T037: 分享成功后失效缓存
    onSuccess: (data, variables) => {
      // 失效知识库列表缓存（分享功能仅在 Cloud Mode 中可用）
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists('cloud') })

      // 失效市场知识库列表缓存（如果已加载）
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.knowledgeBases() })

      // 失效特定知识库详情缓存
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(variables.id, 'cloud') })
    },
    onError: (error) => {
      console.error('Failed to share knowledge base:', error)
    },
  })
}
