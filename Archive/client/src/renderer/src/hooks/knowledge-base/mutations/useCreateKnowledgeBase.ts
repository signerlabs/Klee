import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import type { CreateKnowledgeBasePayload } from '@/types'

export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient()
  const { mode } = useMode()

  return useMutation({
    mutationFn: async (payload: CreateKnowledgeBasePayload) => {
      if (mode === 'cloud') {
        const res = await honoClient.api.knowledgebase.$post({ json: payload })

        if (!res.ok) {
          const errorData = (await res.json().catch(() => ({ error: 'Unknown error' }))) as {
            error?: string
          }
          throw new Error(errorData.error || `Failed to create knowledge base: ${res.status}`)
        }

        return res.json()
      } else {
        const privatePayload: CreateKnowledgeBaseInput = {
          name: payload.name,
          description: payload.description || undefined,
        }
        const response = await window.api.knowledgeBase.create(privatePayload)
        return response.success ? response.data : null
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists(mode) })
    },
  })
}
