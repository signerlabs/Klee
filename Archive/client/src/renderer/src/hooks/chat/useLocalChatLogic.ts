/**
 * useLocalChatLogic Hook
 *
 * Private Mode 专用的聊天逻辑
 *
 * 特点：
 * - 使用 Ollama 本地模型进行对话
 * - 通过 IPC 保存消息到本地 SQLite
 * - 支持流式响应
 * - 完全离线运行
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { generateUUID } from '@/lib/utils'
import { ollama, DEFAULT_MODEL } from '@/lib/ollama-client'
import { ipcAPI } from '@/lib/ipc-helpers'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import type { LocalChatMessage } from '@/types'
import { streamText, type ChatStatus, type ModelMessage } from 'ai'

const parseIdList = (raw?: string): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const areIdListsEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, index) => value === sortedB[index])
}

interface UseLocalChatLogicOptions {
  chatId?: string
  initialMessages?: LocalChatMessage[]
  initialModel?: string
  knowledgeBaseIds?: string[] // 关联的知识库 ID 列表
  noteIds?: string[] // 关联的笔记 ID 列表
  onFinish?: () => void
}

/**
 * Private Mode 聊天逻辑
 *
 * @example
 * ```tsx
 * const chat = useLocalChatLogic({
 *   chatId: 'some-uuid',
 *   initialModel: 'llama3:8b',
 *   onFinish: () => console.log('Message sent')
 * })
 *
 * // 发送消息
 * chat.handleSubmit({ text: 'Hello' })
 *
 * // 渲染消息
 * chat.messages.map(msg => <div>{msg.content}</div>)
 * ```
 */
