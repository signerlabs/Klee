/**
 * useInstalledModels Hook
 *
 * 查询已安装的 Ollama 模型列表
 *
 * 功能：
 * - 调用 Ollama API `/api/tags` 获取已安装模型
 * - 自动缓存 30 秒（staleTime）
 * - 失败时返回空数组
 */

import { useQuery } from '@tanstack/react-query'
import { getInstalledModels } from '@/lib/ollama-client'
import { ollamaModelKeys } from '@/lib/queryKeys'

/**
 * 已安装模型查询 Hook
 *
 * @returns useQuery 结果（包含 data, isLoading, error 等）
 *
 * @example
 * ```tsx
 * const { data: installedModels, isLoading } = useInstalledModels()
 *
 * if (isLoading) return <div>Loading...</div>
 * if (!data) return null
 *
 * const installedModelNames = new Set(installedModels.map(m => m.name))
 * ```
 */
export function useInstalledModels() {
  return useQuery({
    queryKey: ollamaModelKeys.installed(),
    queryFn: async () => {
      try {
        const models = await getInstalledModels()
        return models
      } catch (error) {
        console.error('[useInstalledModels] Failed to fetch installed models:', error)
        // 返回空数组而不是抛出错误，避免阻塞 UI
        return []
      }
    },
    staleTime: 30 * 1000, // 30 秒陈旧时间
    retry: 2, // 失败重试 2 次
    refetchOnWindowFocus: true, // 窗口焦点时重新获取
  })
}
