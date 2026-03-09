'use client'

import * as React from 'react'
import { MoreHorizontal, Trash2, Bot, Share2, Globe } from 'lucide-react'
import { useNavigate, useLocation } from '@tanstack/react-router'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
} from '@/components/ui/alert-dialog'
import { useDeleteChatConfig } from '@/hooks/chat-config/mutations/useDeleteChatConfig'
import { useShareAgent } from '@/hooks/marketplace/mutations/useShareAgent'
import { useAlert } from '@/components/ui/alert-provider'

export function MarketplaceList({
  marketplace,
}: {
  marketplace: {
    id?: string
    name: string
    url: string
    starred: boolean
    selfCreated: boolean
    isPublic?: boolean
    shareSlug?: string | null
  }[]
}) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const location = useLocation()
  const { showAlert } = useAlert()
  const deleteMutation = useDeleteChatConfig()
  const shareMutation = useShareAgent()

  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [agentToDelete, setAgentToDelete] = React.useState<{ id: string; name: string } | null>(
    null
  )
  // T064: 添加取消分享确认对话框状态
  const [showUnshareDialog, setShowUnshareDialog] = React.useState(false)
  const [agentToUnshare, setAgentToUnshare] = React.useState<{
    id: string
    name: string
  } | null>(null)

  // 处理删除
  const handleDelete = React.useCallback(
    async (item: { id?: string; name: string; url: string }) => {
      if (!item.id) return

      setDeletingId(item.id)

      try {
        await deleteMutation.mutateAsync(item.id)

        showAlert({
          title: 'Deleted Successfully',
          description: `Agent "${item.name}" has been deleted.`,
        })

        // 如果当前在被删除的 agent 页面，导航回市场首页
        if (location.pathname.includes(item.url)) {
          navigate({ to: '/marketplace' })
        }
      } catch (error) {
        showAlert({
          title: 'Delete Failed',
          description: error instanceof Error ? error.message : 'Failed to delete agent',
          variant: 'destructive',
        })
      } finally {
        setDeletingId(null)
        setShowDeleteDialog(false)
        setAgentToDelete(null)
      }
    },
    [deleteMutation, showAlert, location.pathname, navigate]
  )

  // 打开删除确认对话框
  const openDeleteDialog = React.useCallback((item: { id?: string; name: string; url: string }) => {
    if (!item.id) return
    setAgentToDelete({ id: item.id, name: item.name })
    setShowDeleteDialog(true)
  }, [])

  // T064: 打开取消分享确认对话框
  const openUnshareDialog = React.useCallback((item: { id?: string; name: string }) => {
    if (!item.id) return
    setAgentToUnshare({ id: item.id, name: item.name })
    setShowUnshareDialog(true)
  }, [])

  // T022, T024: 处理分享
  const handleShare = React.useCallback(
    (item: { id?: string; name: string }) => {
      if (!item.id) return

      shareMutation.mutate(
        { id: item.id, isPublic: true },
        {
          onSuccess: () => {
            showAlert({
              title: 'Shared to Marketplace',
              description: `Agent "${item.name}" is now public and visible in the marketplace.`,
            })
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : 'Unknown error'
            showAlert({
              title: 'Failed to share agent',
              description: message,
              variant: 'destructive',
            })
          },
        }
      )
    },
    [shareMutation, showAlert]
  )

  // T064: 确认取消分享
  const confirmUnshare = React.useCallback(async () => {
    if (!agentToUnshare) return

    shareMutation.mutate(
      { id: agentToUnshare.id, isPublic: false },
      {
        onSuccess: () => {
          showAlert({
            title: 'Removed from Marketplace',
            description: `Agent "${agentToUnshare.name}" is now private.`,
          })
          setShowUnshareDialog(false)
          setAgentToUnshare(null)
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          showAlert({
            title: 'Failed to unshare agent',
            description: message,
            variant: 'destructive',
          })
        },
      }
    )
  }, [agentToUnshare, shareMutation, showAlert])

  // 通过 URL 匹配来确定活动状态（因为 URL 使用 shareSlug，不是 UUID）
  const marketplaceItemsWithActive = marketplace.map((item) => ({
    ...item,
    isActive: location.pathname === item.url || location.pathname.startsWith(item.url),
  }))

  const selfCreatedAgents = marketplaceItemsWithActive.filter((item) => item.selfCreated)
  const marketplaceAgents = marketplaceItemsWithActive.filter((item) => !item.selfCreated)

  return (
    <>
      {/* Self-created agents */}
      {selfCreatedAgents.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>My Created Agents</SidebarGroupLabel>
          <SidebarMenu>
            {selfCreatedAgents.map((item) => (
              <SidebarMenuItem key={item.id || item.name}>
                <SidebarMenuButton
                  onClick={() => navigate({ to: item.url })}
                  title={item.name}
                  isActive={item.isActive}
                >
                  <Bot className="h-4 w-4" />
                  <span className="flex items-center gap-2">
                    {item.name}
                    {item.isPublic && (
                      <Globe className="h-3 w-3 text-green-600 dark:text-green-400" />
                    )}
                  </span>
                </SidebarMenuButton>
                {item.id && (
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
                      <DropdownMenuItem
                        disabled={shareMutation.isPending}
                        onSelect={() =>
                          item.isPublic ? openUnshareDialog(item) : handleShare(item)
                        }
                      >
                        {item.isPublic ? <Share2 /> : <Globe />}
                        <span>
                          {shareMutation.isPending
                            ? 'Updating...'
                            : item.isPublic
                              ? 'Unshare from Marketplace'
                              : 'Share to Marketplace'}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        disabled={deletingId === item.id}
                        onSelect={() => openDeleteDialog(item)}
                      >
                        <Trash2 />
                        <span>{deletingId === item.id ? 'Deleting...' : 'Delete'}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* Available agents from marketplace */}
      {marketplaceAgents.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Marketplace Agents</SidebarGroupLabel>
          <SidebarMenu>
            {marketplaceAgents.map((item) => (
              <SidebarMenuItem key={item.id || item.name}>
                <SidebarMenuButton
                  onClick={() => navigate({ to: item.url })}
                  title={item.name}
                  isActive={item.isActive}
                >
                  <span>{item.name}</span>
                </SidebarMenuButton>
                {item.id && (
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
                      <DropdownMenuItem
                        className="text-destructive"
                        disabled={deletingId === item.id}
                        onSelect={() => openDeleteDialog(item)}
                      >
                        <Trash2 />
                        <span>{deletingId === item.id ? 'Deleting...' : 'Delete'}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* T064: Unshare Confirmation Dialog */}
      <AlertDialog open={showUnshareDialog} onOpenChange={setShowUnshareDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unshare from Marketplace?</AlertDialogTitle>
            <AlertDialogDescription>
              {agentToUnshare && (
                <>
                  Agent "{agentToUnshare.name}" will be removed from the marketplace and will no
                  longer be visible to other users. This action can be reversed by sharing again
                  later.
                  <br />
                  <br />
                  <strong>Note:</strong> Users who have already installed this agent will still have
                  access to their copies.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={shareMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={shareMutation.isPending} onClick={confirmUnshare}>
              {shareMutation.isPending ? 'Unsharing...' : 'Unshare'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
            <AlertDialogDescription>
              {agentToDelete && (
                <>
                  Are you sure you want to delete "{agentToDelete.name}"? This action cannot be
                  undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (agentToDelete) {
                  void handleDelete({ id: agentToDelete.id, name: agentToDelete.name, url: '' })
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
