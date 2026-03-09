import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'

export function useKnowledgeBase(knowledgeBaseId: string) {
  const { mode } = useMode()

  return useQuery({
    queryKey: knowledgeBaseKeys.detail(knowledgeBaseId, mode),
    queryFn: async () => {
      // Cloud Mode: 使用 Hono RPC
      if (mode === 'cloud') {
        const res = await honoClient.api.knowledgebase[':id'].$get({
          param: { id: knowledgeBaseId },
        })

        if (!res.ok) {
          throw new Error(`Failed to fetch knowledge base: ${res.status}`)
        }

        return res.json()
      } else {
        // Private Mode: 使用 IPC
        if (!window.api?.knowledgeBase) {
          throw new Error('IPC API not ready yet')
        }

        const response = await window.api.knowledgeBase.get(knowledgeBaseId)
        return response.success ? response.data : null
      }
    },
    enabled: !!knowledgeBaseId,
  })
}
