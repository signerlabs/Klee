import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys } from '@/lib/queryKeys'

/**
 * T044: 安装 Agent mutation hook
 */
export function useInstallAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (shareSlug: string) => {
      const res = await honoClient.api['chat-configs'].install.$post({
        json: { shareSlug },
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(
          ('error' in error ? error.error : 'Failed to install agent') ||
            'Failed to install agent'
        )
      }

      const result = await res.json()
      if ('error' in result && typeof result.error === 'string') {
        throw new Error(result.error)
      }

      return result
    },
    // T048: 安装成功后失效缓存
    onSuccess: () => {
      // 失效用户 ChatConfig 列表缓存
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })
    },
    onError: (error) => {
      console.error('Failed to install agent:', error)
    },
  })
}
