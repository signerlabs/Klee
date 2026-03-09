import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'
import type { InferRequestType } from 'hono/client'

/**
 * 创建新的聊天会话变更钩子
 *
 * 特性:
 * - 类型安全：通过 Hono RPC 自动推导请求和响应类型
 * - 自动缓存失效：创建成功后失效会话列表缓存
 * - 自动导航：创建成功后导航到新会话详情页
 * - 错误处理：失败时抛出错误，由调用方处理
 *
 * @returns TanStack Mutation 结果，包含：
 * - mutate: 触发创建操作的函数
 * - isPending: 创建操作进行中状态
 * - error: 错误信息
 * - data: 创建成功后的响应数据
 *
 * @example
 * ```tsx
 * function NewChatButton() {
 *   const createMutation = useCreateConversation()
 *
 *   const handleCreate = () => {
 *     createMutation.mutate(
 *       {
 *         id: generateUUID(),
 *         message: {
 *           id: generateUUID(),
 *           role: 'user',
 *           parts: [{ type: 'text', text: 'Hello' }],
 *         },
 *         model: 'qwen3-30b-a3b-instruct-2507',
 *       },
 *       {
 *         onSuccess: () => toast.success('Chat created'),
 *         onError: (error) => toast.error(error.message),
 *       }
 *     )
 *   }
 *
 *   return (
 *     <button onClick={handleCreate} disabled={createMutation.isPending}>
 *       {createMutation.isPending ? 'Creating...' : 'New Chat'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useCreateConversation() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (
      payload: InferRequestType<typeof honoClient.api.chat.create['$post']>['json']
    ) => {
      const res = await honoClient.api.chat.create.$post({ json: payload })
      if (!res.ok) throw new Error('Failed to create chat session')
      return res.json()
    },
    onSuccess: (data) => {
      // 失效会话列表缓存，触发列表重新获取
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })

      // 导航到新创建的会话详情页
      router.navigate({ to: `/chat/${data.chat.id}` })
    },
  })
}
