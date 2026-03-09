import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys } from '@/lib/queryKeys'

/**
 * T045: 检查 Agent 是否已安装 query hook
 */
export function useCheckAgentInstalled(shareSlug: string | undefined) {
  return useQuery({
    queryKey: [...chatConfigKeys.all, 'installed', shareSlug],
    queryFn: async () => {
      if (!shareSlug) {
        return { isInstalled: false, isOwner: false }
      }

      const res = await honoClient.api['chat-configs']['check-installed'][
        ':shareSlug'
      ].$get({
        param: { shareSlug },
      })

      if (!res.ok) {
        throw new Error('Failed to check installation status')
      }

      return res.json()
    },
    enabled: !!shareSlug,
    staleTime: 30 * 1000,
  })
}
