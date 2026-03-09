import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys } from '@/lib/queryKeys'
import type { InferRequestType } from 'hono/client'

/**
 * 更新聊天配置的变更钩子
 *
 * 特性:
 * - 类型安全：通过 Hono RPC 自动推导请求和响应类型
 * - 乐观更新：立即更新 UI，失败时自动回滚
 * - 自动缓存失效：成功后失效配置详情和列表缓存
 * - 错误处理：失败时回滚并提供错误信息
 *
 * @returns TanStack Mutation 结果
 *
 * @example
 * ```tsx
 * function ConfigEditor({ configId }: { configId: string }) {
 *   const updateMutation = useUpdateChatConfig()
 *
 *   const handleUpdate = (name: string) => {
 *     updateMutation.mutate(
 *       { id: configId, data: { name } },
 *       {
 *         onSuccess: () => toast.success('Updated'),
 *         onError: (error) => toast.error(error.message),
 *       }
 *     )
 *   }
 *
 *   return (
 *     <button onClick={() => handleUpdate('New Name')} disabled={updateMutation.isPending}>
 *       Update
 *     </button>
 *   )
 * }
 * ```
 */
export function useUpdateChatConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: InferRequestType<typeof honoClient.api['chat-configs'][':id']['$put']>['json']
    }) => {
      const res = await honoClient.api['chat-configs'][':id'].$put({
        param: { id },
        json: data,
      })
      if (!res.ok) throw new Error('Failed to update chat config')
      return res.json()
    },

    // 乐观更新：立即更新 UI
    onMutate: async ({ id, data }) => {
      // 取消正在进行的查询，避免覆盖乐观更新
      await Promise.all([
        queryClient.cancelQueries({ queryKey: chatConfigKeys.detail(id) }),
        queryClient.cancelQueries({ queryKey: chatConfigKeys.lists() }),
      ])

      // 保存旧数据（用于回滚）
      const previousDetail = queryClient.getQueryData(chatConfigKeys.detail(id))
      const previousList = queryClient.getQueryData(chatConfigKeys.lists())

      // 乐观更新详情
      if (previousDetail) {
        queryClient.setQueryData(chatConfigKeys.detail(id), (old: any) => ({
          ...old,
          config: { ...old.config, ...data },
        }))
      }

      // 乐观更新列表
      if (previousList) {
        queryClient.setQueryData(chatConfigKeys.lists(), (old: any) => {
          const configIndex = old.configs.findIndex((config: any) => config.id === id)
          if (configIndex === -1) return old

          const newConfigs = [...old.configs]
          newConfigs[configIndex] = { ...newConfigs[configIndex], ...data }

          return { ...old, configs: newConfigs }
        })
      }

      return { previousDetail, previousList }
    },

    // 失败时回滚
    onError: (_err, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(chatConfigKeys.detail(variables.id), context.previousDetail)
      }
      if (context?.previousList) {
        queryClient.setQueryData(chatConfigKeys.lists(), context.previousList)
      }
    },

    // 成功后失效缓存（获取最新数据）
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })
    },
  })
}
