import { ipcRenderer, contextBridge, shell } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on(...args: Parameters<typeof ipcRenderer.on>) {
      const [channel, listener] = args
      return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
      const [channel, ...omit] = args
      return ipcRenderer.off(channel, ...omit)
    },
    removeListener(...args: Parameters<typeof ipcRenderer.removeListener>) {
      const [channel, listener] = args
      return ipcRenderer.removeListener(channel, listener)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
      const [channel, ...omit] = args
      return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
      const [channel, ...omit] = args
      return ipcRenderer.invoke(channel, ...omit)
    },
  },
  shell: {
    openExternal: (url: string) => shell.openExternal(url),
  },
})

// --------- Expose Knowledge Base IPC API ---------
contextBridge.exposeInMainWorld('api', {
  knowledgeBase: {
    /**
     * 获取所有知识库
     */
    list: () => ipcRenderer.invoke('db:get-knowledge-bases'),

    /**
     * 创建知识库
     */
    create: (input: { name: string; description?: string }) =>
      ipcRenderer.invoke('db:create-knowledge-base', input),

    /**
     * 获取单个知识库详情
     */
    get: (id: string) => ipcRenderer.invoke('db:get-knowledge-base', { id }),

    /**
     * 更新知识库
     */
    update: (id: string, data: { name?: string; description?: string; starred?: boolean }) =>
      ipcRenderer.invoke('db:update-knowledge-base', { id, data }),

    /**
     * 删除知识库
     */
    delete: (id: string) => ipcRenderer.invoke('db:delete-knowledge-base', { id }),

    /**
     * 切换知识库星标状态
     */
    toggleStar: (id: string) => ipcRenderer.invoke('db:star-knowledge-base', { id }),

    /**
     * 上传文件到知识库
     */
    uploadFile: (input: {
      knowledgeBaseId: string
      fileBuffer: Uint8Array
      fileName: string
      fileSize: number
    }) => ipcRenderer.invoke('db:upload-document', input),

    /**
     * 删除知识库文件
     */
    deleteFile: (knowledgeBaseId: string, fileId: string) =>
      ipcRenderer.invoke('db:delete-document', { knowledgeBaseId, fileId }),

    /**
     * 在知识库中搜索
     */
    search: (query: string, knowledgeBaseIds: string[], limit: number = 5) =>
      ipcRenderer.invoke('vector:search', { query, knowledgeBaseIds, limit }),

    /**
     * 监听文件处理进度
     */
    onFileProcessingProgress: (
      callback: (progress: {
        fileId: string
        stage: string
        percent: number
        message: string
        detail?: string
      }) => void
    ) => {
      ipcRenderer.on('file-processing-progress', (_event, progress) => callback(progress))
    },

    /**
     * 监听文件处理错误
     */
    onFileProcessingError: (
      callback: (error: { fileId: string; message: string }) => void
    ) => {
      ipcRenderer.on('file-processing-error', (_event, error) => callback(error))
    },

    /**
     * 监听文件处理完成或失败
     */
    onFileProcessingComplete: (
      callback: (payload: { knowledgeBaseId: string; fileId: string; status: 'completed' | 'failed' }) => void
    ) => {
      ipcRenderer.on('file-processing-complete', (_event, payload) => callback(payload))
    },

    /**
     * 移除文件处理进度监听器
     */
    removeFileProcessingListeners: () => {
      ipcRenderer.removeAllListeners('file-processing-progress')
      ipcRenderer.removeAllListeners('file-processing-error')
      ipcRenderer.removeAllListeners('file-processing-complete')
    },
  },

  /**
   * 磁盘空间 API
   */
  diskSpace: {
    /**
     * 获取 Ollama 磁盘空间信息
     */
    get: () => ipcRenderer.invoke('disk-space:get'),
  },

  /**
   * 模型管理 API
   */
  model: {
    /**
     * 删除模型
     * @param modelId - 模型 ID（如 'llama3:8b'）
     * @param force - 是否强制删除（可选，默认 false）
     */
    delete: (modelId: string, force?: boolean) =>
      ipcRenderer.invoke('model:delete', modelId, force),

    /**
     * 检查模型是否被使用
     * @param modelId - 模型 ID（如 'llama3:8b'）
     */
    checkInUse: (modelId: string) => ipcRenderer.invoke('model:check-in-use', modelId),
  },

  /**
   * Ollama API (Private Mode)
   */
  ollama: {
    /**
     * 获取已安装的模型列表
     */
    listModels: () => ipcRenderer.invoke('ollama:list-models'),

    /**
     * 下载模型
     * @param modelName - 模型名称（如 'llama3:8b'）
     */
    pullModel: (modelName: string) => ipcRenderer.invoke('ollama:pull-model', modelName),

    /**
     * 监听模型下载进度
     */
    onPullProgress: (
      callback: (progress: {
        modelName: string
        status: string
        percent: number
        total?: number
        completed?: number
        error?: string
      }) => void
    ) => {
      ipcRenderer.on('ollama:pull-progress', (_event, progress) => callback(progress))
      return () => ipcRenderer.removeAllListeners('ollama:pull-progress')
    },
  },

  /**
   * 笔记 API (Private Mode)
   */
  note: {
    /**
     * 获取所有笔记
     */
    list: () => ipcRenderer.invoke('db:notes:list'),

    /**
     * 获取单个笔记
     */
    get: (request: { noteId: string }) => ipcRenderer.invoke('db:notes:get', request),

    /**
     * 创建笔记
     */
    create: (request: { title: string; content?: string }) =>
      ipcRenderer.invoke('db:notes:create', request),

    /**
     * 更新笔记
     */
    update: (request: { noteId: string; data: { title?: string; content?: string; starred?: boolean } }) =>
      ipcRenderer.invoke('db:notes:update', request),

    /**
     * 删除笔记
     */
    delete: (request: { noteId: string }) => ipcRenderer.invoke('db:notes:delete', request),

    /**
     * 生成笔记 embeddings
     */
    embed: (request: { noteId: string }) => ipcRenderer.invoke('db:notes:embed', request),

    /**
     * RAG 向量搜索
     */
    search: (request: { query: string; noteIds: string[]; limit?: number }) =>
      ipcRenderer.invoke('db:notes:search', request),

    /**
     * 监听 embedding 进度
     */
    onEmbeddingProgress: (callback: (event: { noteId: string; percent: number; message: string }) => void) => {
      ipcRenderer.on('db:notes:embedding-progress', (_event, data) => callback(data))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-progress')
    },

    /**
     * 监听 embedding 完成
     */
    onEmbeddingComplete: (callback: (event: { noteId: string; chunksCount: number }) => void) => {
      ipcRenderer.on('db:notes:embedding-complete', (_event, data) => callback(data))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-complete')
    },

    /**
     * 监听 embedding 失败
     */
    onEmbeddingFailed: (callback: (event: { noteId: string; error: string }) => void) => {
      ipcRenderer.on('db:notes:embedding-failed', (_event, data) => callback(data))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-failed')
    },
  },
})
