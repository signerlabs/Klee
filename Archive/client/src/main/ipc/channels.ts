/**
 * IPC 通道定义
 *
 * 定义所有 Electron 主进程与渲染进程之间的 IPC 通道名称
 * 命名规范: <domain>:<action>
 *
 * 参考: specs/006-private-mode/contracts/ipc-channels.md
 */

/**
 * 模式管理相关通道
 */
export const MODE_CHANNELS = {
  /** 切换运行模式 (Renderer -> Main, Send) */
  SWITCH: 'mode:switch',
  /** 获取当前模式 (Renderer -> Main, Invoke) */
  GET_CURRENT: 'mode:get-current',
} as const

/**
 * Ollama 管理相关通道
 */
export const OLLAMA_CHANNELS = {
  /** 下载模型 (Renderer -> Main, Invoke) */
  PULL_MODEL: 'ollama:pull-model',
  /** 下载进度事件 (Main -> Renderer, Event) */
  PULL_PROGRESS: 'ollama:pull-progress',
  /** 列出已安装模型 (Renderer -> Main, Invoke) */
  LIST_MODELS: 'ollama:list-models',
  /** 删除模型 (Renderer -> Main, Invoke) */
  DELETE_MODEL: 'ollama:delete-model',
  /** 聊天请求 (Renderer -> Main, Invoke) */
  CHAT: 'ollama:chat',
  /** 聊天流式响应事件 (Main -> Renderer, Event) */
  CHAT_STREAM: 'ollama:chat-stream',
  /** 检测 Ollama 状态 (Renderer -> Main, Invoke) */
  DETECT: 'ollama:detect',
  /** 获取 Ollama 版本 (Renderer -> Main, Invoke) */
  GET_VERSION: 'ollama:get-version',
  /** 安装 Ollama (Renderer -> Main, Invoke) */
  INSTALL: 'ollama:install',
  /** 安装进度事件 (Main -> Renderer, Event) */
  INSTALL_PROGRESS: 'ollama:install-progress',
} as const

/**
 * 向量数据库相关通道
 */
export const VECTOR_CHANNELS = {
  /** 向量化文档 (Renderer -> Main, Invoke) */
  EMBED_DOCUMENTS: 'vector:embed-documents',
  /** 向量化进度事件 (Main -> Renderer, Event) */
  EMBED_PROGRESS: 'vector:embed-progress',
  /** 向量搜索 (Renderer -> Main, Invoke) */
  SEARCH: 'vector:search',
  /** 删除知识库向量 (Renderer -> Main, Invoke) */
  DELETE_KB: 'vector:delete-kb',
} as const

/**
 * 本地数据库操作相关通道
 */
export const DB_CHANNELS = {
  // 聊天会话
  CREATE_CONVERSATION: 'db:create-conversation',
  GET_CONVERSATIONS: 'db:get-conversations',
  GET_CONVERSATION: 'db:get-conversation',
  UPDATE_CONVERSATION: 'db:update-conversation',
  DELETE_CONVERSATION: 'db:delete-conversation',
  STAR_CONVERSATION: 'db:star-conversation',

  // 聊天消息
  CREATE_MESSAGE: 'db:create-message',
  GET_MESSAGES: 'db:get-messages',
  DELETE_MESSAGE: 'db:delete-message',
  CREATE_MESSAGES: 'db:create-messages',
  GET_LAST_MESSAGE: 'db:get-last-message',
  GET_MESSAGE_COUNT: 'db:get-message-count',

  // 知识库
  CREATE_KNOWLEDGE_BASE: 'db:create-knowledge-base',
  GET_KNOWLEDGE_BASES: 'db:get-knowledge-bases',
  GET_KNOWLEDGE_BASE: 'db:get-knowledge-base',
  UPDATE_KNOWLEDGE_BASE: 'db:update-knowledge-base',
  DELETE_KNOWLEDGE_BASE: 'db:delete-knowledge-base',
  STAR_KNOWLEDGE_BASE: 'db:star-knowledge-base',

  // 知识库文件
  UPLOAD_DOCUMENT: 'db:upload-document',
  GET_DOCUMENTS: 'db:get-documents',
  DELETE_DOCUMENT: 'db:delete-document',

  // 模型管理
  SAVE_MODEL: 'db:save-model',
  GET_MODELS: 'db:get-models',
  DELETE_MODEL_RECORD: 'db:delete-model-record',
  UPDATE_MODEL_LAST_USED: 'db:update-model-last-used',

  // 数据库统计
  GET_STATS: 'db:get-stats',
} as const

/**
 * 文件系统操作相关通道
 */
export const FS_CHANNELS = {
  /** 选择文件 (Renderer -> Main, Invoke) */
  SELECT_FILE: 'fs:select-file',
  /** 获取 userData 路径 (Renderer -> Main, Invoke) */
  GET_USER_DATA_PATH: 'fs:get-user-data-path',
  /** 保存文件 (Renderer -> Main, Invoke) */
  SAVE_FILE: 'fs:save-file',
  /** 读取文件 (Renderer -> Main, Invoke) */
  READ_FILE: 'fs:read-file',
  /** 删除文件 (Renderer -> Main, Invoke) */
  DELETE_FILE: 'fs:delete-file',
} as const

/**
 * 所有 IPC 通道集合
 */
export const IPC_CHANNELS = {
  MODE: MODE_CHANNELS,
  OLLAMA: OLLAMA_CHANNELS,
  VECTOR: VECTOR_CHANNELS,
  DB: DB_CHANNELS,
  FS: FS_CHANNELS,
} as const

/**
 * IPC 错误代码
 */
export enum IPCErrorCode {
  // Ollama 相关错误
  OLLAMA_NOT_RUNNING = 'OLLAMA_NOT_RUNNING',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  MODEL_DOWNLOAD_FAILED = 'MODEL_DOWNLOAD_FAILED',
  OLLAMA_INSTALL_FAILED = 'OLLAMA_INSTALL_FAILED',

  // 数据库相关错误
  DB_CONNECTION_ERROR = 'DB_CONNECTION_ERROR',
  DB_QUERY_ERROR = 'DB_QUERY_ERROR',
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  DUPLICATE_RECORD = 'DUPLICATE_RECORD',

  // 向量数据库相关错误
  VECTOR_EMBEDDING_FAILED = 'VECTOR_EMBEDDING_FAILED',
  VECTOR_SEARCH_FAILED = 'VECTOR_SEARCH_FAILED',
  VECTOR_DB_ERROR = 'VECTOR_DB_ERROR',

  // 文件系统相关错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // 通用错误
  INVALID_PARAMS = 'INVALID_PARAMS',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * 类型导出 - 用于类型安全的通道名称
 */
export type ModeChannel = (typeof MODE_CHANNELS)[keyof typeof MODE_CHANNELS]
export type OllamaChannel = (typeof OLLAMA_CHANNELS)[keyof typeof OLLAMA_CHANNELS]
export type VectorChannel = (typeof VECTOR_CHANNELS)[keyof typeof VECTOR_CHANNELS]
export type DBChannel = (typeof DB_CHANNELS)[keyof typeof DB_CHANNELS]
export type FSChannel = (typeof FS_CHANNELS)[keyof typeof FS_CHANNELS]
export type IPCChannel = ModeChannel | OllamaChannel | VectorChannel | DBChannel | FSChannel
