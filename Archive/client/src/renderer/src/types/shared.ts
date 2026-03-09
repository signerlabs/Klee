/**
 * 共享类型 - Cloud Mode 和 Private Mode 通用
 */

/**
 * 应用模式
 */
export type AppMode = 'cloud' | 'private'

/**
 * 消息角色（统一）
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * 通用错误类型
 */
export type AppError = {
  code: string
  message: string
  details?: unknown
}

/**
 * 分页参数
 */
export type PaginationParams = {
  page: number
  pageSize: number
}

/**
 * 分页响应
 */
export type PaginatedResponse<T> = {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
