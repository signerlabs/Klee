/**
 * 本地开源大模型配置
 *
 * 用于 marketplace 中 "Local LLMs" 标签页展示
 */
export interface LocalLLMModel {
  name: string
  model: string
  provider: string
  size: number
  minGPU: string
  updatedAt: string
  deprecated?: boolean
  description?: string
  tags?: string[]
}

/**
 * 运行时扩展的模型信息
 *
 * 结合 Ollama API 返回的安装状态和使用统计
 */
export interface LocalLLMModelWithStatus extends LocalLLMModel {
  /** 下载状态 */
  downloadStatus: 'available' | 'downloading' | 'installed'

  /** 是否被聊天会话使用 */
  inUse: boolean

  /** 使用次数（被多少个会话使用） */
  usageCount: number

  /** 实际安装大小（GB，来自 Ollama API） */
  installedSize?: number

  /** 安装日期（来自 Ollama API） */
  installedAt?: string
}

/**
 * 本地开源大模型列表配置
 *
 * 只有在此列表中的模型才会在 marketplace 中显示
 */
export const localLLMModels: LocalLLMModel[] = [
  // --- Qwen 系列 ---
  {
    name: 'Qwen 3 0.6B',
    model: 'qwen3:0.6b',
    provider: 'Alibaba',
    size: 0.5,
    minGPU: '2 GB',
    updatedAt: '2025-04-29',
    description: 'Micro-sized model for IoT and edge devices, 40K context.',
    tags: ['Fastest', 'Micro'],
  },
  {
    name: 'Qwen 3 1.7B',
    model: 'qwen3:1.7b',
    provider: 'Alibaba',
    size: 1.4,
    minGPU: '4 GB',
    updatedAt: '2025-04-29',
    description: 'Optimized for 4GB GPUs or CPU, 119 languages, 40K context.',
    tags: ['Recommended', 'Multilingual'],
  },
  {
    name: 'Qwen 3 4B',
    model: 'qwen3:4b',
    provider: 'Alibaba',
    size: 2.5,
    minGPU: '6 GB',
    updatedAt: '2025-10-01',
    description: 'Balanced performance with 256K context, thinking mode support.',
    tags: ['Balanced', 'Long Context'],
  },
  {
    name: 'Qwen 3 8B',
    model: 'qwen3:8b',
    provider: 'Alibaba',
    size: 5.2,
    minGPU: '8 GB',
    updatedAt: '2025-04-29',
    description: 'Flagship 8B model with reasoning capabilities, 40K context.',
    tags: ['Flagship', 'Recommended'],
  },
  {
    name: 'Qwen 2.5 0.5B',
    model: 'qwen2.5:0.5b',
    provider: 'Alibaba',
    size: 0.4,
    minGPU: '4 GB',
    updatedAt: '2024-11-20',
    description: 'Ultra-lightweight, extremely fast, great for quick responses.',
    tags: ['Fastest'],
  },
  {
    name: 'Qwen 2.5 1.5B',
    model: 'qwen2.5:1.5b',
    provider: 'Alibaba',
    size: 1.2,
    minGPU: '6 GB',
    updatedAt: '2024-11-20',
    description: 'Light and efficient, ideal for on-device reasoning.',
    tags: ['Recommended'],
  },
  {
    name: 'Qwen 2.5 3B',
    model: 'qwen2.5:3b',
    provider: 'Alibaba',
    size: 2.6,
    minGPU: '8 GB',
    updatedAt: '2024-11-20',
    description: 'Balanced between speed and accuracy, excellent for general chat.',
    tags: ['Balanced'],
  },
  {
    name: 'Qwen 2.5 7B',
    model: 'qwen2.5:7b',
    provider: 'Alibaba',
    size: 5.6,
    minGPU: '12 GB',
    updatedAt: '2024-11-20',
    description: 'High-quality model with strong comprehension and reasoning.',
    tags: ['Powerful'],
  },

  // --- 其他模型 ---
  {
    name: 'Llama 3.2 1B',
    model: 'llama3.2:1b',
    provider: 'Meta',
    size: 1.3,
    minGPU: '4 GB',
    updatedAt: '2024-09-25',
    description: 'Ultra-lightweight, Meta official, best compatibility.',
    tags: ['Recommended', 'Fastest'],
  },
  {
    name: 'Llama 3.2 3B',
    model: 'llama3.2:3b',
    provider: 'Meta',
    size: 2.0,
    minGPU: '6 GB',
    updatedAt: '2024-09-25',
    description: 'Lightweight, good balance of speed and quality.',
    tags: ['Recommended'],
  },
  {
    name: 'Llama 3 8B',
    model: 'llama3:8b',
    provider: 'Meta',
    size: 4.7,
    minGPU: '16 GB',
    updatedAt: '2024-05-15',
    description: 'Fast and versatile, great for most tasks.',
    tags: ['Popular'],
  },
  {
    name: 'Mistral 7B',
    model: 'mistral:7b',
    provider: 'Mistral AI',
    size: 4.1,
    minGPU: '12 GB',
    updatedAt: '2024-03-15',
    description: 'Efficient and fast, great balance between speed and reasoning.',
    tags: ['Balanced'],
  },
  {
    name: 'Gemma 2B',
    model: 'gemma:2b',
    provider: 'Google',
    size: 1.7,
    minGPU: '6 GB',
    updatedAt: '2024-02-21',
    description: 'Lightweight model for quick responses.',
    tags: ['Lightweight'],
  },
  {
    name: 'Gemma 7B',
    model: 'gemma:7b',
    provider: 'Google',
    size: 5.0,
    minGPU: '12 GB',
    updatedAt: '2024-02-21',
    description: 'Balanced performance and speed, good generalist model.',
    tags: ['Balanced'],
  },
  {
    name: 'CodeLlama 7B',
    model: 'codellama:7b',
    provider: 'Meta',
    size: 3.8,
    minGPU: '10 GB',
    updatedAt: '2023-08-24',
    description: 'Optimized for coding and structured reasoning.',
    tags: ['Coding'],
  },
  {
    name: 'Phi-3 Mini',
    model: 'phi3:mini',
    provider: 'Microsoft',
    size: 2.3,
    minGPU: '6 GB',
    updatedAt: '2024-04-23',
    description: 'Smallest model, very fast and efficient.',
    tags: ['UltraLight'],
  },
  {
    name: 'Command R 35B',
    model: 'command-r:35b',
    provider: 'Cohere',
    size: 20.0,
    minGPU: '24 GB',
    updatedAt: '2024-07-15',
    description: 'High-capacity conversational model for RAG and reasoning.',
    tags: ['HighCapacity'],
  },
]

