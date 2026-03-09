import { useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { honoClient } from '@/lib/hono-client'
import { noteKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import type {
  CreateNotePayload,
  CreateNoteResponse,
  GetNotesResponse,
} from '@/types/cloud/note'
import type {
  CreateNoteRequest,
  CreateNoteResponse as LocalCreateNoteResponse,
} from '@/types/local/note'

type NoteListCache = GetNotesResponse | undefined

type MutationContext = Array<[readonly unknown[], NoteListCache]>

/**
 * Mutation hook used to create notes with an optimistic list update.
 * Supports both Cloud and Private Mode.
 */
export function useCreateNote() {
  const queryClient = useQueryClient()
  const { mode } = useMode()

  return useMutation<CreateNoteResponse, Error, CreateNotePayload, MutationContext>({
    mutationFn: async (payload: CreateNotePayload) => {
      if (mode === 'cloud') {
        // Cloud Mode: 调用 Hono RPC API
        const res = await honoClient.api.note.$post({ json: payload })

        if (!res.ok) {
          throw new Error(`Failed to create note: ${res.status}`)
        }

        return res.json()
      } else {
        // Private Mode: 调用 IPC
        const noteId = uuidv4()
        const request: CreateNoteRequest = {
          title: payload.title ?? 'Untitled note',
          content: payload.content ?? '',
        }

        const result: LocalCreateNoteResponse = await window.api.note.create({
          id: noteId,
          ...request,
        })

        if (!result.success) {
          throw new Error(result.error || 'Failed to create note')
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
    onMutate: async (newNote) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists(mode as 'cloud' | 'private') })

      const previousQueries = queryClient.getQueriesData<NoteListCache>({
        queryKey: noteKeys.lists(mode as 'cloud' | 'private'),
      })

      const tempId = `temp-${Date.now()}`

      previousQueries.forEach(([key, current]) => {
        const noteList = Array.isArray(current?.note) ? current.note : null
        if (!noteList) {
          return
        }
        const now = new Date().toISOString()
        const optimisticNote = {
          id: tempId,
          title: newNote.title ?? 'Untitled note',
          content: newNote.content ?? '',
          starred: false,
          createdAt: now,
          updatedAt: now,
        } as GetNotesResponse['note'][number]
        queryClient.setQueryData(key, {
          ...current,
          note: [optimisticNote, ...noteList],
        })
      })

      return previousQueries
    },
    onError: (_error: Error, _variables: CreateNotePayload, context: MutationContext | undefined) => {
      context?.forEach(([key, data]: [readonly unknown[], NoteListCache]) => {
        queryClient.setQueryData(key, data)
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists(mode as 'cloud' | 'private') })
    },
  })
}
