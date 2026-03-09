/**
 * Private Mode - 本地模型类型
 */

/**
 * Ollama 模型信息
 */
export type OllamaModel = {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details?: {
    parent_model?: string
    format?: string
    family?: string
    families?: string[]
    parameter_size?: string
    quantization_level?: string
  }
}

/**
 * Ollama 模型列表响应
 */
export type OllamaModelListResponse = {
  models: OllamaModel[]
}

/**
 * Ollama 来源
 */
export type OllamaSource = 'none' | 'system' | 'embedded'

/**
 * Ollama 初始化进度
 */
export type OllamaInitProgress = {
  percent: number
  message: string
  source: OllamaSource
}

/**
 * Ollama 就绪状态
 */
export type OllamaReadyStatus = {
  source: OllamaSource
  url: string
}
