/**
 * IPC 错误处理中间件
 *
 * 功能:
 * - 统一的 IPC 错误响应格式
 * - 错误日志记录
 * - 错误代码映射
 * - 用户友好的错误消息
 */

import { IPCErrorCode } from './channels'

/**
 * IPC 成功响应
 */
export interface IPCSuccessResponse<T = any> {
  success: true
  data: T
}

/**
 * IPC 错误响应
 */
export interface IPCErrorResponse {
  success: false
  error: string // 用户可读的错误消息（英文）
  code: IPCErrorCode // 错误代码
  details?: any // 额外的调试信息（仅开发环境）
}

/**
 * IPC 响应类型（成功或失败）
 */
export type IPCResponse<T = any> = IPCSuccessResponse<T> | IPCErrorResponse

/**
 * 创建成功响应
 */
export function createSuccessResponse<T>(data: T): IPCSuccessResponse<T> {
  return {
    success: true,
    data,
  }
}

/**
 * 创建错误响应
 */
export function createErrorResponse(
  message: string,
  code: IPCErrorCode = IPCErrorCode.INTERNAL_ERROR,
  details?: any
): IPCErrorResponse {
  // 开发环境才包含 details
  const response: IPCErrorResponse = {
    success: false,
    error: message,
    code,
  }

  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details
  }

  return response
}

/**
 * 错误代码到用户友好消息的映射
 */
const ERROR_MESSAGES: Record<IPCErrorCode, string> = {
  // Ollama 相关
  [IPCErrorCode.OLLAMA_NOT_RUNNING]: 'Ollama service is not running. Please start Ollama first.',
  [IPCErrorCode.MODEL_NOT_FOUND]: 'Model not found. Please download the model first.',
  [IPCErrorCode.MODEL_DOWNLOAD_FAILED]: 'Failed to download model. Please check your network connection.',
  [IPCErrorCode.OLLAMA_INSTALL_FAILED]: 'Failed to install Ollama. Please try again or install manually.',

  // 数据库相关
  [IPCErrorCode.DB_CONNECTION_ERROR]: 'Database connection error. Please restart the app.',
  [IPCErrorCode.DB_QUERY_ERROR]: 'Database query error. Please try again.',
  [IPCErrorCode.RECORD_NOT_FOUND]: 'Record not found.',
  [IPCErrorCode.DUPLICATE_RECORD]: 'Record already exists.',

  // 向量数据库相关
  [IPCErrorCode.VECTOR_EMBEDDING_FAILED]: 'Failed to embed documents. Please try again.',
  [IPCErrorCode.VECTOR_SEARCH_FAILED]: 'Vector search failed. Please try again.',
  [IPCErrorCode.VECTOR_DB_ERROR]: 'Vector database error. Please try again.',

  // 文件系统相关
  [IPCErrorCode.FILE_NOT_FOUND]: 'File not found.',
  [IPCErrorCode.FILE_TOO_LARGE]: 'File size exceeds the maximum limit (100MB).',
  [IPCErrorCode.FILE_READ_ERROR]: 'Failed to read file. Please check file permissions.',
  [IPCErrorCode.FILE_WRITE_ERROR]: 'Failed to write file. Please check disk space and permissions.',
  [IPCErrorCode.PERMISSION_DENIED]: 'Permission denied. Please check file permissions.',

  // 通用错误
  [IPCErrorCode.INVALID_PARAMS]: 'Invalid parameters provided.',
  [IPCErrorCode.INTERNAL_ERROR]: 'Internal server error. Please try again.',
  [IPCErrorCode.TIMEOUT]: 'Operation timed out. Please try again.',
  [IPCErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection.',
}

/**
 * 根据错误代码获取用户友好消息
 */
export function getErrorMessage(code: IPCErrorCode): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES[IPCErrorCode.INTERNAL_ERROR]
}

/**
 * 从 Error 对象创建错误响应
 */
