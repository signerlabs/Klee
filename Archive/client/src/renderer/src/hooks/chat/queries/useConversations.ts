import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'

export function useConversations() {
  const { mode } = useMode()

  return useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: async () => {
      const res = await honoClient.api.chat.$get()
      if (!res.ok) throw new Error('Failed to fetch chats')
      return res.json()
    },
    staleTime: 2 * 60 * 1000, // 2 分钟陈旧时间（比全局默认短，因为会话列表变化频繁）
    // 仅在 Cloud Mode 下启用查询
    enabled: mode === 'cloud',
  })
}