export function useLocalChatLogic(options: UseLocalChatLogicOptions = {}) {
  const { chatId, initialMessages, initialModel, knowledgeBaseIds = [], noteIds = [], onFinish } = options

  const queryClient = useQueryClient()

  // 模型状态
  const [model, setModel] = useState<string>(initialModel ?? DEFAULT_MODEL)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [messages, setMessages] = useState<LocalChatMessage[]>([])
  const [ragContext, setRagContext] = useState<string>('') // RAG 检索上下文
  const [isSearching, setIsSearching] = useState(false) // RAG 检索状态
  const abortControllerRef = useRef<AbortController | null>(null)

  // 如果提供了 initialMessages,使用它们;否则从 IPC 加载
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      // 使用提供的初始消息
      const formatted = initialMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      }))
      setMessages(formatted)
    } else if (chatId) {
      // 从 IPC 加载消息
      ipcAPI
        .getMessages(chatId)
        .then((dbMessages) => {
          const formatted = dbMessages.map((msg) => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: JSON.parse(msg.parts)[0]?.text || '',
            createdAt: typeof msg.createdAt === 'number' ? new Date(msg.createdAt) : msg.createdAt,
          }))
          setMessages(formatted)
        })
        .catch((error) => {
          console.error('[Local Chat] Failed to load messages:', error)
        })
    }
  }, [chatId, initialMessages])

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setStatus('ready')
    }
  }, [])

  // 加载会话元数据（模型等），用于在重新进入聊天时恢复配置
  useEffect(() => {
    if (!chatId) return

    ipcAPI
      .getConversation(chatId)
      .then((conversation) => {
        if (conversation?.model) {
          setModel(conversation.model)
        }
      })
      .catch((error) => {
        console.error('[Local Chat] Failed to load conversation metadata:', error)
      })
  }, [chatId])

  const buildMessagesForAI = useCallback(
    (chatMessages: LocalChatMessage[], ragContext?: string): ModelMessage[] => {
      const baseMessages = chatMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })) as ModelMessage[]

      console.log('[Local Chat RAG] 🔧 Building messages for AI...')
      console.log('[Local Chat RAG] 💬 Base messages count:', baseMessages.length)
      console.log('[Local Chat RAG] 📚 RAG context provided:', ragContext ? 'YES' : 'NO')

      // 如果有 RAG 上下文,将其注入为系统消息
      if (ragContext && baseMessages.length > 0) {
        const systemContent = `You have access to the following information from the knowledge base. Use it to answer the user's questions when relevant:\n\n${ragContext}`
        const systemMessage = {
          role: 'system',
          content: systemContent,
        } as ModelMessage

        console.log('[Local Chat RAG] ✅ Injecting RAG context as system message')
        console.log('[Local Chat RAG] 📏 System message length:', systemContent.length, 'chars')
        console.log('[Local Chat RAG] 🎯 System message preview:', systemContent.substring(0, 300) + '...')

        const finalMessages = [systemMessage, ...baseMessages]
        console.log('[Local Chat RAG] 📤 Final messages to send to Ollama:', finalMessages.length)
        console.log('[Local Chat RAG] 🗂️ Final messages structure:', finalMessages.map(m => ({
          role: m.role,
          contentType: typeof m.content,
          contentLength: typeof m.content === 'string' ? m.content.length : 'N/A'
        })))

        return finalMessages
      }

      console.log('[Local Chat RAG] ℹ️ No RAG context, sending messages as-is')
      return baseMessages
    },
    []
  )

  /**
   * 发送消息到本地 Ollama
   */
  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!message.text?.trim()) return

      setInput('')
      setStatus('submitted')

      // 0. 确保聊天会话存在（新会话时创建）
      if (!chatId) {
        console.error('[Local Chat] No chat ID provided')
        setStatus('ready')
        return
      }

      // 动态获取最新的知识库 IDs 和笔记 IDs (从 options 中获取最新值)
      const currentKnowledgeBaseIds = options.knowledgeBaseIds || []
      const currentNoteIds = options.noteIds || []
      console.log('[Local Chat RAG] 🔄 Current knowledge base IDs at submit time:', currentKnowledgeBaseIds)
      console.log('[Local Chat RAG] 🔄 Current note IDs at submit time:', currentNoteIds)

      // 检查会话是否存在，如果不存在则创建
      // 使用本地变量存储当前应该使用的模型，避免状态更新延迟
      const currentModel = model && model.trim().length > 0 ? model : DEFAULT_MODEL

      try {
        const existingConversation = await ipcAPI.getConversation(chatId)
        const updates: {
          model?: string
          availableKnowledgeBaseIds?: string[]
          availableNoteIds?: string[]
        } = {}

        if (!existingConversation) {
          await ipcAPI.createConversation({
            id: chatId,
            title: message.text.slice(0, 50) + (message.text.length > 50 ? '...' : ''),
            model: currentModel,
          })

          if (currentKnowledgeBaseIds.length > 0) {
            updates.availableKnowledgeBaseIds = currentKnowledgeBaseIds
          }

          if (currentNoteIds.length > 0) {
            updates.availableNoteIds = currentNoteIds
          }
        } else {
          const storedKbIds = parseIdList(existingConversation.availableKnowledgeBaseIds)
          const storedNoteIds = parseIdList(existingConversation.availableNoteIds)

          if (existingConversation.model !== currentModel) {
            updates.model = currentModel
          }

          if (!areIdListsEqual(storedKbIds, currentKnowledgeBaseIds)) {
            updates.availableKnowledgeBaseIds = currentKnowledgeBaseIds
          }

          if (!areIdListsEqual(storedNoteIds, currentNoteIds)) {
            updates.availableNoteIds = currentNoteIds
          }
        }

        if (Object.keys(updates).length > 0) {
          try {
            await ipcAPI.updateConversation(chatId, updates)
          } catch (error) {
            console.error('[Local Chat] Failed to persist conversation configuration:', error)
          }
        }

        setModel(currentModel)
      } catch (error) {
        console.error('[Local Chat] Failed to ensure conversation exists:', error)
      }

      // 1. 添加用户消息
      const userMessageId = generateUUID()
      const userMessage = {
        id: userMessageId,
        role: 'user' as const,
        content: message.text,
        createdAt: new Date(),
      }

      // 保存用户消息到本地数据库
      try {
        await ipcAPI.createMessage({
          id: userMessageId,
          chatId,
          role: 'user',
          parts: JSON.stringify([{ type: 'text', text: message.text }]),
          attachments: '[]',
        })
      } catch (error) {
        console.error('[Local Chat] Failed to save user message:', error)
      }

      // 添加到 UI
      setMessages((prev) => [...prev, userMessage])

      // 2. 如果关联了知识库或笔记,执行 RAG 检索
      console.log('[Local Chat RAG] 🎯 Checking knowledge base IDs before search:', currentKnowledgeBaseIds)
      console.log('[Local Chat RAG] 🎯 Knowledge base IDs length:', currentKnowledgeBaseIds.length)
      console.log('[Local Chat RAG] 🎯 Checking note IDs before search:', currentNoteIds)
      console.log('[Local Chat RAG] 🎯 Note IDs length:', currentNoteIds.length)

      let kbContext = ''
      let noteContext = ''

      // 2a. 搜索知识库
      if (currentKnowledgeBaseIds.length > 0) {
        console.log('[Local Chat RAG] 🔍 Starting search with knowledge bases:', currentKnowledgeBaseIds)
        console.log('[Local Chat RAG] 📝 User query:', message.text)

        try {
          setIsSearching(true)
          const searchResult = await window.api.knowledgeBase.search(
            message.text,
            currentKnowledgeBaseIds,
            5
          )

          console.log('[Local Chat RAG] 📦 KB search result received:', searchResult)

          // 检查 IPC 响应是否成功 (格式: { success: true, data: { results: [...] } })
          if ('success' in searchResult && searchResult.success && searchResult.data) {
            console.log('[Local Chat RAG] 🔎 KB search result data:', searchResult.data)
            const results = searchResult.data.results as any[]

            console.log('[Local Chat RAG] 📊 Found KB results:', results ? results.length : 0)

            if (results && results.length > 0) {
              // 格式化检索结果
              kbContext = results
                .map(
                  (result, index) => {
                    console.log(`[Local Chat RAG] 📄 KB Result ${index + 1}:`, {
                      fileName: result.fileName,
                      similarity: result.similarity.toFixed(3),
                      contentPreview: result.content.substring(0, 100) + '...'
                    })
                    return `[Document ${index + 1}] (from ${result.fileName})\n${result.content}\n`
                  }
                )
                .join('\n')

              console.log('[Local Chat RAG] ✅ KB context prepared, total length:', kbContext.length, 'chars')
            } else {
              console.log('[Local Chat RAG] ⚠️ No KB results found for query')
            }
          }
        } catch (error) {
          console.error('[Local Chat RAG] ❌ KB search failed:', error)
          // 检索失败不应阻止聊天,继续执行
        } finally {
          setIsSearching(false)
        }
      } else {
        console.log('[Local Chat RAG] ℹ️ No knowledge bases associated with this chat')
      }

      // 2b. 搜索笔记
      if (currentNoteIds.length > 0) {
        console.log('[Local Chat RAG] 📝 Starting search with notes:', currentNoteIds)
        console.log('[Local Chat RAG] 📝 User query:', message.text)

        try {
          setIsSearching(true)
          const searchResult = await window.api.note.search({
            query: message.text,
            noteIds: currentNoteIds,
            limit: 5
          })

          console.log('[Local Chat RAG] 📦 Note search result received:', searchResult)

          // 检查 IPC 响应是否成功
          if ('success' in searchResult && searchResult.success && searchResult.data) {
            console.log('[Local Chat RAG] 🔎 Note search result data:', searchResult.data)
            const results = searchResult.data as any[]

            console.log('[Local Chat RAG] 📊 Found note results:', results ? results.length : 0)

            if (results && results.length > 0) {
              // 格式化笔记检索结果
              noteContext = results
                .map(
                  (result, index) => {
                    console.log(`[Local Chat RAG] 📝 Note Result ${index + 1}:`, {
                      sourceName: result.sourceName,
                      similarity: result.similarity.toFixed(3),
                      contentPreview: result.content.substring(0, 100) + '...'
                    })
                    return `[Note ${index + 1}] (from "${result.sourceName}")\n${result.content}\n`
                  }
                )
                .join('\n')

              console.log('[Local Chat RAG] ✅ Note context prepared, total length:', noteContext.length, 'chars')
            } else {
              console.log('[Local Chat RAG] ⚠️ No note results found for query')
            }
          }
        } catch (error) {
          console.error('[Local Chat RAG] ❌ Note search failed:', error)
          // 检索失败不应阻止聊天,继续执行
        } finally {
          setIsSearching(false)
        }
      } else {
        console.log('[Local Chat RAG] ℹ️ No notes associated with this chat')
      }

      // 2c. 合并知识库和笔记的搜索结果
      let searchContext = ''
      if (kbContext && noteContext) {
        searchContext = `Knowledge Base Documents:\n\n${kbContext}\n\nNotes:\n\n${noteContext}`
      } else if (kbContext) {
        searchContext = kbContext
      } else if (noteContext) {
        searchContext = noteContext
      }

      if (searchContext) {
        setRagContext(searchContext)
        console.log('[Local Chat RAG] ✅ Combined RAG context prepared, total length:', searchContext.length, 'chars')
        console.log('[Local Chat RAG] 📋 Context preview:', searchContext.substring(0, 200) + '...')
      }

      console.log('[Local Chat RAG] 📋 Search context final result:', searchContext ? `${searchContext.length} chars` : 'EMPTY')

      // 3. 准备消息历史 (注入 RAG 上下文)
      const messagesForAI = buildMessagesForAI([...messages, userMessage], searchContext)
      console.log('[Local Chat RAG] 🎬 Ready to send to Ollama, messages count:', messagesForAI.length)

      // 3. 调用 Ollama 流式生成
      const assistantMessageId = generateUUID()
      let fullResponse = ''
      const assistantMessage: LocalChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
      }

      try {
        // 创建占位符助手消息
        setMessages((prev) => [...prev, assistantMessage])
        setStatus('streaming')

        // 为当前请求创建新的 AbortController
        abortControllerRef.current?.abort()
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        // 流式生成（使用 AI SDK streamText）
        const result = await streamText({
          model: ollama(currentModel),
          messages: messagesForAI,
          abortSignal: abortController.signal,
        })

        // 处理流式响应
        for await (const textPart of result.textStream) {
          if (abortController.signal.aborted) break

          fullResponse += textPart

          // 更新 UI 中的助手消息
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, content: fullResponse } : m))
          )
        }

        // 4. 保存助手消息到本地数据库
        await ipcAPI.createMessage({
          id: assistantMessageId,
          chatId,
          role: 'assistant',
          parts: JSON.stringify([{ type: 'text', text: fullResponse }]),
          attachments: '[]',
        })

        // 5. 失效缓存
        queryClient.invalidateQueries(['local-conversations'])
        queryClient.invalidateQueries(['local-messages', chatId])

        setStatus('ready')
        abortControllerRef.current = null
        onFinish?.()
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          setStatus('ready')
          return
        }

        console.error('[Local Chat] Ollama error:', error)
        setStatus('error')
        abortControllerRef.current = null

        // 显示错误消息
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content:
                    'Error: Failed to get response from Ollama. Please make sure Ollama is running.',
                }
              : m
          )
        )

        throw error
      }
    },
    [messages, model, chatId, setMessages, queryClient, onFinish, buildMessagesForAI, options]
  )

  /**
   * 删除消息
   */
  const handleDelete = useCallback(
    async (messageId: string) => {
      try {
        // 从数据库删除
        await ipcAPI.deleteMessage(messageId)

        // 从 UI 删除
        setMessages((prev) => prev.filter((m) => m.id !== messageId))

        // 失效缓存
        queryClient.invalidateQueries(['local-messages', chatId])
      } catch (error) {
        console.error('[Local Chat] Failed to delete message:', error)
      }
    },
    [chatId, setMessages, queryClient]
  )

  /**
   * 重新生成最后一条助手消息
   */
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (!chatId) {
        console.error('[Local Chat] No chat ID provided for regeneration')
        return
      }

      // 找到要重新生成的消息的索引
      const messageIndex = messages.findIndex((m) => m.id === messageId)
      if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') {
        console.error('[Local Chat] Invalid message for regeneration')
        return
      }

      setStatus('submitted')

      // 获取该消息之前的所有消息（用于上下文）
      const contextMessages = messages.slice(0, messageIndex)

      // 删除旧的助手消息
      await handleDelete(messageId)

      // 准备消息历史
      // 生成新的响应
      const newAssistantMessageId = generateUUID()
      let fullResponse = ''
      const assistantMessage: LocalChatMessage = {
        id: newAssistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
      }

      try {
        setMessages((prev) => [...prev, assistantMessage])
        setStatus('streaming')

        abortControllerRef.current?.abort()
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        const result = await streamText({
          model: ollama(model),
          messages: buildMessagesForAI(contextMessages),
          abortSignal: abortController.signal,
        })

        for await (const textPart of result.textStream) {
          if (abortController.signal.aborted) break

          fullResponse += textPart

          setMessages((prev) =>
            prev.map((m) => (m.id === newAssistantMessageId ? { ...m, content: fullResponse } : m))
          )
        }

        // 保存新消息
        try {
          await ipcAPI.createMessage({
            id: newAssistantMessageId,
            chatId,
            role: 'assistant',
            parts: JSON.stringify([{ type: 'text', text: fullResponse }]),
            attachments: '[]',
          })
        } catch (error) {
          console.error('[Local Chat] Failed to save regenerated assistant message:', error)
        }

        queryClient.invalidateQueries(['local-messages', chatId])

        setStatus('ready')
        abortControllerRef.current = null
        onFinish?.()
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          setStatus('ready')
          return
        }

        console.error('[Local Chat] Regenerate error:', error)
        setStatus('error')
        abortControllerRef.current = null
        throw error
      }
    },
    [messages, model, chatId, handleDelete, queryClient, onFinish, buildMessagesForAI]
  )

  return {
    input,
    setInput,
    model,
    setModel,
    messages,
    status,
    handleSubmit,
    handleDelete,
    handleRegenerate,
    stop,
    chatId,
    ragContext,
    isSearching,
  }
}

export type { LocalChatMessage }
