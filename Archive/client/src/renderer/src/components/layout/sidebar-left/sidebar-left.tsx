'use client'

import * as React from 'react'
import { Notebook, Store, MessageCircle, Plus, LibraryBig } from 'lucide-react'
import { useLocation, useNavigate } from '@tanstack/react-router'

import { ChatList } from '@/components/layout/sidebar-left/chat-list'
import { NoteList } from '@/components/layout/sidebar-left/note-list'
import { KnowledgeBaseList } from '@/components/layout/sidebar-left/knowledge-base-list'
import { MarketplaceList } from '@/components/layout/sidebar-left/marketplace-list'
import { NavMain } from '@/components/layout/sidebar-left/nav-main'
import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { SparklesCore } from '@/components/ui/sparkles'
import logoImage from '@/assets/logo.png'

import { useConversations } from '@/hooks/chat/queries/useConversations'
import { useLocalConversations } from '@/hooks/chat/queries/useLocalConversations'
import { useChatConfigs } from '@/hooks/chat-config/queries/useChatConfigs'
import { useCreateNote } from '@/hooks/note/mutations/useCreateNote'
import { useMode } from '@/contexts/ModeContext'
import { useQueryClient } from '@tanstack/react-query'
import { noteKeys } from '@/lib/queryKeys'

