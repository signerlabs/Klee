/**
 * 取消分享 Agent mutation 钩子
 * T010: 创建取消分享 Agent mutation 钩子模板
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys, marketplaceKeys } from '@/lib/queryKeys'

export function useUnshareChatConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await honoClient.api['chat-configs'][':id'].share.$put({
        param: { id },
        json: { isPublic: false },
      })

      if (!res.ok) {
        const error: any = await res.json()
        throw new Error(error?.error || 'Failed to unshare agent')
      }

      return res.json()
    },
    onSuccess: (data, variables) => {
      // 失效相关缓存
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.detail(variables) })
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all })
    },
  })
}
