import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'

export function useKnowledgeBases() {
  const { mode } = useMode()

  return useQuery({
    queryKey: knowledgeBaseKeys.lists(mode),
    queryFn: async () => {
      if (mode === 'cloud') {
        const res = await honoClient.api.knowledgebase.$get()

        if (!res.ok) {
          throw new Error(`Failed to fetch knowledge bases: ${res.status}`)
        }

        return res.json()
      } else {
        const response = await window.api.knowledgeBase.list()
        if (!response.success) {
          throw new Error('Failed to fetch knowledge bases from IPC')
        }
        return response.data
      }
    },
    staleTime: 2 * 60 * 1000,
  })
}
