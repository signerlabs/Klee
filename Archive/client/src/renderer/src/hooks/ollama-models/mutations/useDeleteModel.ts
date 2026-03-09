/**
 * 删除模型 Mutation Hook
 *
 * 调用 Ollama API 删除已下载的模型
 *
 * 特性：
 * - 删除前检查模型是否被使用
 * - 成功后自动刷新模型列表和磁盘空间
 * - 错误处理（in_use、权限不足、文件被锁定等）
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ollamaModelKeys } from '@/lib/queryKeys'

/**
 * Hook for deleting Ollama models
 *
 * Calls IPC to delete model from Ollama storage
 * Automatically invalidates relevant queries on success
 *
 * @example
 * ```tsx
 * const deleteMutation = useDeleteModel()
 *
 * deleteMutation.mutate('llama3.2:1b', {
 *   onSuccess: () => {
 *     toast.success('Model deleted successfully')
 *   },
 *   onError: (error) => {
 *     toast.error(`Failed to delete: ${error.message}`)
 *   }
 * })
 * ```
 */
export function useDeleteModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (modelId: string) => {
      // Call IPC to delete model (force = true to allow deleting models in use)
      const result = await window.api.model.delete(modelId, true)

      // Check if deletion was successful
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete model')
      }

      return result.data
    },
    onSuccess: () => {
      // Invalidate queries to refresh model lists and disk space
      queryClient.invalidateQueries({ queryKey: ollamaModelKeys.installed() })
      queryClient.invalidateQueries({ queryKey: ollamaModelKeys.available() })
      queryClient.invalidateQueries({ queryKey: ['disk-space', 'ollama'] })
    },
    onError: (error: Error) => {
      // Error will be handled by the caller
      console.error('Failed to delete model:', error)
    },
  })
}
