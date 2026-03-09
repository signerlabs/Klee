import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { noteKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import type { GetNotesResponse as CloudGetNotesResponse } from '@/types/cloud/note'
import type { GetNotesResponse as LocalGetNotesResponse, LocalNote } from '@/types/local/note'
export type { NoteListItem } from '@/types/cloud/note'

/**
 * 获取笔记列表的查询钩子（支持 Cloud/Private Mode）
 *
 * 功能:
 * - 自动缓存笔记列表数据
 * - 2 分钟内数据被认为是新鲜的（staleTime）
 * - 窗口获得焦点时自动刷新
 * - 网络重连时自动刷新
 * - Cloud Mode: 调用 Hono RPC API
 * - Private Mode: 调用 IPC (window.api.note.list)
 *
 * 使用示例:
 * ```tsx
 * const { data, isLoading, error } = useNotes()
 *
 * if (isLoading) return <div>Loading...</div>
 * if (error) return <div>Error: {error.message}</div>
 * if (!data) return null
 *
 * return data.note.map(note => <div key={note.id}>{note.title}</div>)
 * ```
 *
 * 返回值:
 * - data: { note: Array<{ id, title, starred }> }
 * - isLoading: boolean - 首次加载状态
 * - isFetching: boolean - 包括后台重新获取
 * - error: Error | null - 错误对象
 * - refetch: () => void - 手动重新获取函数
 */
export function useNotes(
  params: { page?: number; pageSize?: number } = { page: 1, pageSize: 20 },
  options?: UseQueryOptions<CloudGetNotesResponse>
) {
  const { mode } = useMode()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20

  return useQuery({
    queryKey: [...noteKeys.lists(mode as 'cloud' | 'private'), page, pageSize],
    queryFn: async (): Promise<CloudGetNotesResponse> => {
      if (mode === 'cloud') {
        // Cloud Mode: 调用 Hono RPC API
        const res = await honoClient.api.note.$get({
          query: {
            page: page.toString(),
            pageSize: pageSize.toString(),
          },
        })

        if (!res.ok) {
          throw new Error(`Failed to fetch notes: ${res.status}`)
        }

        return res.json()
      } else {
        // Private Mode: 调用 IPC
        const result: LocalGetNotesResponse = await window.api.note.list()

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch notes')
        }

        // 转换为 Cloud Mode 格式以保持组件兼容性
        const notes = (result.data || []).map((localNote: LocalNote) => ({
          id: localNote.id,
          title: localNote.title,
          content: localNote.content,
          starred: localNote.starred,
          createdAt: localNote.createdAt.toISOString(),
          updatedAt: localNote.updatedAt.toISOString(),
        }))

        return {
          note: notes,
          pagination: {
            total: notes.length,
            page: 1,
            pageSize: notes.length,
            totalPages: 1,
          },
        }
      }
    },
    /**
     * 列表数据更新较频繁，设置为 2 分钟陈旧时间
     * 覆盖全局默认的 5 分钟
     */
    staleTime: 2 * 60 * 1000,
    ...options,
  })
}
