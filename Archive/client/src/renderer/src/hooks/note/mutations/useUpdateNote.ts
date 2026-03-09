import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { noteKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import type {
  GetNoteResponse,
  GetNotesResponse,
  UpdateNotePayload,
  UpdateNoteResponse,
} from '@/types/cloud/note'
import type {
  UpdateNoteRequest,
  UpdateNoteResponse as LocalUpdateNoteResponse,
} from '@/types/local/note'

type NoteDetailResponse = GetNoteResponse | undefined
type NoteListCache = GetNotesResponse | undefined

type UpdateNoteVariables = {
  id: string
  payload: UpdateNotePayload
}

type MutationContext = {
  listQueries: Array<[readonly unknown[], NoteListCache]>
  previousDetail: NoteDetailResponse
}

/**
 * Mutation hook for updating note metadata and content with optimistic cache updates.
 * Supports both Cloud and Private Mode.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient()
  const { mode } = useMode()

  return useMutation<UpdateNoteResponse, Error, UpdateNoteVariables, MutationContext>({
    mutationFn: async ({ id, payload }) => {
      if (mode === 'cloud') {
        // Cloud Mode: 调用 Hono RPC API
        const res = await honoClient.api.note[':id'].$put({ param: { id }, json: payload })

        if (!res.ok) {
          throw new Error(`Failed to update note: ${res.status}`)
        }

        return res.json()
      } else {
        // Private Mode: 调用 IPC
        const request: UpdateNoteRequest = {
          noteId: id,
          data: {
            title: payload.title,
            content: payload.content,
            starred: payload.starred,
          },
        }

        const result: LocalUpdateNoteResponse = await window.api.note.update(request)

        if (!result.success) {
          throw new Error(result.error || 'Failed to update note')
        }

        // 转换为 Cloud Mode 格式
        const localNote = result.data!
        return {
          note: {
            id: localNote.id,
            userId: 'local-user', // Private Mode 占位符
            title: localNote.title,
            content: localNote.content,
            starred: localNote.starred,
            createdAt: localNote.createdAt.toISOString(),
            updatedAt: localNote.updatedAt.toISOString(),
          },
        }
      }
    },
    onMutate: async ({ id, payload }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: noteKeys.lists(mode as 'cloud' | 'private') }),
        queryClient.cancelQueries({ queryKey: noteKeys.detail(id, mode as 'cloud' | 'private') }),
      ])

      const listQueries = queryClient.getQueriesData<NoteListCache>({
        queryKey: noteKeys.lists(mode as 'cloud' | 'private'),
      })

      const detailKey = noteKeys.detail(id, mode as 'cloud' | 'private')
      const previousDetail = queryClient.getQueryData<NoteDetailResponse>(detailKey)

      listQueries.forEach(([key, current]) => {
        const noteList = Array.isArray(current?.note) ? current.note : null
        if (!noteList) {
          return
        }
        queryClient.setQueryData(key, {
          ...current,
          note: noteList.map((item) => {
            if (item.id !== id) {
              return item
            }
            return {
              ...item,
              ...(payload.title !== undefined
                ? { title: payload.title }
                : {}),
              ...(payload.content !== undefined ? { content: payload.content } : {}),
              ...(payload.starred !== undefined ? { starred: payload.starred } : {}),
            }
          }),
        })
      })

      if (previousDetail) {
        queryClient.setQueryData(detailKey, (old: NoteDetailResponse) => {
          if (!old?.note) return old
          return {
            ...old,
            note: {
              ...old.note,
              title: payload.title !== undefined ? payload.title : old.note.title,
              content: payload.content !== undefined ? payload.content : old.note.content,
              starred: payload.starred !== undefined ? payload.starred : old.note.starred,
            },
          }
        })
      }

      return { listQueries, previousDetail } satisfies MutationContext
    },
    onError: (_error, variables, context) => {
      if (!context) return

      context.listQueries.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })

      if (context.previousDetail) {
        queryClient.setQueryData(noteKeys.detail(variables.id, mode as 'cloud' | 'private'), context.previousDetail)
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists(mode as 'cloud' | 'private') })
      queryClient.invalidateQueries({ queryKey: noteKeys.detail(variables.id, mode as 'cloud' | 'private') })
    },
  })
}