export function createErrorFromException(
  error: unknown,
  code: IPCErrorCode = IPCErrorCode.INTERNAL_ERROR
): IPCErrorResponse {
  console.error('[IPC Error]', error)

  if (error instanceof Error) {
    return createErrorResponse(
      getErrorMessage(code),
      code,
      process.env.NODE_ENV === 'development' ? error.stack : undefined
    )
  }

  return createErrorResponse(
    getErrorMessage(code),
    code,
    process.env.NODE_ENV === 'development' ? String(error) : undefined
  )
}

/**
 * IPC 处理器包装器 - 自动错误处理
 *
 * 使用示例:
 * ```typescript
 * ipcMain.handle('db:get-conversations', wrapIPCHandler(async (event, params) => {
 *   const conversations = await getConversations(params)
 *   return conversations
 * }))
 * ```
 */
export function wrapIPCHandler<TParams = any, TResult = any>(
  handler: (event: Electron.IpcMainInvokeEvent, params: TParams) => Promise<TResult>,
  errorCode: IPCErrorCode = IPCErrorCode.INTERNAL_ERROR
): (event: Electron.IpcMainInvokeEvent, params: TParams) => Promise<IPCResponse<TResult>> {
  return async (event, params) => {
    try {
      const result = await handler(event, params)
      return createSuccessResponse(result)
    } catch (error) {
      return createErrorFromException(error, errorCode)
    }
  }
}

/**
 * 参数验证装饰器
 *
 * 使用示例:
 * ```typescript
 * ipcMain.handle('db:create-conversation', wrapIPCHandler(
 *   validateParams(createChatSessionRequestSchema)(async (event, params) => {
 *     // params 已经过验证
 *     const conversation = await createConversation(params)
 *     return conversation
 *   })
 * ))
 * ```
 */
export function validateParams<TSchema>(schema: any) {
  return <TParams = any, TResult = any>(
    handler: (event: Electron.IpcMainInvokeEvent, params: TParams) => Promise<TResult>
  ): ((event: Electron.IpcMainInvokeEvent, params: TParams) => Promise<TResult>) => {
    return async (event, params) => {
      try {
        // 使用 Zod schema 验证参数
        const validatedParams = schema.parse(params)
        return await handler(event, validatedParams)
      } catch (error) {
        throw new ValidationError('Invalid parameters', error)
      }
    }
  }
}

/**
 * 自定义错误类 - 验证错误
 */
export class ValidationError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * 自定义错误类 - 业务逻辑错误
 */
export class BusinessError extends Error {
  constructor(
    message: string,
    public code: IPCErrorCode = IPCErrorCode.INTERNAL_ERROR
  ) {
    super(message)
    this.name = 'BusinessError'
  }
}

/**
 * 日志记录工具
 */
export class IPCLogger {
  private static logToFile(level: string, channel: string, message: string, data?: any) {
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level,
      channel,
      message,
      data,
    }

    // 控制台输出
    console.log(`[IPC ${level}] ${channel}: ${message}`, data || '')

    // TODO: 实际环境可以写入日志文件
    // fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n')
  }

  static info(channel: string, message: string, data?: any) {
    this.logToFile('INFO', channel, message, data)
  }

  static warn(channel: string, message: string, data?: any) {
    this.logToFile('WARN', channel, message, data)
  }

  static error(channel: string, message: string, error?: any) {
    this.logToFile('ERROR', channel, message, error)
  }

  static debug(channel: string, message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      this.logToFile('DEBUG', channel, message, data)
    }
  }
}

/**
 * 性能监控装饰器
 */
export function measurePerformance<TParams = any, TResult = any>(
  handler: (event: Electron.IpcMainInvokeEvent, params: TParams) => Promise<TResult>
): (event: Electron.IpcMainInvokeEvent, params: TParams) => Promise<TResult> {
  return async (event, params) => {
    const startTime = Date.now()

    try {
      const result = await handler(event, params)
      const duration = Date.now() - startTime

      IPCLogger.debug('performance', `Execution time: ${duration}ms`, { params, duration })

      return result
    } catch (error) {
      const duration = Date.now() - startTime
      IPCLogger.error('performance', `Failed after ${duration}ms`, { params, duration, error })
      throw error
    }
  }
}
