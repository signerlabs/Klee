/**
 * 取消分享知识库 mutation 钩子
 * T009: 创建取消分享知识库 mutation 钩子模板
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys, marketplaceKeys } from '@/lib/queryKeys'

export function useUnshareKnowledgeBase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await honoClient.api.knowledgebase[':id'].share.$put({
        param: { id },
        json: { isPublic: false },
      })

      if (!res.ok) {
        const error: any = await res.json()
        throw new Error(error?.error || 'Failed to unshare knowledge base')
      }

      return res.json()
    },
    onSuccess: (data, variables) => {
      // 失效相关缓存（分享功能仅在 Cloud Mode 中可用）
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(variables, 'cloud') })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists('cloud') })
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all })
    },
  })
}