export function SidebarLeft({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = location.pathname
  const { mode } = useMode()
  const queryClient = useQueryClient()

  // ==== Chat 列表 (根据模式使用不同的数据源) ====
  const { data: cloudConversationsData } = useConversations()
  const { data: localConversationsData } = useLocalConversations()

  const chatItems = React.useMemo(() => {
    if (mode === 'private') {
      // Private Mode: 使用本地数据
      return (localConversationsData ?? []).map((chat) => ({
        id: chat.id,
        name: chat.title ?? 'New Chat',
        url: `/chat/${chat.id}`,
        starred: Boolean(chat.starred),
      }))
    } else {
      // Cloud Mode: 使用云端数据
      return (cloudConversationsData?.chats ?? []).map((chat) => ({
        id: chat.id,
        name: chat.title ?? 'New Chat',
        url: `/chat/${chat.id}`,
        starred: Boolean(chat.starred),
      }))
    }
  }, [mode, cloudConversationsData, localConversationsData])

  // ==== Agent 列表（Marketplace） ====
  const { data: chatConfigsData } = useChatConfigs()
  const agentItems = React.useMemo(() => {
    if (!chatConfigsData || !('configs' in chatConfigsData)) return []
    const configs = chatConfigsData.configs ?? []

    return configs.map((config: any) => {
      const isSelfCreated = !config.sourceShareSlug

      // 自己创建的 Agent：
      //   - 已分享：使用 shareSlug 查看
      //   - 未分享：使用 agent ID 查看（只有自己能访问）
      // 已安装的 Agent：使用原始的 sourceShareSlug
      let url = `/marketplace`

      if (isSelfCreated) {
        if (config.isPublic && config.shareSlug) {
          // 已分享：使用 shareSlug
          url = `/marketplace/agent/${config.shareSlug}`
        } else if (config.id) {
          // 未分享：使用 agent ID（只有所有者能访问）
          url = `/marketplace/agent/${config.id}`
        }
      } else if (config.sourceShareSlug) {
        // 已安装的：使用原始 shareSlug
        url = `/marketplace/agent/${config.sourceShareSlug}`
      }

      return {
        id: config.id,
        name: config.name,
        url,
        starred: false,
        selfCreated: isSelfCreated,
        isPublic: config.isPublic || false,
        shareSlug: config.shareSlug,
      }
    })
  }, [chatConfigsData])

  // ==== Note 列表 ====
  // ==== 动态内容渲染 ====
  const renderContent = () => {
    if (currentPath.includes('/chat')) {
      return <ChatList chat={chatItems} />
    } else if (currentPath.includes('/note')) {
      return <NoteList />
    } else if (currentPath.includes('/knowledge-base')) {
      return <KnowledgeBaseList />
    } else if (currentPath.includes('/marketplace')) {
      return <MarketplaceList marketplace={agentItems} />
    }
    return <ChatList chat={chatItems} />
  }

  // ==== 左侧导航 ====
  const navItems = NavMainData.map((item) => ({
    ...item,
    isActive: currentPath.includes(item.url),
  }))

  // ==== 创建笔记 mutation ====
  const createNoteMutation = useCreateNote()
  const creatingNoteRef = React.useRef(false)
  const lastCreateAtRef = React.useRef(0)

  // ==== 处理 Note 导航点击 ====
  const handleNoteNavClick = React.useCallback(async () => {
    // 如果已经在 note 页面，不做任何操作
    if (currentPath.includes('/note')) {
      return
    }

    // 获取现有的笔记 - 注意要包含 page 和 pageSize 参数以匹配 useNotes 的 queryKey
    const queryKey = [...noteKeys.lists(mode as 'cloud' | 'private'), 1, 20]
    const notesData = queryClient.getQueryData<any>(queryKey)

    if (notesData && notesData.note && notesData.note.length > 0) {
      // 如果有笔记，跳转到第一个笔记
      navigate({ to: '/note/$noteId', params: { noteId: notesData.note[0].id } })
    } else {
      // 如果没有笔记，创建一个新的空笔记
      if (
        createNoteMutation.isPending ||
        creatingNoteRef.current ||
        Date.now() - lastCreateAtRef.current < 1500
      ) {
        return
      }
      creatingNoteRef.current = true
      try {
        const response = await createNoteMutation.mutateAsync({
          title: 'Untitled note',
          content: '',
        })
        const noteId = response.note?.id
        if (noteId) {
          navigate({ to: '/note/$noteId', params: { noteId } })
        }
        lastCreateAtRef.current = Date.now()
      } catch (error) {
        console.error('Failed to create note:', error)
      } finally {
        creatingNoteRef.current = false
      }
    }
  }, [currentPath, navigate, createNoteMutation, mode, queryClient])

  // ==== 添加新项按钮 ====
  const handleAddNew = React.useCallback(async () => {
    if (currentPath.includes('/chat')) {
      navigate({ to: '/chat' })
    } else if (currentPath.includes('/note')) {
      // 创建一个空笔记并跳转
      if (
        createNoteMutation.isPending ||
        creatingNoteRef.current ||
        // 距离上次点击小于 1.5s 时阻止继续创建
        Date.now() - lastCreateAtRef.current < 1500
      ) {
        return
      }
      creatingNoteRef.current = true
      try {
        const response = await createNoteMutation.mutateAsync({
          title: 'Untitled note',
          content: '',
        })
        const noteId = response.note?.id
        if (noteId) {
          navigate({ to: '/note/$noteId', params: { noteId } })
        }
        lastCreateAtRef.current = Date.now()
      } catch (error) {
        console.error('Failed to create note:', error)
      } finally {
        creatingNoteRef.current = false
      }
    } else if (currentPath.includes('/knowledge-base')) {
      navigate({ to: '/knowledge-base' })
    } else if (currentPath.includes('/marketplace')) {
      // T085: 市场页面点击创建按钮跳转到新建 Agent 页面
      navigate({ to: '/marketplace/agent/$agentId', params: { agentId: 'new' }, search: {} })
    } else {
      navigate({ to: '/chat' })
    }
  }, [currentPath, navigate, createNoteMutation])

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <div className="flex items-center py-2 px-1">
          <img src={logoImage} alt="Logo" className="h-6 w-6" />
          <span className="ml-2 text-lg font-semibold">Klee</span>
        </div>
        <NavMain items={navItems} onNoteClick={handleNoteNavClick} />
      </SidebarHeader>

      <SidebarContent>{renderContent()}</SidebarContent>

      <SidebarFooter>
        <Button className="w-full relative overflow-hidden" onClick={handleAddNew}>
          <Plus className="size-4 z-10" />
          <SparklesCore
            background="transparent"
            minSize={0.4}
            maxSize={1}
            particleDensity={200}
            className="w-full h-full absolute inset-0 z-0"
            particleColor="#c2b4b4"
          />
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}

const NavMainData = [
  {
    title: 'Chat',
    url: '/chat',
    icon: MessageCircle,
  },
  {
    title: 'Note',
    url: '/note', // 这个会在 NavMain 组件中特殊处理
    icon: Notebook,
  },
  {
    title: 'Knowledge Base',
    url: '/knowledge-base',
    icon: LibraryBig,
  },
  {
    title: 'Marketplace',
    url: '/marketplace',
    icon: Store,
  },
]
