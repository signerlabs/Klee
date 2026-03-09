'use client'

import * as React from 'react'
import { MoreHorizontal, Star, StarOff, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useNavigate, useLocation } from '@tanstack/react-router'

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
import { useKnowledgeBases } from '@/hooks/knowledge-base/queries/useKnowledgeBases'
import { useDeleteKnowledgeBase } from '@/hooks/knowledge-base/mutations/useDeleteKnowledgeBase'
import { useUpdateKnowledgeBase } from '@/hooks/knowledge-base/mutations/useUpdateKnowledgeBase'
import type { KnowledgeBaseListItem } from '@/types'
import { useActiveNavItem } from '@/hooks/common/useActiveNavItem'

/**
 * 知识库列表组件
 * 使用 TanStack Query 自动管理数据获取、缓存和更新
 */
export function KnowledgeBaseList() {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const location = useLocation()
  const { showAlert } = useAlert()

  // 使用新的 TanStack Query 钩子
  const { data, isLoading, isError, refetch } = useKnowledgeBases()
  const deleteMutation = useDeleteKnowledgeBase()
  const updateMutation = useUpdateKnowledgeBase()

  // 提取知识库数据（需要在条件渲染之前提取，以便传给 useActiveNavItem）
  const knowledgeBases: KnowledgeBaseListItem[] = data?.knowledgeBases ?? []

  // T007: 应用活动状态检测钩子（必须在任何条件渲染之前调用）
  const knowledgeBasesWithActive = useActiveNavItem(knowledgeBases, '/knowledge-base')

  const handleNavigate = React.useCallback(
    (item: KnowledgeBaseListItem) => {
      navigate({ to: `/knowledge-base/${item.id}` })
    },
    [navigate]
  )

  const handleToggleStar = React.useCallback(
    (item: KnowledgeBaseListItem, starred: boolean) => {
      // 防止在删除操作进行中时触发星标操作
      if (deleteMutation.isPending || updateMutation.isPending) {
        return
      }

      // 使用带乐观更新的 mutation 钩子
      // UI 会立即更新，无需手动状态管理
      updateMutation.mutate(
        { id: item.id, payload: { starred } },
        {
          onError: (error) => {
            console.error('Failed to update knowledge base star status:', error)
            showAlert({
              title: 'Update Failed',
              description: 'Unable to update knowledge base star status. Please try again later.',
              variant: 'destructive',
              icon: <AlertCircle className="h-4 w-4" />,
            })
          },
        }
      )
    },
    [deleteMutation.isPending, updateMutation, showAlert]
  )

  const handleDelete = React.useCallback(
    (item: KnowledgeBaseListItem) => {
      if (deleteMutation.isPending) {
        return
      }

      // 检查当前是否在被删除的知识库详情页
      const isOnDeletedKnowledgeBasePage = location.pathname.includes(`/knowledge-base/${item.id}`)

      // 使用新的 deleteMutation 钩子，它已经实现了乐观更新
      deleteMutation.mutate(item.id, {
        onSuccess: () => {
          // 如果在被删除的知识库详情页，导航到知识库列表页
          if (isOnDeletedKnowledgeBasePage) {
            navigate({ to: '/knowledge-base' })
          }

          showAlert({
            title: 'Deleted Successfully',
            description: `Knowledge base "${item.name}" has been removed.`,
            icon: <CheckCircle2 className="h-4 w-4" />,
          })
        },
        onError: (error) => {
          console.error('Failed to delete knowledge base:', error)
          showAlert({
            title: 'Delete Failed',
            description: 'Unable to delete the knowledge base. Please try again later.',
            variant: 'destructive',
            icon: <AlertCircle className="h-4 w-4" />,
          })
        },
      })
    },
    [deleteMutation, location.pathname, navigate, showAlert]
  )

  const renderMessage = (message: string, action?: () => void) => (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Knowledge Bases</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            variant="outline"
            onClick={action}
            disabled={!action}
            className={!action ? 'cursor-default text-muted-foreground' : undefined}
          >
            <span>{message}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )

  // 加载状态
  if (isLoading) {
    return renderMessage('Loading...')
  }

  // 错误状态
  if (isError) {
    return renderMessage('Failed to load. Click to retry.', () => void refetch())
  }

  const starredItems = knowledgeBasesWithActive.filter((item) => item.starred)
  const recentItems = knowledgeBasesWithActive.filter((item) => !item.starred)

  const renderListItem = (item: KnowledgeBaseListItem & { isActive: boolean }, isStarredGroup: boolean) => {
    const isUpdating = updateMutation.isPending
    const isDeleting = deleteMutation.isPending

    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton onClick={() => handleNavigate(item)} title={item.name} isActive={item.isActive}>
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
              <DropdownMenuItem
                disabled={isUpdating || isDeleting}
                onSelect={() => {
                  if (isUpdating || isDeleting) {
                    return
                  }
                  handleToggleStar(item, !isStarredGroup)
                }}
              >
                {isStarredGroup ? (
                  <StarOff className="text-muted-foreground" />
                ) : (
                  <Star className="text-muted-foreground" />
                )}
                <span>{isStarredGroup ? 'Unstar' : 'Star'}</span>
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
              <AlertDialogTitle>Delete this knowledge base?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will permanently remove the knowledge base, its files, and embeddings.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={() => {
                  void handleDelete(item)
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarMenuItem>
    )
  }

  const renderGroup = (label: string, items: Array<KnowledgeBaseListItem & { isActive: boolean }>, isStarredGroup: boolean) => {
    if (items.length === 0) {
      return null
    }

    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarMenu>{items.map((item) => renderListItem(item, isStarredGroup))}</SidebarMenu>
      </SidebarGroup>
    )
  }

  return (
    <>
      {renderGroup('Starred', starredItems, true)}
      {renderGroup('Recent', recentItems, false)}
    </>
  )
}
