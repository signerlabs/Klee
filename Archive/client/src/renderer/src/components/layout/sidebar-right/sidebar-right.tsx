import * as React from 'react'
import { useParams } from '@tanstack/react-router'
import { UserSetting } from '@/components/layout/sidebar-right/user-setting'
import { ChatConfig } from '@/components/layout/sidebar-right/chat-config'
import { ModeToggle } from '@/components/layout/sidebar-right/mode-toggle'
import { Sidebar, SidebarContent, SidebarHeader } from '@/components/ui/sidebar'
import { useChatContext } from '@/contexts/ChatContext'

export function SidebarRight({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // 获取当前 chatId（如果在 chat 页面）
  const params = useParams({ strict: false }) as { chatId?: string }
  const chatId = params?.chatId

  // 从 ChatContext 获取配置数据
  const {
    selectedKnowledgeBaseIds: selectedKnowledgeBases,
    setSelectedKnowledgeBaseIds: setSelectedKnowledgeBases,
    knowledgeBasesList: knowledgeBases,
    agentsList: agents,
    selectedAgentId: selectedAgent,
    setSelectedAgentId: setSelectedAgent,
    selectedNoteIds,
    setSelectedNoteIds,
    notesList: notes,
  } = useChatContext()

  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh w-80 border-l lg:flex"
      {...props}
    >
      <SidebarHeader className="border-sidebar-border h-16 border-b">
        <UserSetting />
      </SidebarHeader>

      <SidebarContent>
        <ChatConfig
          agents={agents}
          knowledgeBases={knowledgeBases}
          notes={notes}
          selectedAgent={selectedAgent}
          setSelectedAgent={setSelectedAgent}
          selectedKnowledgeBases={selectedKnowledgeBases}
          setSelectedKnowledgeBases={setSelectedKnowledgeBases}
          selectedNotes={selectedNoteIds}
          setSelectedNotes={setSelectedNoteIds}
          chatId={chatId}
        />
      </SidebarContent>

      <ModeToggle />
    </Sidebar>
  )
}
