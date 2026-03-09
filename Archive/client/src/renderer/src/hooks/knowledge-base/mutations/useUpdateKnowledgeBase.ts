import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'
import { InferRequestType } from 'hono'
import { useMode } from '@/contexts/ModeContext'

export function useUpdateKnowledgeBase() {
  const queryClient = useQueryClient()
  const { mode } = useMode()

  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string
      payload: InferRequestType<(typeof honoClient.api.knowledgebase)[':id']['$put']>['json']
    }) => {
      if (mode === 'private') {
        // Private Mode: 使用 IPC
        const result = await window.api.knowledgeBase.update(id, payload)
        return result
      }

      // Cloud Mode: 使用 Hono RPC
      const res = await honoClient.api.knowledgebase[':id'].$put({
        param: { id },
        json: payload,
      })

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({ error: 'Unknown error' }))) as {
          error?: string
        }
        throw new Error(errorData.error || `Failed to update knowledge base: ${res.status}`)
      }

      return res.json()
    },

    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.detail(id, mode) })
      await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.lists(mode) })

      const previousDetail = queryClient.getQueryData(knowledgeBaseKeys.detail(id, mode))
      const previousList = queryClient.getQueryData(knowledgeBaseKeys.lists(mode))

      queryClient.setQueryData(knowledgeBaseKeys.detail(id, mode), (old: any) => {
        if (!old?.knowledgeBase) return old
        return {
          ...old,
          knowledgeBase: {
            ...old.knowledgeBase,
            ...payload,
          },
        }
      })

      queryClient.setQueryData(knowledgeBaseKeys.lists(mode), (old: any) => {
        if (!old?.knowledgeBases) return old
        return {
          ...old,
          knowledgeBases: old.knowledgeBases.map((kb: any) =>
            kb.id === id ? { ...kb, ...payload } : kb
          ),
        }
      })

      return { previousDetail, previousList }
    },

    onError: (err, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(knowledgeBaseKeys.detail(id, mode), context.previousDetail)
      }
      if (context?.previousList) {
        queryClient.setQueryData(knowledgeBaseKeys.lists(mode), context.previousList)
      }
    },

    onSettled: (data, error, { id }) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(id, mode) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists(mode) })
    },
  })
}
