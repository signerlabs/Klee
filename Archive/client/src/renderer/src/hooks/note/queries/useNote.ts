import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { useMode } from '@/contexts/ModeContext'
import { noteKeys } from '@/lib/queryKeys'
import type { GetNoteResponse as CloudGetNoteResponse } from '@/types/cloud/note'
import type { GetNoteResponse as LocalGetNoteResponse, LocalNote } from '@/types/local/note'

/**
 * 获取单个笔记详情的查询钩子（支持 Cloud/Private Mode）
 *
 * 功能:
 * - 自动缓存笔记详情数据
 * - 2 分钟内数据被认为是新鲜的（staleTime）
 * - 窗口获得焦点时自动刷新
 * - 网络重连时自动刷新
 * - Cloud Mode: 调用 Hono RPC API
 * - Private Mode: 调用 IPC (window.api.note.get)
 *
 * 使用示例:
 * ```tsx
 * const { data, isLoading, error } = useNote(noteId)
 *
 * if (isLoading) return <div>Loading...</div>
 * if (error) return <div>Error: {error.message}</div>
 * if (!data) return null
 *
 * return <div>{data.note.title}</div>
 * ```
 *
 * 返回值:
 * - data: { note: { id, title, content, starred } }
 * - isLoading: boolean - 首次加载状态
 * - isFetching: boolean - 包括后台重新获取
 * - error: Error | null - 错误对象
 */
export function useNote(noteId: string) {
  const { mode } = useMode()

  return useQuery({
    queryKey: noteKeys.detail(noteId, mode as 'cloud' | 'private'),
    queryFn: async (): Promise<CloudGetNoteResponse> => {
      if (mode === 'cloud') {
        // Cloud Mode: 调用 Hono RPC API
        const res = await honoClient.api.note[':id'].$get({
          param: { id: noteId },
        })

        if (!res.ok) {
          throw new Error(`Failed to fetch note by ID: ${res.status}`)
        }

        return res.json()
      } else {
        // Private Mode: 调用 IPC
        const result: LocalGetNoteResponse = await window.api.note.get({ noteId })

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch note')
        }

        if (!result.data) {
          throw new Error('Note not found')
        }

        // 转换为 Cloud Mode 格式以保持组件兼容性
        const localNote: LocalNote = result.data
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
    staleTime: 2 * 60 * 1000, // 列表数据更新较频繁，设置为 2 分钟陈旧时间
    enabled: !!noteId, // 只有当 noteId 存在时才启用查询
  })
}