/**
 * 统一模型配置
 *
 * 包含本地开源模型和云端模型的配置
 */
export interface ModelConfig {
  /** 配置文件版本（用于后续迁移） */
  version: string

  /** 本地开源模型列表 */
  localModels: LocalLLMModel[]

  /** 云端模型列表 */
  cloudModels: Array<{
    name: string
    value: string
  }>
}

export const llmModels = [
  {
    name: 'Qwen 3 30B Instruct',
    value: 'qwen3-30b-a3b-instruct-2507',
  },
  {
    name: 'Qwen 3 235B Instruct',
    value: 'qwen3-235b-a22b-instruct-2507',
  },
  {
    name: 'Qwen 3 Coder Flash',
    value: 'qwen3-coder-flash',
  },
  {
    name: 'Qwen 3 Coder Plus',
    value: 'qwen3-coder-plus',
  },
]

/**
 * 验证本地模型配置
 *
 * @param model - 要验证的本地模型配置
 * @returns 验证错误数组，如果为空则表示验证通过
 *
 * @example
 * ```ts
 * const errors = validateLocalModel(model)
 * if (errors.length > 0) {
 *   console.error('Model validation failed:', errors)
 * }
 * ```
 */
export function validateLocalModel(model: LocalLLMModel): string[] {
  const errors: string[] = []

  // 验证必填字段
  if (!model.name?.trim()) {
    errors.push('name is required')
  }
  if (!model.model?.trim()) {
    errors.push('model is required')
  }
  if (!model.provider?.trim()) {
    errors.push('provider is required')
  }
  if (!model.minGPU?.trim()) {
    errors.push('minGPU is required')
  }
  if (!model.updatedAt?.trim()) {
    errors.push('updatedAt is required')
  }

  // 验证模型 ID 格式（应该包含冒号，如 'llama3:8b'）
  if (model.model && !model.model.includes(':')) {
    errors.push('model should include version tag (e.g., "llama3:8b")')
  }

  // 验证大小为正数
  if (typeof model.size !== 'number' || model.size <= 0) {
    errors.push('size must be a positive number')
  }

  // 验证日期格式（ISO 8601: YYYY-MM-DD）
  if (model.updatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(model.updatedAt)) {
    errors.push('updatedAt must be in YYYY-MM-DD format')
  }

  return errors
}

/**
 * 验证云端模型配置
 *
 * @param model - 要验证的云端模型配置
 * @returns 验证错误数组，如果为空则表示验证通过
 */
export function validateCloudModel(model: { name: string; value: string }): string[] {
  const errors: string[] = []

  if (!model.name?.trim()) {
    errors.push('name is required')
  }
  if (!model.value?.trim()) {
    errors.push('value is required')
  }

  return errors
}

/**
 * 验证完整的模型配置
 *
 * @param config - 要验证的模型配置
 * @returns 验证是否通过，以及错误信息列表
 */
export function validateModelConfig(config: ModelConfig): {
  isValid: boolean
  errors: Array<{ type: 'local' | 'cloud'; model: string; errors: string[] }>
} {
  const allErrors: Array<{ type: 'local' | 'cloud'; model: string; errors: string[] }> = []

  // 验证本地模型
  config.localModels.forEach((model) => {
    const errors = validateLocalModel(model)
    if (errors.length > 0) {
      allErrors.push({
        type: 'local',
        model: model.name || model.model || 'unknown',
        errors,
      })
    }
  })

  // 验证云端模型
  config.cloudModels.forEach((model) => {
    const errors = validateCloudModel(model)
    if (errors.length > 0) {
      allErrors.push({
        type: 'cloud',
        model: model.name || model.value || 'unknown',
        errors,
      })
    }
  })

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  }
}

/**
 * 导出统一配置
 */
export const modelConfig: ModelConfig = {
  version: '1.0.0',
  localModels: localLLMModels,
  cloudModels: llmModels,
}
