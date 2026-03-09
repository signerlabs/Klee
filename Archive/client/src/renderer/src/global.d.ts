/**
 * Global Type Declarations
 *
 * 定义全局的类型声明,包括 Electron IPC API
 */

interface AggregateError extends Error {
  errors: any[]
}

declare var AggregateError: {
  new (errors?: Iterable<any>, message?: string): AggregateError
  (errors?: Iterable<any>, message?: string): AggregateError
  readonly prototype: AggregateError
}

/**
 * 扩展 Window 接口,添加 Electron 和 API 对象
 */
declare global {
  /**
   * 文件处理进度
   */
  interface FileProcessingProgress {
    fileId: string
    stage: 'validating' | 'saving' | 'extracting' | 'chunking' | 'embedding' | 'storing' | 'completed' | 'failed'
    percent: number
    message: string
    detail?: string
  }

  /**
   * 文件处理错误
   */
  interface FileProcessingError {
    fileId: string
    knowledgeBaseId?: string
    message: string
  }

  /**
   * 知识库创建输入
   */
  interface CreateKnowledgeBaseInput {
    name: string
    description?: string
  }

  /**
   * 知识库更新输入
   */
  interface UpdateKnowledgeBaseInput {
    name?: string
    description?: string
    starred?: boolean
  }

  /**
   * 文件上传输入
   */
  interface UploadFileInput {
    knowledgeBaseId: string
    fileBuffer: Uint8Array
    fileName: string
    fileSize: number
    fileType?: string
  }

  /**
   * 向量搜索输入
   */
  interface SearchKnowledgeBaseInput {
    query: string
    knowledgeBaseIds: string[]
    limit?: number
  }

  /**
   * 知识库 API 返回类型
   */
  interface KnowledgeBase {
    id: string
    name: string
    description: string | null
    starred: boolean
    createdAt: Date | string | number // 支持多种时间格式
    updatedAt?: Date | string | number // Private Mode 可能没有此字段
  }

  /**
   * 知识库文件返回类型
   */
  interface KnowledgeBaseFile {
    id: string
    knowledgeBaseId: string
    fileName: string
    fileSize: number
    fileType: string | null
    storagePath: string | null
    contentText: string | null
    status: 'processing' | 'completed' | 'failed'
    createdAt: Date | string | number // 支持多种时间格式
  }

  /**
   * 向量搜索结果
   */
  interface VectorSearchResult {
    content: string
    score: number
    fileId: string
    fileName: string
  }

  /**
   * IPC 响应包装器
   */
  interface IPCSuccessResponse<T> {
    success: true
    data: T
  }

  interface IPCErrorResponse {
    success: false
    error: string
    code: string
  }

  type IPCResponse<T> = IPCSuccessResponse<T> | IPCErrorResponse

  interface Window {
    /**
     * Electron IPC Renderer (通用)
     */
    electron: {
      ipcRenderer: {
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
        off: (channel: string, listener?: (...args: any[]) => void) => void
        removeListener: (channel: string, listener: (...args: any[]) => void) => void
        send: (channel: string, ...args: any[]) => void
        invoke: (channel: string, ...args: any[]) => Promise<any>
      }
      shell: {
        openExternal: (url: string) => Promise<void>
      }
    }

    /**
     * Knowledge Base IPC API (类型安全)
     */
    api: {
      knowledgeBase: {
        /**
         * 获取所有知识库
         */
        list: () => Promise<IPCResponse<{ knowledgeBases: KnowledgeBase[] }>>

        /**
         * 创建知识库
         */
        create: (input: CreateKnowledgeBaseInput) => Promise<IPCResponse<{ knowledgeBase: KnowledgeBase }>>

        /**
         * 获取单个知识库详情
         */
        get: (id: string) => Promise<IPCResponse<{
          knowledgeBase: KnowledgeBase
          files: KnowledgeBaseFile[]
        }>>

        /**
         * 更新知识库
         */
        update: (
          id: string,
          input: UpdateKnowledgeBaseInput
        ) => Promise<IPCResponse<{ knowledgeBase: KnowledgeBase }>>

        /**
         * 删除知识库
         */
        delete: (id: string) => Promise<IPCResponse<{ deleted: boolean }>>

        /**
         * 切换知识库星标状态
         */
        toggleStar: (id: string) => Promise<IPCResponse<{ knowledgeBase: KnowledgeBase }>>

        /**
         * 上传文件到知识库
         */
        uploadFile: (input: UploadFileInput) => Promise<IPCResponse<{
          fileId: string
          status: 'processing'
        }>>

        /**
         * 删除知识库文件
         */
        deleteFile: (knowledgeBaseId: string, fileId: string) => Promise<IPCResponse<{ deleted: boolean }>>

        /**
         * 在知识库中搜索
         */
        search: (query: string, knowledgeBaseIds: string[], limit?: number) => Promise<IPCResponse<{
          results: VectorSearchResult[]
        }>>

        /**
         * 监听文件处理进度
         */
        onFileProcessingProgress?: (callback: (progress: FileProcessingProgress) => void) => void

        /**
         * 监听文件处理错误
         */
        onFileProcessingError?: (callback: (error: FileProcessingError) => void) => void

        /**
         * 监听文件处理完成或失败
         */
        onFileProcessingComplete?: (
          callback: (payload: { knowledgeBaseId: string; fileId: string; status: 'completed' | 'failed' }) => void
        ) => void

        /**
         * 移除文件处理进度监听器
         */
        removeFileProcessingListeners?: () => void
      }

      /**
       * 磁盘空间 API
       */
      diskSpace: {
        /**
         * 获取 Ollama 磁盘空间信息
         */
        get: () => Promise<{
          success: boolean
          data?: {
            totalBytes: number
            availableBytes: number
            freeBytes: number
            usedBytes: number
            percentUsed: number
            totalFormatted: string
            availableFormatted: string
            freeFormatted: string
            usedFormatted: string
          }
          error?: string
        }>
      }

      /**
       * 模型管理 API
       */
      model: {
        /**
         * 删除模型
         */
        delete: (modelId: string, force?: boolean) => Promise<{
          success: boolean
          data?: {
            deleted: boolean
            modelId: string
          }
          error?: string
        }>

        /**
         * 检查模型是否正在使用
         */
        checkInUse: (modelId: string) => Promise<{
          success: boolean
          data?: {
            inUse: boolean
            sessions: Array<{ id: string; name: string }>
          }
          error?: string
        }>
      }

      /**
       * Ollama API (Private Mode)
       */
      ollama: {
        /**
         * 获取已安装的模型列表
         */
        listModels: () => Promise<{
          success: boolean
          data?: Array<{
            name: string
            size: number
            modified_at: string
          }>
          error?: string
        }>

        /**
         * 下载模型
         */
        pullModel: (modelName: string) => Promise<{
          success: boolean
          error?: string
        }>

        /**
         * 监听模型下载进度
         */
        onPullProgress?: (
          callback: (progress: {
            modelName: string
            status: string
            percent: number
            total?: number
            completed?: number
            error?: string
          }) => void
        ) => () => void
      }

      /**
       * 笔记 API (Private Mode)
       */
      note: {
        /**
         * 获取所有笔记
         */
        list: () => Promise<IPCResponse<Array<{
          id: string
          title: string
          content: string
          starred: boolean
          createdAt: Date
          updatedAt: Date
        }>>>

        /**
         * 获取单个笔记
         */
        get: (request: { noteId: string }) => Promise<IPCResponse<{
          id: string
          title: string
          content: string
          starred: boolean
          createdAt: Date
          updatedAt: Date
        }>>

        /**
         * 创建笔记
         */
        create: (request: {
          id: string
          title: string
          content?: string
        }) => Promise<IPCResponse<{
          id: string
          title: string
          content: string
          starred: boolean
          createdAt: Date
          updatedAt: Date
        }>>

        /**
         * 更新笔记
         */
        update: (request: {
          noteId: string
          data: {
            title?: string
            content?: string
            starred?: boolean
          }
        }) => Promise<IPCResponse<{
          id: string
          title: string
          content: string
          starred: boolean
          createdAt: Date
          updatedAt: Date
        }>>

        /**
         * 删除笔记
         */
        delete: (request: { noteId: string }) => Promise<IPCResponse<void>>

        /**
         * 生成笔记 embeddings
         */
        embed: (request: { noteId: string }) => Promise<IPCResponse<{
          chunksCount: number
          textLength: number
        }>>

        /**
         * 搜索笔记（RAG）
         */
        search: (request: {
          query: string
          noteIds: string[]
          limit?: number
        }) => Promise<IPCResponse<Array<{
          content: string
          similarity: number
          sourceType: 'note'
          sourceId: string
          sourceName: string
        }>>>

        /**
         * 监听 embedding 进度
         */
        onEmbeddingProgress?: (callback: (event: {
          noteId: string
          percent: number
          message: string
        }) => void) => () => void

        /**
         * 监听 embedding 完成
         */
        onEmbeddingComplete?: (callback: (event: {
          noteId: string
          chunksCount: number
        }) => void) => () => void

        /**
         * 监听 embedding 失败
         */
        onEmbeddingFailed?: (callback: (event: {
          noteId: string
          error: string
        }) => void) => () => void
      }
    }
  }
}

export {}
