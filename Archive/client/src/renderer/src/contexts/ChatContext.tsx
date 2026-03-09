import {
  createContext,
  useContext,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react'

export type ChatContextType = {
  // 知识库数据和状态
  knowledgeBasesList: Array<{ id: string; name: string; enabled: boolean }>
  selectedKnowledgeBaseIds: string[]
  setSelectedKnowledgeBaseIds: Dispatch<SetStateAction<string[]>>
  // 模型 & Web Search
  selectedModel: string
  setSelectedModel: Dispatch<SetStateAction<string>>
  webSearchEnabled: boolean
  setWebSearchEnabled: Dispatch<SetStateAction<boolean>>

  // Agent 数据和状态
  agentsList: Array<{ id: string; name: string; description: string; icon: string }>
  selectedAgentId: string | undefined
  setSelectedAgentId: Dispatch<SetStateAction<string | undefined>>

  // 笔记数据和状态
  notesList: Array<{ id: string; name: string; enabled: boolean }>
  selectedNoteIds: string[]
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>
}

const ChatContext = createContext<ChatContextType | null>(null)

export function ChatContextProvider({
  children,
  value,
}: {
  children: ReactNode
  value: ChatContextType
}) {
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChatContext must be used within ChatContextProvider')
  }
  return context
}
