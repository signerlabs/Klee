/**
 * useLocalModelList Hook
 *
 * 用于 Private Mode 下获取已安装的 Ollama 模型列表
 *
 * 特点：
 * - 通过 IPC 与 Electron 主进程通信
 * - 使用 TanStack Query 进行缓存
 * - 支持自动刷新和重试
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { getInstalledModels, getModelDisplayName, getModelDescription } from '@/lib/ollama-client'

/**
 * Ollama 模型信息
 */
export interface OllamaModelInfo {
  name: string // 模型 ID，如 'llama3:8b'
  displayName: string // 显示名称，如 'Llama 3 8B'
  description: string // 模型描述
  size: number // 模型大小（字节）
  sizeFormatted: string // 格式化的大小，如 '4.7 GB'
  modifiedAt: string // 最后修改时间
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * 获取已安装的 Ollama 模型列表
 */
async function fetchLocalModels(): Promise<OllamaModelInfo[]> {
  try {
    const models = await getInstalledModels()

    return models.map((model) => ({
      name: model.name,
      displayName: getModelDisplayName(model.name),
      description: getModelDescription(model.name),
      size: model.size,
      sizeFormatted: formatBytes(model.size),
      modifiedAt: model.modified_at,
    }))
  } catch (error) {
    console.error('[useLocalModelList] Failed to fetch models:', error)
    throw error
  }
}

/**
 * useLocalModelList Hook
 *
 * 获取已安装的 Ollama 模型列表
 *
 * @returns TanStack Query 结果对象
 *
 * @example
 * ```tsx
 * const { data: models, isLoading, error, refetch } = useLocalModelList()
 *
 * if (isLoading) return <div>Loading models...</div>
 * if (error) return <div>Error: {error.message}</div>
 *
 * return (
 *   <div>
 *     <button onClick={() => refetch()}>Refresh Models</button>
 *     <ul>
 *       {models?.map(model => (
 *         <li key={model.name}>
 *           {model.displayName} ({model.sizeFormatted})
 *         </li>
 *       ))}
 *     </ul>
 *   </div>
 * )
 * ```
 */
export function useLocalModelList() {
  const options = {
    queryKey: ['local-models'] as const,
    queryFn: fetchLocalModels,
    staleTime: 5 * 60 * 1000, // 5 分钟陈旧时间（模型列表不常变化）
    cacheTime: 10 * 60 * 1000, // 10 分钟缓存时间
    retry: 2, // 失败重试 2 次
    refetchOnWindowFocus: false, // 模型列表不需要在窗口焦点时刷新
    enabled: true,
  } satisfies UseQueryOptions<OllamaModelInfo[], Error, OllamaModelInfo[], ['local-models']>

  return useQuery(options)
}

/**
 * 检查特定模型是否已安装
 */
export function useIsModelInstalled(modelName: string) {
  const { data: models, isLoading } = useLocalModelList()

  const isInstalled = models?.some((model) => model.name === modelName) ?? false

  return {
    isInstalled,
    isLoading,
  }
}
