import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import { ipcAPI } from '@/lib/ipc-helpers'

/**
 * 删除会话的变更钩子
 *
 * 特性:
 * - 类型安全：通过 Hono RPC 自动推导请求和响应类型
 * - 自动缓存清理：删除成功后移除详情缓存并失效列表缓存
 * - 自动导航：删除成功后导航回聊天列表页
 * - 错误处理：删除失败时提供错误信息
 * - 支持 Cloud/Private Mode
 *
 * @returns TanStack Mutation 结果
 *
 * @example
 * ```tsx
 * function DeleteChatButton({ chatId }: { chatId: string }) {
 *   const deleteMutation = useDeleteConversation()
 *
 *   const handleDelete = () => {
 *     deleteMutation.mutate(chatId, {
 *       onSuccess: () => toast.success('Chat deleted'),
 *       onError: (error) => toast.error(error.message),
 *     })
 *   }
 *
 *   return (
 *     <button onClick={handleDelete} disabled={deleteMutation.isPending}>
 *       {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { mode } = useMode()

  return useMutation({
    mutationFn: async (chatId: string) => {
      if (mode === 'cloud') {
        // Cloud Mode: 调用 Hono API
        const res = await honoClient.api.chat[':id'].$delete({ param: { id: chatId } })
        if (!res.ok) throw new Error('Failed to delete chat')
        return res.json()
      } else {
        // Private Mode: 调用 IPC
        await ipcAPI.deleteConversation(chatId)
        return { success: true }
      }
    },
    onSuccess: (data, chatId) => {
      // 失效会话列表缓存
      if (mode === 'cloud') {
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
        queryClient.removeQueries({ queryKey: conversationKeys.detail(chatId) })
      } else {
        // Private Mode: 使用本地查询键
        queryClient.invalidateQueries({ queryKey: ['local-conversations'] })
        queryClient.removeQueries({ queryKey: ['local-conversation', chatId] })
      }

      // 导航回会话列表
      router.navigate({ to: '/chat' })
    },
  })
}
