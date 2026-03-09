'use client'

import { useCallback } from 'react'
import { MoreHorizontal, Star, StarOff, Trash2, Bot, Settings, CheckCircle2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAlert } from '@/components/ui/alert-provider'
import { useUpdateConversation } from '@/hooks/chat/mutations/useUpdateConversation'
import { useDeleteConversation } from '@/hooks/chat/mutations/useDeleteConversation'
import { useActiveNavItem } from '@/hooks/common/useActiveNavItem'

type ChatListItem = {
  id?: string
  name: string
  url: string
  starred: boolean
}

type AgentListItem = {
  id?: string
  name: string
  url: string
  starred: boolean
  selfCreated: boolean
}

type ChatListProps = {
  chat: ChatListItem[]
  agents?: AgentListItem[]
}

export function ChatList({ chat, agents }: ChatListProps) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  // T013: 使用 TanStack Query 的变更钩子
  const updateConversationMutation = useUpdateConversation()
  const deleteConversationMutation = useDeleteConversation()
  const { showAlert } = useAlert()

  // T003: 应用活动状态检测钩子
  const chatItemsWithActive = useActiveNavItem(chat, '/chat')

  // Get starred agents
  const starredAgents = agents?.filter((agent) => agent.starred) || []
  const starredChats = chatItemsWithActive.filter((item) => item.starred)
  const recentChats = chatItemsWithActive.filter((item) => !item.starred)

  const handleToggleStar = useCallback(
    async (item: ChatListItem, starred: boolean) => {
      if (!item.id) {
        console.warn('无法更新未持久化的聊天会话')
        return
      }

      // T022/T024: 使用 TanStack Mutation 更新会话（自动乐观更新和缓存失效）
      updateConversationMutation.mutate(
        { id: item.id, data: { starred } },
        {
          onSuccess: () => {
            showAlert({
              title: starred ? 'Starred' : 'Unstarred',
              description: `Chat has been ${starred ? 'starred' : 'unstarred'} successfully.`,
              icon: <Star className="h-4 w-4" />,
              variant: 'default',
              duration: 2000,
            })
          },
          onError: (error) => {
            console.error('更新聊天置顶状态失败:', error)
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to update chat. Please try again.'
            showAlert({
              title: 'Update Failed',
              description: errorMessage,
              variant: 'destructive',
              duration: 5000,
            })
          },
        }
      )
    },
    [updateConversationMutation, showAlert]
  )

  const handleDeleteChat = useCallback(
    async (item: ChatListItem) => {
      if (!item.id) {
        console.warn('无法删除未持久化的聊天会话')
        return
      }

      // T013: 使用 TanStack Mutation 删除会话（自动缓存清理和导航）
      deleteConversationMutation.mutate(item.id, {
        onSuccess: () => {
          showAlert({
            title: 'Deleted Successfully',
            description: 'Chat has been deleted.',
            icon: <CheckCircle2 className="h-4 w-4" />,
          })
        },
        onError: (error) => {
          console.error('Failed to delete chat:', error)
        },
      })
    },
    [deleteConversationMutation, showAlert]
  )

  return (
    <>
      {/* 置顶Agents */}
      {starredAgents.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarMenu>
            {starredAgents.map((agent) => (
              <SidebarMenuItem key={agent.name}>
                <SidebarMenuButton
                  onClick={() => navigate({ to: `/agent-initial/${agent.id || agent.name}` })}
                  title={agent.name}
                >
                  <Bot className="h-4 w-4" />
                  <span>{agent.name}</span>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <MoreHorizontal />
                      <span className="sr-only">More</span>
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-56 rounded-lg"
                    side={isMobile ? 'bottom' : 'right'}
                    align={isMobile ? 'end' : 'start'}
                  >
                    <DropdownMenuItem>
                      <Settings className="text-muted-foreground" />
                      <span>Configure</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <StarOff className="text-muted-foreground" />
                      <span>Unstar</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* 置顶聊天 */}
      {starredChats.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Starred</SidebarGroupLabel>
          <SidebarMenu>
            {starredChats.map((item, index) => (
              <SidebarMenuItem key={item.id ?? `${item.name}-${index}`}>
                <SidebarMenuButton
                  onClick={() => navigate({ to: `/chat/${item.id || index}` })}
                  title={item.name}
                  isActive={item.isActive}
                >
                  <span>{item.name}</span>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <MoreHorizontal />
                      <span className="sr-only">More</span>
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-56 rounded-lg"
                    side={isMobile ? 'bottom' : 'right'}
                    align={isMobile ? 'end' : 'start'}
                  >
                    <DropdownMenuItem onSelect={() => void handleToggleStar(item, false)}>
                      <StarOff className="text-muted-foreground" />
                      <span>Unstar</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => void handleDeleteChat(item)}
                    >
                      <Trash2 />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* 最近聊天/未置顶 */}
      {recentChats.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarMenu>
            {recentChats.map((item, index) => (
              <SidebarMenuItem key={item.id ?? `${item.name}-${index}`}>
                <SidebarMenuButton
                  onClick={() => navigate({ to: `/chat/${item.id || index}` })}
                  title={item.name}
                  isActive={item.isActive}
                >
                  <span>{item.name}</span>
                </SidebarMenuButton>
                <AlertDialog>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover>
                        <MoreHorizontal />
                        <span className="sr-only">More</span>
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-56 rounded-lg"
                      side={isMobile ? 'bottom' : 'right'}
                      align={isMobile ? 'end' : 'start'}
                    >
                      <DropdownMenuItem onSelect={() => void handleToggleStar(item, true)}>
                        <Star className="text-muted-foreground" />
                        <span>Star</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete your chat and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleDeleteChat(item)}>
                        Continue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  )
}
