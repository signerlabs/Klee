import { useState, useMemo, useCallback, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport } from 'ai'
import { llmModels } from '@config/models'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import { emitChatUpdated } from '@/lib/chat-events'
import { generateUUID } from '@/lib/utils'
import { useChatContext } from '@/contexts/ChatContext'
import { conversationKeys } from '@/lib/queryKeys'
import { useChatConfigDetail } from '@/hooks/chat-config/queries/useChatConfigDetail'
import { supabase } from '@/lib/supabase'

type UseChatLogicOptions = {
  chatId?: string
  initialMessages?: ReturnType<typeof useChat>['messages']
  resume?: boolean
  initialModel?: string
  initialWebSearch?: boolean
  initialKnowledgeBaseIds?: string[]
  initialNoteIds?: string[]
  onFinish?: () => void
}

export function useChatLogic(options: UseChatLogicOptions = {}) {
  const {
    chatId,
    initialMessages,
    resume,
    initialModel,
    initialWebSearch,
    initialKnowledgeBaseIds,
    initialNoteIds,
    onFinish,
  } = options

  const [input, setInput] = useState('')
  const queryClient = useQueryClient()

  // 尝试从 ChatContext 获取状态
  let chatContext
  try {
    chatContext = useChatContext()
  } catch {
    chatContext = null
  }

  // 模型和 webSearch 状态
  const [localModel, setLocalModel] = useState<string>(initialModel ?? llmModels[0].value)
  const [localWebSearch, setLocalWebSearch] = useState<boolean>(initialWebSearch ?? false)
  const model = chatContext?.selectedModel ?? localModel
  const setModel = chatContext?.setSelectedModel ?? setLocalModel
  const webSearch = chatContext?.webSearchEnabled ?? localWebSearch
  const setWebSearch = chatContext?.setWebSearchEnabled ?? setLocalWebSearch

  // ===== 本地状态（用于没有 Context 的情况） =====
  const [localSelectedKnowledgeBaseIds, setLocalSelectedKnowledgeBaseIds] = useState<string[]>(
    initialKnowledgeBaseIds ?? []
  )
  const [localSelectedNoteIds, setLocalSelectedNoteIds] = useState<string[]>(initialNoteIds ?? [])

  // 使用 Context 或本地状态（知识库 + 笔记）
  const selectedKnowledgeBaseIds =
    chatContext?.selectedKnowledgeBaseIds ?? localSelectedKnowledgeBaseIds
  const setSelectedKnowledgeBaseIds =
    chatContext?.setSelectedKnowledgeBaseIds ?? setLocalSelectedKnowledgeBaseIds

  const selectedNoteIds = chatContext?.selectedNoteIds ?? localSelectedNoteIds
  const setSelectedNoteIds = chatContext?.setSelectedNoteIds ?? setLocalSelectedNoteIds

  // 获取选中的 Agent ID
  const selectedAgentId = chatContext?.selectedAgentId

  // 加载选中 Agent 的详细配置（包含关联的知识库）
  const { data: agentDetailResponse } = useChatConfigDetail(selectedAgentId)
  const agentConfig =
    agentDetailResponse && 'config' in agentDetailResponse ? agentDetailResponse.config : null
  const agentKnowledgeBases =
    agentDetailResponse && 'knowledgeBases' in agentDetailResponse
      ? agentDetailResponse.knowledgeBases
      : []

  // 当选择 Agent 时，应用其配置（模型 + webSearch + 关联知识库）
  useEffect(() => {
    if (selectedAgentId && agentConfig) {
      setModel(agentConfig.defaultModel)
      setWebSearch(agentConfig.webSearchEnabled)

      if (chatContext?.setSelectedKnowledgeBaseIds && agentKnowledgeBases.length > 0) {
        const kbIds = agentKnowledgeBases.map((kb: any) => kb.id)
        chatContext.setSelectedKnowledgeBaseIds(kbIds)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId, agentConfig, agentKnowledgeBases, setModel, setWebSearch, chatContext])

  // 当切换聊天或加载配置时，同步初始配置
  useEffect(() => {
    // 如果选中了 Agent，不覆盖 Agent 的配置
    if (selectedAgentId) return

    if (initialModel) setModel(initialModel)
    if (initialWebSearch !== undefined) setWebSearch(initialWebSearch)

    if (
      initialKnowledgeBaseIds !== undefined &&
      chatContext?.setSelectedKnowledgeBaseIds
    ) {
      chatContext.setSelectedKnowledgeBaseIds(initialKnowledgeBaseIds)
    }

    if (initialNoteIds !== undefined && chatContext?.setSelectedNoteIds) {
      chatContext.setSelectedNoteIds(initialNoteIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chatId,
    initialModel,
    initialWebSearch,
    initialKnowledgeBaseIds,
    initialNoteIds,
    selectedAgentId,
    chatContext,
    setModel,
    setWebSearch,
  ])

  // ===== 聊天传输配置 =====
  const generateId = useCallback(() => generateUUID(), [])

  // 获取 API Base URL
  const apiBaseUrl = import.meta.env.DEV
    ? '' // 开发环境使用相对路径（Vite 代理）
    : import.meta.env.VITE_API_URL || 'http://rafa-prod.eba-mmc3gc5h.us-east-1.elasticbeanstalk.com'

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${apiBaseUrl}/api/chat`,
        credentials: 'include',
        // 添加认证 headers
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers)

          // 获取 Supabase session token
          const { data } = await supabase!.auth.getSession()
          if (data.session?.access_token) {
            headers.set('Authorization', `Bearer ${data.session.access_token}`)
          }

          return fetch(input, {
            ...init,
            headers,
          })
        },
        prepareSendMessagesRequest({ id, messages, body, trigger, messageId }) {
          const payload: Record<string, unknown> = {
            id,
            model: body?.model,
            webSearch: body?.webSearch,
            knowledgeBaseIds: body?.knowledgeBaseIds,
            noteIds: body?.noteIds,
            trigger,
            messageId,
          }

          const lastMessage = messages[messages.length - 1]
          if (lastMessage) payload.message = lastMessage

          return { body: payload }
        },
      }),
    [apiBaseUrl]
  )

  const chat = useChat({
    id: chatId,
    messages: initialMessages,
    resume: resume ?? false,
    transport,
    generateId,
    experimental_throttle: 100,
  })

  const { messages, sendMessage, setMessages, status, regenerate, id: activeChatId } = chat

  const lastAssistantMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'assistant') {
        return messages[index].id
      }
    }
    return undefined
  }, [messages])

  // ===== 发送消息 =====
  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const hasText =
        Boolean(message.text) || (Array.isArray(message.files) && message.files.length > 0)
      if (!hasText) return

      setInput('')

      const sendPromise = sendMessage(
        { text: message.text || 'Sent with attachments' },
        {
          body: {
            model,
            webSearch,
            knowledgeBaseIds: selectedKnowledgeBaseIds,
            noteIds: selectedNoteIds,
          },
        }
      )

      return sendPromise
        .then(() => {
          emitChatUpdated()
          onFinish?.()
          queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
        })
        .catch((error) => {
          console.error('sendMessage error:', error)
          throw error
        })
    },
    [sendMessage, model, webSearch, selectedKnowledgeBaseIds, selectedNoteIds, setInput]
  )

  // ===== 删除消息 =====
  const handleDelete = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }

  // ===== 重新生成 =====
  const handleRegenerate = (messageId: string) => {
    const regeneratePromise = regenerate({
      messageId,
      body: {
        model,
        webSearch,
        knowledgeBaseIds: selectedKnowledgeBaseIds,
        noteIds: selectedNoteIds,
      },
    })

    void regeneratePromise
      .then(() => {
        emitChatUpdated()
        onFinish?.()
      })
      .catch((error) => {
        console.error('regenerate error:', error)
      })
  }

  return {
    input,
    setInput,
    model,
    setModel,
    webSearch,
    setWebSearch,
    selectedKnowledgeBaseIds,
    setSelectedKnowledgeBaseIds,
    selectedNoteIds,
    setSelectedNoteIds,
    messages,
    status,
    lastAssistantMessageId,
    handleSubmit,
    handleDelete,
    handleRegenerate,
    chatId: activeChatId,
    isUsingAgent: !!selectedAgentId,
  }
}
