import { createFileRoute, Outlet, useParams } from '@tanstack/react-router'
import { useState, useMemo, useEffect, useRef } from 'react'
import { SidebarRight } from '@/components/layout/sidebar-right/sidebar-right'
import { ChatContextProvider } from '@/contexts/ChatContext'
import { useKnowledgeBases } from '@/hooks/knowledge-base/queries/useKnowledgeBases'
import { useChatConfigs } from '@/hooks/chat-config/queries/useChatConfigs'
import { useNotes } from '@/hooks/note/queries/useNotes'
import { useMode } from '@/contexts/ModeContext'
import { ipcAPI } from '@/lib/ipc-helpers'
import { llmModels } from '@config/models'
import { DEFAULT_MODEL } from '@/lib/ollama-client'

function ChatShellComponent() {
  const { isPrivateMode } = useMode()
  const params = useParams({ strict: false }) as { chatId?: string }
  const chatId = params?.chatId

  // 状态管理：选中的知识库、Agent、笔记
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>(
    () => (isPrivateMode ? DEFAULT_MODEL : llmModels[0]?.value ?? '')
  )
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])

  // Private Mode: 本地知识库和笔记列表
  const [privateKnowledgeBases, setPrivateKnowledgeBases] = useState<any[]>([])
  const [privateNotes, setPrivateNotes] = useState<any[]>([])

  // 用于防止重复保存的标记
  const isLoadingRef = useRef(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ===== 加载知识库 =====
  const { data: knowledgeBaseResponse, error: kbError } = useKnowledgeBases()
  const knowledgeBaseData = knowledgeBaseResponse?.knowledgeBases ?? []

  // 调试: 记录渲染次数并在 chatId 变化时重置
  const renderCountRef = useRef(0)
  const prevChatIdRef = useRef(chatId)

  // chatId 变化时重置计数器
  if (prevChatIdRef.current !== chatId) {
    renderCountRef.current = 0
    prevChatIdRef.current = chatId
  }

  renderCountRef.current++

  // 警告：过度渲染检测（同一个 chatId 下超过 20 次渲染）
  if (renderCountRef.current > 20) {
    console.warn('[Chat Shell] ⚠️ Excessive renders detected:', renderCountRef.current, {
      isPrivateMode,
      chatId,
      selectedKnowledgeBaseIdsLength: selectedKnowledgeBaseIds.length,
      knowledgeBaseDataLength: knowledgeBaseData.length,
    })
  }

  // ===== 加载 Agent 配置 =====
  const { data: chatConfigResponse, error: agentError } = useChatConfigs()
  const chatConfigData =
    (chatConfigResponse && 'configs' in chatConfigResponse ? chatConfigResponse.configs : []) ?? []

  // ===== 加载笔记 =====
  const { data: noteResponse, error: noteError } = useNotes()
  const noteData = noteResponse?.note ?? []

  // ===== Private Mode: 加载本地知识库和笔记 =====
  useEffect(() => {
    if (isPrivateMode) {
      console.log('[Chat Shell] 🔍 Loading private knowledge bases and notes...')

      // 加载知识库
      window.api.knowledgeBase
        .list()
        .then((result) => {
          if (result.success && result.data?.knowledgeBases) {
            setPrivateKnowledgeBases(result.data.knowledgeBases)
            console.log(
              '[Chat Shell] 📚 Loaded',
              result.data.knowledgeBases.length,
              'knowledge bases'
            )
          }
        })
        .catch((error) => {
          console.error('[Chat Shell] ❌ Failed to load private knowledge bases:', error)
        })

      // 加载笔记
      window.api.note
        .list()
        .then((result) => {
          if (result.success && result.data) {
            setPrivateNotes(result.data)
            console.log('[Chat Shell] 📝 Loaded', result.data.length, 'notes')
          }
        })
        .catch((error) => {
          console.error('[Chat Shell] ❌ Failed to load private notes:', error)
        })
    }
  }, [isPrivateMode])

  // ===== Private Mode: 加载并验证当前会话的知识库和笔记关联 =====
  // 依赖 knowledgeBasesList 和 notesList，这样删除后会自动重新验证
  useEffect(() => {
    if (isPrivateMode && chatId) {
      console.log('[Chat Shell] 📖 Loading knowledge base and note associations for chat:', chatId)
      isLoadingRef.current = true
      ipcAPI
        .getConversation(chatId)
        .then(async (conversation) => {
          if (conversation) {
            if (conversation.model) {
              setSelectedModel(conversation.model)
            }
            const kbIds = JSON.parse(conversation.availableKnowledgeBaseIds || '[]')
            const noteIds = JSON.parse(conversation.availableNoteIds || '[]')
            console.log('[Chat Shell] ✅ Loaded knowledge base IDs (raw):', kbIds)
            console.log('[Chat Shell] ✅ Loaded note IDs (raw):', noteIds)

            // 过滤掉已删除的知识库 ID
            let validKbIds = kbIds
            if (kbIds.length > 0) {
              validKbIds = await Promise.all(
                kbIds.map(async (kbId: string) => {
                  try {
                    const result = await window.api.knowledgeBase.get(kbId)
                    // IPC 返回格式: { success: true, data: { knowledgeBase, files } } 或 { success: true, data: null }
                    // data 为 null 表示知识库不存在
                    return result.success && result.data !== null ? kbId : null
                  } catch {
                    return null
                  }
                })
              ).then((ids) => ids.filter((id): id is string => id !== null))

              console.log('[Chat Shell] ✅ Valid knowledge base IDs (after filtering):', validKbIds)

              if (validKbIds.length !== kbIds.length) {
                console.log('[Chat Shell] 🧹 Cleaning up deleted knowledge base references')
              }
            }

            // 过滤掉已删除的笔记 ID
            let validNoteIds: string[] = []
            if (noteIds.length > 0) {
              validNoteIds = await Promise.all(
                noteIds.map(async (noteId: string) => {
                  try {
                    const result = await window.api.note.get({ noteId })
                    return result.success ? noteId : null
                  } catch {
                    return null
                  }
                })
              ).then((ids) => ids.filter((id): id is string => id !== null))

              console.log('[Chat Shell] ✅ Valid note IDs (after filtering):', validNoteIds)
            }

            // 如果有知识库或笔记被删除，更新数据库
            const needsCleanup =
              validKbIds.length !== kbIds.length || validNoteIds.length !== noteIds.length

            if (needsCleanup) {
              console.log('[Chat Shell] 🧹 Cleaning up deleted references')
              ipcAPI
                .updateConversation(chatId, {
                  availableKnowledgeBaseIds: validKbIds,
                  availableNoteIds: validNoteIds,
                })
                .catch((error: any) => {
                  console.error('[Chat Shell] ❌ Failed to cleanup IDs:', error)
                })
            }

            setSelectedKnowledgeBaseIds(validKbIds)
            setSelectedNoteIds(validNoteIds)
            // 设置一个短延迟后解除加载标记
            setTimeout(() => {
              isLoadingRef.current = false
            }, 1000)
          } else {
            // 新对话：保留当前的选择（用于从首页继承的配置）
            console.log('[Chat Shell] 🆕 New conversation detected, keeping current selections')
            isLoadingRef.current = false
          }
        })
        .catch((error) => {
          console.error('[Chat Shell] ❌ Failed to load conversation:', error)
          setSelectedKnowledgeBaseIds([])
          setSelectedNoteIds([])
          isLoadingRef.current = false
        })
    } else if (!isPrivateMode) {
      // Cloud Mode 下,重置 loading 标记
      isLoadingRef.current = false
    }
  }, [
    isPrivateMode,
    chatId,
    privateKnowledgeBases.length,
    knowledgeBaseData.length,
    privateNotes.length,
    noteData.length,
    setSelectedModel,
  ])

  // ===== Private Mode: 保存知识库和笔记关联到数据库 =====
  useEffect(() => {
    // 如果正在加载,跳过保存
    if (isLoadingRef.current) {
      console.log('[Chat Shell] ⏸️ Skipping save during initial load')
      return
    }

    if (isPrivateMode && chatId) {
      // 清除之前的定时器
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // 延迟保存,避免频繁写入
      saveTimeoutRef.current = setTimeout(() => {
        console.log('[Chat Shell] 💾 Saving knowledge base and note associations')
        console.log('[Chat Shell] 📚 Knowledge base IDs:', selectedKnowledgeBaseIds)
        console.log('[Chat Shell] 📝 Note IDs:', selectedNoteIds)
        ipcAPI
          .updateConversation(chatId, {
            availableKnowledgeBaseIds: selectedKnowledgeBaseIds,
            availableNoteIds: selectedNoteIds,
          })
          .then(() => {
            console.log('[Chat Shell] ✅ Associations saved')
          })
          .catch((error: any) => {
            console.error('[Chat Shell] ❌ Failed to save associations:', error)
          })
      }, 500)

      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
      }
    }
  }, [isPrivateMode, chatId, selectedKnowledgeBaseIds, selectedNoteIds])

  // ===== 错误处理 =====
  useEffect(() => {
    if (kbError) console.error('加载知识库失败:', kbError)
    if (agentError) console.error('加载 Agents 失败:', agentError)
    if (noteError) console.error('加载笔记列表失败:', noteError)
  }, [kbError, agentError, noteError])

  // ===== 格式化知识库数据 =====
  const knowledgeBasesList = useMemo(() => {
    if (isPrivateMode) {
      return privateKnowledgeBases.map((kb) => ({
        id: kb.id,
        name: kb.name,
        enabled: true,
      }))
    }
    return knowledgeBaseData.map((kb) => ({
      id: kb.id,
      name: kb.name,
      enabled: true,
    }))
  }, [isPrivateMode, privateKnowledgeBases, knowledgeBaseData])

  // ===== 格式化 Agent 数据（去重） =====
  const agentsList = useMemo(() => {
    const deduplicated = chatConfigData.filter((config: any) => {
      if (config.sourceShareSlug) {
        const hasOriginal = chatConfigData.some(
          (c: any) => c.shareSlug === config.sourceShareSlug && !c.sourceShareSlug
        )
        if (hasOriginal) return false
      }
      return true
    })

    return deduplicated.map((config: any) => ({
      id: config.id,
      name: config.name,
      description: config.systemPrompt || 'No description',
      icon: config.avatar || '🤖',
    }))
  }, [chatConfigData])

  // ===== 格式化笔记数据 =====
  const notesList = useMemo(() => {
    if (isPrivateMode) {
      return privateNotes.map((note) => ({
        id: note.id,
        name: note.title,
        enabled: true,
      }))
    }
    return noteData.map((note) => ({
      id: note.id,
      name: note.title,
      enabled: true,
    }))
  }, [isPrivateMode, privateNotes, noteData])

  // ===== 清理无效知识库ID =====
  useEffect(() => {
    if (isPrivateMode) {
      // Private Mode 下由加载会话时设置,不需要清理
      return
    }
    if (!knowledgeBaseData.length) return
    const validIds = new Set(knowledgeBaseData.map((kb) => kb.id))
    setSelectedKnowledgeBaseIds((prev) => {
      const filtered = prev.filter((id) => validIds.has(id))
      // 只有在实际有变化时才更新（检查数量和内容）
      if (filtered.length !== prev.length) {
        return filtered
      }
      // 检查内容是否相同
      if (filtered.some((id, index) => id !== prev[index])) {
        return filtered
      }
      return prev
    })
  }, [knowledgeBaseData, isPrivateMode])

  // ===== 清理无效 Agent ID =====
  useEffect(() => {
    if (!agentsList.length) return
    const validIds = new Set(agentsList.map((a) => a.id))
    setSelectedAgentId((prev) => {
      if (!prev || validIds.has(prev)) return prev
      return undefined
    })
  }, [agentsList])

  // ===== ChatContext 值 =====
  const chatContextValue = useMemo(
    () => ({
      knowledgeBasesList,
      selectedKnowledgeBaseIds,
      setSelectedKnowledgeBaseIds,
      selectedModel,
      setSelectedModel,
      webSearchEnabled,
      setWebSearchEnabled,
      agentsList,
      selectedAgentId,
      setSelectedAgentId,
      notesList,
      selectedNoteIds,
      setSelectedNoteIds,
    }),
    [
      knowledgeBasesList,
      selectedKnowledgeBaseIds,
      selectedModel,
      webSearchEnabled,
      agentsList,
      selectedAgentId,
      notesList,
      selectedNoteIds,
    ]
  )

  return (
    <ChatContextProvider value={chatContextValue}>
      <div className="flex h-full w-full">
        {/* <div className="flex flex-1 flex-col"> */}
        <Outlet />
        {/* </div> */}
        <SidebarRight />
      </div>
    </ChatContextProvider>
  )
}

export const Route = createFileRoute('/_authenticated/chat')({
  component: ChatShellComponent,
})
