/**
 * useAvailableModels Hook
 *
 * 查询可下载的模型列表（配置 + 安装状态合并）
 *
 * 功能：
 * - 合并 localLLMModels 配置和 Ollama 已安装模型数据
 * - 返回带有下载状态的模型列表
 * - 自动检测哪些模型已安装
 */

import { useQuery } from '@tanstack/react-query'
import { localLLMModels, type LocalLLMModel } from '@config/models'
import { ollamaModelKeys } from '@/lib/queryKeys'
import { useInstalledModels } from './useInstalledModels'

/**
 * 运行时扩展的模型信息
 *
 * 结合 Ollama API 返回的安装状态
 */
export interface LocalLLMModelWithStatus extends LocalLLMModel {
  /** 下载状态 */
  downloadStatus: 'available' | 'downloading' | 'installed'

  /** 是否被聊天会话使用（暂未实现） */
  inUse: boolean

  /** 使用次数（被多少个会话使用，暂未实现） */
  usageCount: number

  /** 实际安装大小（GB，来自 Ollama API） */
  installedSize?: number

  /** 安装日期（来自 Ollama API） */
  installedAt?: string
}

/**
 * 可用模型查询 Hook
 *
 * @param options - 可选的查询配置（如 enabled）
 * @returns useQuery 结果（包含 data, isLoading, error 等）
 *
 * @example
 * ```tsx
 * const { data: models, isLoading } = useAvailableModels()
 *
 * if (isLoading) return <Skeleton />
 * if (!models) return null
 *
 * models.forEach(model => {
 *   console.log(model.name, model.downloadStatus) // 'Llama 3.2 1B', 'installed'
 * })
 * ```
 */
export function useAvailableModels(
  options?: { enabled?: boolean }
) {
  const { data: installedModels, isFetched } = useInstalledModels()

  return useQuery<LocalLLMModelWithStatus[]>({
    // 关键：queryKey 必须依赖 installedModels，这样当 installedModels 变化时会重新计算
    queryKey: [...ollamaModelKeys.available(), installedModels?.length ?? 0],
    queryFn: async (): Promise<LocalLLMModelWithStatus[]> => {
      /**
       * 标准化模型名称（处理版本标签差异）
       * 例如: 'nomic-embed-text:latest' -> 'nomic-embed-text'
       *      'qwen2.5:0.5b' -> 'qwen2.5:0.5b' (保留有意义的版本标签)
       */
      const normalizeModelName = (name: string): string => {
        // 如果模型名称以 :latest 结尾，去掉它（:latest 是默认版本）
        return name.replace(/:latest$/, '')
      }

      // 创建已安装模型的 Map（使用标准化的模型名称作为键）
      const installedMap = new Map(
        (installedModels || []).map((m) => {
          const normalizedName = normalizeModelName(m.name)
          return [
            normalizedName,
            {
              originalName: m.name, // 保留原始名称用于调试
              size: m.size,
              modifiedAt: m.modified_at,
            },
          ]
        })
      )

      // 合并配置文件和安装状态
      return localLLMModels.map((model) => {
        const normalizedModelName = normalizeModelName(model.model)
        const installedInfo = installedMap.get(normalizedModelName)
        const isInstalled = !!installedInfo

        return {
          ...model,
          downloadStatus: isInstalled ? ('installed' as const) : ('available' as const),
          inUse: false, // 暂未实现模型使用检测
          usageCount: 0, // 暂未实现使用统计
          installedSize: installedInfo ? installedInfo.size / (1024 * 1024 * 1024) : undefined, // 转换为 GB
          installedAt: installedInfo?.modifiedAt,
        }
      })
    },
    // 关键修复：必须等待 installedModels 有数据后才执行
    enabled: isFetched && (options?.enabled !== false), // 等待已安装模型查询完成，并考虑外部 enabled 选项
    staleTime: 2 * 60 * 1000, // 2 分钟陈旧时间
    ...options, // 允许覆盖其他选项
  })
}
