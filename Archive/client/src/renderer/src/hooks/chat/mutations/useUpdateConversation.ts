import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import { ipcAPI } from '@/lib/ipc-helpers'
import type { InferRequestType } from 'hono/client'

/**
 * 更新会话的变更钩子
 *
 * 特性:
 * - 类型安全：通过 Hono RPC 自动推导请求和响应类型
 * - 乐观更新：立即更新 UI（<16ms），失败时自动回滚
 * - 自动缓存失效：成功后失效会话详情和列表缓存
 * - 错误处理：失败时回滚并提供错误信息
 * - 性能优化：并行取消查询，高效数组更新
 *
 * 乐观更新流程:
 * 1. onMutate: 立即更新 UI 缓存，保存旧值用于回滚
 * 2. mutationFn: 发送 API 请求
 * 3a. 成功: onSettled 失效缓存，获取服务器最新数据
 * 3b. 失败: onError 自动回滚到旧值，显示错误提示
 *
 * 测试回滚机制:
 * 1. 打开浏览器开发者工具 Network 选项卡
 * 2. 将网络设置为 "Offline" 模式
 * 3. 点击星标按钮，观察 UI 立即更新
 * 4. 等待请求失败后，观察 UI 自动回滚到原始状态
 * 5. 查看错误提示消息
 *
 * @returns TanStack Mutation 结果
 *
 * @example
 * ```tsx
 * function ChatItem({ chatId, starred }: { chatId: string; starred: boolean }) {
 *   const updateMutation = useUpdateConversation()
 *
 *   const handleToggleStar = () => {
 *     updateMutation.mutate(
 *       { id: chatId, data: { starred: !starred } },
 *       {
 *         onSuccess: () => toast.success('Updated'),
 *         onError: (error) => toast.error(error.message),
 *       }
 *     )
 *   }
 *
 *   return (
 *     <button onClick={handleToggleStar} disabled={updateMutation.isPending}>
 *       {starred ? 'Unstar' : 'Star'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useUpdateConversation() {
  const queryClient = useQueryClient()
  const { mode } = useMode()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: InferRequestType<typeof honoClient.api.chat[':id']['$put']>['json'] | { title?: string; starred?: boolean }
    }) => {
      if (mode === 'cloud') {
        // Cloud Mode: 调用 Hono API
        const res = await honoClient.api.chat[':id'].$put({
          param: { id },
          json: data,
        })
        if (!res.ok) throw new Error('Failed to update chat')
        return res.json()
      } else {
        // Private Mode: 调用 IPC
        const result = await ipcAPI.updateConversation(id, data)
        return { chat: result }
      }
    },

    // 乐观更新：立即更新 UI
    // 性能优化：使用同步的 cancelQueries 和高效的数据更新
    onMutate: async ({ id, data }) => {
      if (mode === 'cloud') {
        // Cloud Mode: 使用 Cloud 查询键
        await Promise.all([
          queryClient.cancelQueries({ queryKey: conversationKeys.detail(id) }),
          queryClient.cancelQueries({ queryKey: conversationKeys.lists() }),
        ])

        const previousDetail = queryClient.getQueryData(conversationKeys.detail(id))
        const previousList = queryClient.getQueryData(conversationKeys.lists())

        if (previousDetail) {
          queryClient.setQueryData(conversationKeys.detail(id), (old: any) => ({
            ...old,
            chat: { ...old.chat, ...data },
          }))
        }

        if (previousList) {
          queryClient.setQueryData(conversationKeys.lists(), (old: any) => {
            const chatIndex = old.chats.findIndex((chat: any) => chat.id === id)
            if (chatIndex === -1) return old
            const newChats = [...old.chats]
            newChats[chatIndex] = { ...newChats[chatIndex], ...data }
            return { ...old, chats: newChats }
          })
        }

        return { previousDetail, previousList }
      } else {
        // Private Mode: 使用本地查询键
        await Promise.all([
          queryClient.cancelQueries({ queryKey: ['local-conversation', id] }),
          queryClient.cancelQueries({ queryKey: ['local-conversations'] }),
        ])

        const previousDetail = queryClient.getQueryData(['local-conversation', id])
        const previousList = queryClient.getQueryData(['local-conversations'])

        if (previousList) {
          queryClient.setQueryData(['local-conversations'], (old: any) => {
            if (!Array.isArray(old)) return old
            return old.map((chat: any) =>
              chat.id === id ? { ...chat, ...data } : chat
            )
          })
        }

        return { previousDetail, previousList }
      }
    },

    // 失败时回滚
    onError: (_err, variables, context) => {
      if (mode === 'cloud') {
        if (context?.previousDetail) {
          queryClient.setQueryData(conversationKeys.detail(variables.id), context.previousDetail)
        }
        if (context?.previousList) {
          queryClient.setQueryData(conversationKeys.lists(), context.previousList)
        }
      } else {
        if (context?.previousDetail) {
          queryClient.setQueryData(['local-conversation', variables.id], context.previousDetail)
        }
        if (context?.previousList) {
          queryClient.setQueryData(['local-conversations'], context.previousList)
        }
      }
    },

    // 成功后失效缓存（获取最新数据）
    onSettled: (_data, _error, variables) => {
      if (mode === 'cloud') {
        queryClient.invalidateQueries({ queryKey: conversationKeys.detail(variables.id) })
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
      } else {
        queryClient.invalidateQueries({ queryKey: ['local-conversation', variables.id] })
        queryClient.invalidateQueries({ queryKey: ['local-conversations'] })
      }
    },
  })
}
