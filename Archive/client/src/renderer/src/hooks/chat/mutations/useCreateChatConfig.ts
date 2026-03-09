import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys } from '@/lib/queryKeys'
import type { InferRequestType } from 'hono/client'

/**
 * 创建聊天配置的变更钩子
 *
 * 特性:
 * - 类型安全：通过 Hono RPC 自动推导请求和响应类型
 * - 自动缓存失效：成功后失效配置列表缓存
 * - 错误处理：提供详细的错误信息
 *
 * @returns TanStack Mutation 结果
 *
 * @example
 * ```tsx
 * function CreateConfigButton() {
 *   const createMutation = useCreateChatConfig()
 *
 *   const handleCreate = () => {
 *     createMutation.mutate(
 *       {
 *         name: 'My Config',
 *         defaultModel: 'gpt-4',
 *         systemPrompt: 'You are a helpful assistant',
 *       },
 *       {
 *         onSuccess: (data) => {
 *           console.log('Created config:', data.config.id)
 *         },
 *         onError: (error) => toast.error(error.message),
 *       }
 *     )
 *   }
 *
 *   return (
 *     <button onClick={handleCreate} disabled={createMutation.isPending}>
 *       Create Config
 *     </button>
 *   )
 * }
 * ```
 */
export function useCreateChatConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      data: InferRequestType<typeof honoClient.api['chat-configs']['$post']>['json']
    ) => {
      const res = await honoClient.api['chat-configs'].$post({
        json: data,
      })
      if (!res.ok) throw new Error('Failed to create chat config')
      return res.json()
    },

    // 成功后失效配置列表缓存
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })
    },
  })
}
