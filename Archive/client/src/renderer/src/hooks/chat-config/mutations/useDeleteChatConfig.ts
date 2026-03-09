import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { chatConfigKeys, marketplaceKeys } from '@/lib/queryKeys'

/**
 * 删除 ChatConfig (Agent) 的变更钩子
 *
 * 功能:
 * - 支持乐观更新（立即从列表中移除，失败时回滚）
 * - 删除成功后清理所有相关缓存
 * - 失败时提供详细错误消息
 */
export function useDeleteChatConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await honoClient.api['chat-configs'][':id'].$delete({
        param: { id },
      })

      if (!res.ok) {
        // 尝试解析服务器返回的错误消息
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
        throw new Error(errorData.error || `Failed to delete agent: ${res.status}`)
      }

      return res.json()
    },
    /**
     * 乐观更新：在服务器响应前立即从列表中移除
     */
    onMutate: async (id) => {
      // 1. 取消所有正在进行的列表查询，防止竞态条件
      await queryClient.cancelQueries({ queryKey: chatConfigKeys.lists() })

      // 2. 保存当前列表数据，用于失败时回滚
      const previousList = queryClient.getQueryData(chatConfigKeys.lists())

      // 3. 乐观更新：立即从列表中移除该配置
      queryClient.setQueryData(chatConfigKeys.lists(), (old: any) => {
        if (!old?.configs) return old
        return {
          ...old,
          configs: old.configs.filter((config: any) => config.id !== id),
        }
      })

      // 返回上下文，用于 onError 回滚
      return { previousList }
    },
    /**
     * 错误处理：如果删除失败，回滚到之前的列表状态
     */
    onError: (err, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(chatConfigKeys.lists(), context.previousList)
      }
    },
    /**
     * 成功处理：清理所有相关缓存
     * T070: 扩展缓存失效策略，包括 marketplace 缓存
     */
    onSuccess: (data, id) => {
      // 移除该配置的详情缓存
      queryClient.removeQueries({ queryKey: chatConfigKeys.detail(id) })

      // 失效列表查询，确保数据一致性
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })

      // T070: 失效 marketplace 缓存（如果该 Agent 曾经分享过）
      // 即使当前未分享，之前可能分享过，所以需要失效 marketplace 缓存
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.agents() })
    },
  })
}
