import { useMutation } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { useMode } from '@/contexts/ModeContext'
import type { EmbedNoteResponse as CloudEmbedNoteResponse } from '@/types/cloud/note'
import type { EmbedNoteResponse as PrivateEmbedNoteResponse } from '@/types/local/note'
import { useEffect } from 'react'

/**
 * 笔记嵌入 mutation 钩子（用于 RAG 检索）
 *
 * 功能:
 * - 处理笔记内容的向量化（支持 Cloud 和 Private Mode）
 * - 无需乐观更新，因为不会影响笔记列表
 * - 成功后无需失效缓存
 * - Private Mode: 支持 IPC 进度监听
 *
 * 使用示例:
 * ```tsx
 * const { mutate, isPending } = useEmbedNote()
 *
 * const handleEmbed = (noteId: string) => {
 *   mutate(noteId)
 * }
 * ```
 */
export function useEmbedNote() {
  const { mode } = useMode()

  // Private Mode: 监听 embedding 进度事件
  useEffect(() => {
    if (mode === 'private' && window.api?.note) {
      const removeProgressListener = window.api.note.onEmbeddingProgress?.((event) => {
        console.log(`[useEmbedNote] Progress: ${event.percent}% - ${event.message}`)
      })

      const removeCompleteListener = window.api.note.onEmbeddingComplete?.((event) => {
        console.log(`[useEmbedNote] Embedding complete: ${event.chunksCount} chunks`)
      })

      const removeFailedListener = window.api.note.onEmbeddingFailed?.((event) => {
        console.error(`[useEmbedNote] Embedding failed: ${event.error}`)
      })

      return () => {
        removeProgressListener?.()
        removeCompleteListener?.()
        removeFailedListener?.()
      }
    }
  }, [mode])

  return useMutation<
    CloudEmbedNoteResponse | PrivateEmbedNoteResponse,
    Error,
    string
  >({
    mutationFn: async (noteId: string) => {
      if (mode === 'cloud') {
        // Cloud Mode: 调用 Hono API
        const res = await honoClient.api.note[':id'].embed.$post({
          param: { id: noteId },
        })
        if (!res.ok) {
          throw new Error(`Failed to embed note: ${res.status}`)
        }
        return res.json()
      } else {
        // Private Mode: 调用 IPC
        const result = await window.api.note.embed({ noteId })
        if (!result.success) {
          throw new Error(result.error || 'Failed to embed note')
        }
        return result
      }
    },
    onSuccess: () => {
      // 向量化不会改变笔记元数据，无需刷新列表
    },
    onError: (err) => {
      console.error('Failed to embed note:', err)
    },
  })
}