import { DB_CHANNELS } from './ipc-channels'

// Database message type (from IPC)
export type DBLocalChatMessage = {
  id: string
  chatId: string
  role: string
  parts: string
  attachments: string
  createdAt: Date | number
}

export type LocalChatSession = {
  id: string
  title: string
  model: string
  systemPrompt?: string | null
  availableKnowledgeBaseIds: string
  availableNoteIds: string
  starred: boolean | number
  createdAt: Date | number
}

export type NewLocalChatMessage = Omit<DBLocalChatMessage, 'createdAt'>

type IPCSuccessResponse<T> = {
  success: true
  data: T
}

type IPCErrorResponse = {
  success: false
  error: string
  code: string
  details?: unknown
}

type IPCResponse<T> = IPCSuccessResponse<T> | IPCErrorResponse

type RendererDBChannel = (typeof DB_CHANNELS)[keyof typeof DB_CHANNELS]

export class IPCInvokeError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'IPCInvokeError'
  }
}

function ensureIpcRenderer() {
  const ipcRenderer = window.electron?.ipcRenderer
  if (!ipcRenderer) {
    throw new IPCInvokeError('IPC renderer is not available in the current context.')
  }
  return ipcRenderer
}

async function invokeIPC<TResult>(channel: RendererDBChannel, params?: unknown): Promise<TResult> {
  const ipcRenderer = ensureIpcRenderer()
  const response = (await ipcRenderer.invoke(channel, params)) as IPCResponse<TResult> | undefined

  if (!response) {
    throw new IPCInvokeError(`IPC channel "${channel}" returned no response.`)
  }

  if (response.success) {
    return response.data
  }

  throw new IPCInvokeError(response.error || `IPC invocation failed for channel "${channel}".`, response.code)
}

export const ipcAPI = {
  // 会话
  getConversations: () =>
    invokeIPC<LocalChatSession[]>(DB_CHANNELS.GET_CONVERSATIONS),
  getConversation: (id: string) =>
    invokeIPC<LocalChatSession | null>(DB_CHANNELS.GET_CONVERSATION, { id }),
  createConversation: (params: { id: string; title: string; model: string; systemPrompt?: string }) =>
    invokeIPC<LocalChatSession>(DB_CHANNELS.CREATE_CONVERSATION, params),
  updateConversation: (
    id: string,
    data: {
      title?: string
      starred?: boolean
      model?: string
      availableKnowledgeBaseIds?: string[]
      availableNoteIds?: string[]
    }
  ) =>
    invokeIPC<LocalChatSession>(DB_CHANNELS.UPDATE_CONVERSATION, { id, data }),
  deleteConversation: (id: string) =>
    invokeIPC<{ success: boolean }>(DB_CHANNELS.DELETE_CONVERSATION, { id }),

  // 消息
  getMessages: (chatId: string) =>
    invokeIPC<DBLocalChatMessage[]>(DB_CHANNELS.GET_MESSAGES, { chatId }),
  getLastMessage: (chatId: string) =>
    invokeIPC<DBLocalChatMessage | null>(DB_CHANNELS.GET_LAST_MESSAGE, { chatId }),
  getMessageCount: (chatId: string) =>
    invokeIPC<{ count: number }>(DB_CHANNELS.GET_MESSAGE_COUNT, { chatId }),
  createMessage: (params: Omit<NewLocalChatMessage, 'createdAt'>) =>
    invokeIPC<DBLocalChatMessage>(DB_CHANNELS.CREATE_MESSAGE, params),
  deleteMessage: (id: string) =>
    invokeIPC<{ deleted: boolean }>(DB_CHANNELS.DELETE_MESSAGE, { id }),
}

export type IPCAPI = typeof ipcAPI
