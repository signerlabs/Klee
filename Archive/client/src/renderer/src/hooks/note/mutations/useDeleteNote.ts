import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { noteKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import type { DeleteNoteResponse, GetNotesResponse } from '@/types/cloud/note'
import type { DeleteNoteResponse as LocalDeleteNoteResponse } from '@/types/local/note'

// 尝试获取 ChatContext，如果不在聊天页面则返回 null
function useChatContextOptional() {
  try {
    // 动态导入以避免循环依赖
    const { useChatContext } = require('@/contexts/ChatContext')
    return useChatContext()
  } catch {
    return null
  }
}

/**
 * 删除笔记的 mutation 钩子
 *
 * 功能:
 * - 处理删除请求
 * - 通过乐观更新提供即时 UI 反馈
 * - 自动失效相关查询以获取最新数据
 * - 支持 Cloud/Private Mode
 *
 * 使用示例:
 * ```tsx
 * const { mutate, isPending } = useDeleteNote()
 *
 * const handleDelete = (noteId: string) => {
 *   mutate(noteId)
 * }
 * ```
 */
export function useDeleteNote() {
  const queryClient = useQueryClient()
  const { mode } = useMode()
  const chatContext = useChatContextOptional()

  type MutationContext = {
    previousQueries: Array<[readonly unknown[], GetNotesResponse | undefined]>
  }

  return useMutation<DeleteNoteResponse, Error, string, MutationContext>({
    mutationFn: async (noteId: string) => {
      if (mode === 'cloud') {
        // Cloud Mode: 调用 Hono RPC API
        const res = await honoClient.api.note[':id'].$delete({ param: { id: noteId } })

        if (!res.ok) {
          throw new Error(`Failed to delete note: ${res.status}`)
        }

        return res.json()
      } else {
        // Private Mode: 调用 IPC
        const result: LocalDeleteNoteResponse = await window.api.note.delete({ noteId })

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete note')
        }

        // 返回 Cloud Mode 格式
        return { success: true }
      }
    },
    onMutate: async (noteId) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists(mode as 'cloud' | 'private') })

      const previousQueries = queryClient.getQueriesData<GetNotesResponse>({
        queryKey: noteKeys.lists(mode as 'cloud' | 'private'),
      })

      previousQueries.forEach(([key]) => {
        queryClient.setQueryData(key, (old: GetNotesResponse | undefined) => {
          if (!old?.note) return old
          return {
            ...old,
            note: old.note.filter((note) => note.id !== noteId),
          }
        })
      })

      return { previousQueries }
    },
    onError: (err, _noteId, context) => {
      context?.previousQueries?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      console.error('Failed to delete note:', err)
    },
    onSettled: (_data, _error, noteId) => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.lists(mode as 'cloud' | 'private') })

      // 🧹 清理当前聊天会话的笔记引用（仅在聊天页面内）
      if (chatContext) {
        const { selectedNoteIds, setSelectedNoteIds } = chatContext
        if (selectedNoteIds.includes(noteId)) {
          setSelectedNoteIds((prev: string[]) => prev.filter((id: string) => id !== noteId))
        }
      }
      // 注意：如果在侧边栏删除（无 ChatContext），会话加载时会自动验证并清理已删除的 ID
    },
  })
}
