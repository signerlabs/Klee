import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys } from '@/lib/queryKeys'

/**
 * 删除聊天配置的变更钩子
 *
 * 特性:
 * - 类型安全：通过 Hono RPC 自动推导响应类型
 * - 自动缓存清理：成功后移除配置详情和失效列表缓存
 * - 级联删除：后端会自动删除关联的知识库关系
 * - 错误处理：提供详细的错误信息
 *
 * @returns TanStack Mutation 结果
 *
 * @example
 * ```tsx
 * function DeleteConfigButton({ configId }: { configId: string }) {
 *   const deleteMutation = useDeleteChatConfig()
 *
 *   const handleDelete = () => {
 *     deleteMutation.mutate(configId, {
 *       onSuccess: () => {
 *         toast.success('Config deleted')
 *       },
 *       onError: (error) => toast.error(error.message),
 *     })
 *   }
 *
 *   return (
 *     <button onClick={handleDelete} disabled={deleteMutation.isPending}>
 *       Delete
 *     </button>
 *   )
 * }
 * ```
 */
export function useDeleteChatConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await honoClient.api['chat-configs'][':id'].$delete({
        param: { id },
      })
      if (!res.ok) throw new Error('Failed to delete chat config')
      return res.json()
    },

    // 成功后清理缓存
    onSuccess: (_data, id) => {
      // 移除该配置的详情缓存
      queryClient.removeQueries({ queryKey: chatConfigKeys.detail(id) })
      // 失效配置列表缓存
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })
    },
  })
}
