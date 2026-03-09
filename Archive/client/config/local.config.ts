/**
 * Private Mode 本地配置
 *
 * 所有与本地模式相关的配置项
 * 包括 Ollama 服务、向量数据库、文件存储等
 */

/**
 * Ollama 服务配置
 */
export const OLLAMA_CONFIG = {
  /**
   * Ollama API 基础 URL
   */
  API_URL: 'http://localhost:11434',

  /**
   * Ollama API URL（带 /api 路径，用于 AI SDK）
   */
  API_BASE_URL: 'http://localhost:11434/api',

  /**
   * Ollama 服务端口
   */
  PORT: 11434,

  /**
   * API 请求超时（毫秒）
   */
  TIMEOUT: 60000, // 60 秒（AI SDK 使用）

  /**
   * 检测系统 Ollama 超时（毫秒）
   */
  DETECTION_TIMEOUT: 2000, // 2 秒

  /**
   * 模型下载超时（毫秒）
   */
  DOWNLOAD_TIMEOUT: 600000, // 10 分钟
} as const

/**
 * 向量数据库配置 (LanceDB)
 */
export const VECTOR_DB_CONFIG = {
  DB_DIR: 'vector-db',
  KB_TABLE_PREFIX: 'kb_',
  EMBEDDING_DIMENSION: 768,
  DEFAULT_SEARCH_LIMIT: 10,
  INDEX_CONFIG: {
    type: 'ivf_pq' as const,
    num_partitions: 256,
    num_sub_vectors: 96,
  },
} as const

/**
 * 嵌入模型配置
 */
export const EMBEDDING_CONFIG = {
  DEFAULT_MODEL: 'nomic-embed-text',

  SUPPORTED_MODELS: [
    'nomic-embed-text', // 768 维，推荐
    'mxbai-embed-large', // 1024 维
    'all-minilm', // 384 维，轻量级
  ] as const,

  CHUNK_CONFIG: {
    MAX_CHUNK_SIZE: 1000,
    CHUNK_OVERLAP: 200,
  },
} as const

/**
 * 文件存储配置
 */
export const FILE_STORAGE_CONFIG = {
  DOCS_DIR: 'documents',
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  SUPPORTED_FILE_TYPES: [
    'text/plain', // .txt
    'text/markdown', // .md
    'application/pdf', // .pdf
    'application/json', // .json
    'text/html', // .html
    'text/csv', // .csv
  ] as const,

  FILE_EXTENSIONS: {
    'text/plain': ['.txt'],
    'text/markdown': ['.md'],
    'application/pdf': ['.pdf'],
    'application/json': ['.json'],
    'text/html': ['.html'],
    'text/csv': ['.csv'],
  } as const,
} as const

/**
 * 本地聊天配置
 */
export const CHAT_CONFIG = {
  /**
   * 默认聊天模型
   */
  DEFAULT_MODEL: 'qwen3:0.6b',

  /**
   * 流式响应配置
   */
  STREAM_CONFIG: {
    MIN_CHUNK_DELAY: 10,
  },

  /**
   * 上下文窗口配置
   */
  CONTEXT_CONFIG: {
    MAX_MESSAGES: 50,
    RAG_RESULTS_COUNT: 5,
  },
} as const

/**
 * 性能监控配置
 */
export const PERFORMANCE_CONFIG = {
  ENABLED: true,
  THRESHOLDS: {
    CHAT_TTFB: 200,
    EMBEDDING_SPEED: 100,
    VECTOR_SEARCH: 100,
  },
} as const

/**
 * 模式切换配置
 */
export const MODE_CONFIG = {
  SWITCH_CONFIRMATION: {
    ENABLED: true,
    TITLE: 'Switch to Private Mode?',
    MESSAGE: 'You are about to switch to Private Mode. All data will be stored locally.',
  },

  /**
   * 本地存储键名
   */
  STORAGE_KEYS: {
    MODE: 'run-mode',
    OLLAMA_SOURCE: 'ollama-source',
  },
} as const

/**
 * 日志配置
 */
export const LOGGING_CONFIG = {
  LEVEL: 'info' as 'debug' | 'info' | 'warn' | 'error',
  VERBOSE: false,
  LOG_FILE: 'klee-private.log',
} as const

/**
 * 开发模式配置
 */
export const DEV_CONFIG = {
  SKIP_OLLAMA_CHECK: false,
  MOCK_OLLAMA: false,
  DEBUG_LOGS: process.env.NODE_ENV === 'development',
} as const

/**
 * 类型导出
 */
export type RunMode = 'cloud' | 'private'
export type OllamaSource = 'system' | 'embedded' | 'none'
export type EmbeddingModel = (typeof EMBEDDING_CONFIG.SUPPORTED_MODELS)[number]
export type FileType = (typeof FILE_STORAGE_CONFIG.SUPPORTED_FILE_TYPES)[number]

/**
 * 合并的配置对象
 */
export const LOCAL_CONFIG = {
  ollama: {
    baseUrl: OLLAMA_CONFIG.API_URL,
    port: OLLAMA_CONFIG.PORT,
    timeout: OLLAMA_CONFIG.TIMEOUT,
    detectionTimeout: OLLAMA_CONFIG.DETECTION_TIMEOUT,
    downloadTimeout: OLLAMA_CONFIG.DOWNLOAD_TIMEOUT,
    minimumVersion: '0.1.0', // 最低支持版本
  },
  vectorDb: VECTOR_DB_CONFIG,
  embedding: EMBEDDING_CONFIG,
  fileStorage: FILE_STORAGE_CONFIG,
  chat: CHAT_CONFIG,
  performance: PERFORMANCE_CONFIG,
  mode: MODE_CONFIG,
  logging: LOGGING_CONFIG,
  dev: DEV_CONFIG,
} as const
