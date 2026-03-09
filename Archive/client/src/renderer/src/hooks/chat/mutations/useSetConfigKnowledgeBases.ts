import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys } from '@/lib/queryKeys'
import type { InferRequestType } from 'hono/client'

/**
 * 设置配置关联知识库的变更钩子
 *
 * 特性:
 * - 类型安全：通过 Hono RPC 自动推导请求和响应类型
 * - 批量设置：一次性替换所有关联的知识库
 * - 乐观更新：立即更新 UI，失败时自动回滚
 * - 自动缓存失效：成功后失效配置详情缓存
 *
 * @returns TanStack Mutation 结果
 *
 * @example
 * ```tsx
 * function KnowledgeBaseSelector({ configId }: { configId: string }) {
 *   const setKbsMutation = useSetConfigKnowledgeBases()
 *   const [selectedIds, setSelectedIds] = useState<string[]>([])
 *
 *   const handleSave = () => {
 *     setKbsMutation.mutate(
 *       { configId, knowledgeBaseIds: selectedIds },
 *       {
 *         onSuccess: () => toast.success('Knowledge bases updated'),
 *         onError: (error) => toast.error(error.message),
 *       }
 *     )
 *   }
 *
 *   return (
 *     <button onClick={handleSave} disabled={setKbsMutation.isPending}>
 *       Save
 *     </button>
 *   )
 * }
 * ```
 */
export function useSetConfigKnowledgeBases() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      configId,
      knowledgeBaseIds,
    }: {
      configId: string
      knowledgeBaseIds: InferRequestType<
        typeof honoClient.api['chat-configs'][':id']['knowledge-bases']['$put']
      >['json']['knowledgeBaseIds']
    }) => {
      const res = await honoClient.api['chat-configs'][':id']['knowledge-bases'].$put({
        param: { id: configId },
        json: { knowledgeBaseIds },
      })
      if (!res.ok) throw new Error('Failed to set knowledge bases')
      return res.json()
    },

    // 乐观更新：立即更新 UI
    onMutate: async ({ configId, knowledgeBaseIds }) => {
      // 取消正在进行的查询，避免覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: chatConfigKeys.detail(configId) })

      // 保存旧数据（用于回滚）
      const previousDetail = queryClient.getQueryData(chatConfigKeys.detail(configId))

      // 乐观更新详情（假设知识库数据结构）
      if (previousDetail) {
        queryClient.setQueryData(chatConfigKeys.detail(configId), (old: any) => ({
          ...old,
          // 更新 knowledgeBaseIds（仅 ID 列表）
          // 注意：实际的知识库对象需要从服务器获取
          knowledgeBases: old.knowledgeBases.filter((kb: any) =>
            knowledgeBaseIds.includes(kb.id)
          ),
        }))
      }

      return { previousDetail }
    },

    // 失败时回滚
    onError: (_err, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(chatConfigKeys.detail(variables.configId), context.previousDetail)
      }
    },

    // 成功后失效缓存（获取最新数据，包括知识库详情）
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.detail(variables.configId) })
    },
  })
}
