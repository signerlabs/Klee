/**
 * 模型使用查询 Hook
 *
 * 查询指定模型是否正在被使用（在聊天会话中）
 *
 * 用途：
 * - 删除模型前检查是否被使用
 * - 防止删除正在使用的模型
 */

import { useQuery } from '@tanstack/react-query'

/**
 * Hook for checking if a model is currently in use
 *
 * @param modelId - Model ID to check (e.g., 'llama3.2:1b')
 * @returns Query result with in-use status and session list
 *
 * @example
 * ```tsx
 * const { data: modelUsage } = useModelUsage('llama3.2:1b')
 *
 * if (modelUsage?.inUse) {
 *   console.log('Model is in use by:', modelUsage.sessions)
 * }
 * ```
 */
export function useModelUsage(modelId: string) {
  return useQuery({
    queryKey: ['model-usage', modelId],
    queryFn: async () => {
      // Call IPC to check if model is in use
      const result = await window.api.model.checkInUse(modelId)

      // Check if query was successful
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to check model usage')
      }

      return result.data
    },
    // Cache for 30 seconds to avoid excessive IPC calls
    staleTime: 30 * 1000,
    // Only run query if modelId is provided
    enabled: !!modelId,
  })
}
