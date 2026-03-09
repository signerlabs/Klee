'use client'

import * as React from 'react'
import { MoreHorizontal, StarOff, Trash2, Star, CheckCircle2, AlertCircle } from 'lucide-react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

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
import { useActiveNavItem } from '@/hooks/common/useActiveNavItem'
import { useUpdateNote } from '@/hooks/note/mutations/useUpdateNote'
import { useDeleteNote } from '@/hooks/note/mutations/useDeleteNote'
import { useNotes } from '@/hooks/note/queries/useNotes'
import type { NoteListItem } from '@/types/cloud/note'

export function NoteList() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobile } = useSidebar()
  const { showAlert } = useAlert()
  const updateNoteMutation = useUpdateNote()
  const deleteNoteMutation = useDeleteNote()

  const { data, isLoading, isError, refetch } = useNotes()

  const noteItems: NoteListItem[] = React.useMemo(() => data?.note ?? [], [data])

  // T006: 应用活动状态检测钩子
  const noteItemsWithActive = useActiveNavItem(noteItems, '/note')

  const handleNavigate = React.useCallback(
    (item: NoteListItem) => {
      navigate({ to: `/note/${item.id}` })
    },
    [navigate]
  )

  const handleToggleStar = React.useCallback(
    (item: NoteListItem, starred: boolean) => {
      if (updateNoteMutation.isPending || deleteNoteMutation.isPending) {
        return
      }
      updateNoteMutation.mutate(
        { id: item.id, payload: { starred } },
        {
          onError: (error) => {
            console.error('Failed to update note star status:', error)
            showAlert({
              title: 'Update Failed',
              description: 'Unable to update note star status. Please try again later.',
              variant: 'destructive',
              icon: <AlertCircle className="h-4 w-4" />,
            })
          },
        }
      )
    },
    [updateNoteMutation, deleteNoteMutation, showAlert]
  )

  const handleDelete = React.useCallback(
    (item: NoteListItem) => {
      if (deleteNoteMutation.isPending) {
        return
      }

      const isOnDeletedNotePage = location.pathname.includes(`/note/${item.id}`)

      deleteNoteMutation.mutate(item.id, {
        onSuccess: () => {
          if (isOnDeletedNotePage) {
            // 跳转到另一个笔记，如果有的话
            const remainingNotes = noteItemsWithActive.filter(note => note.id !== item.id)
            if (remainingNotes.length > 0) {
              navigate({ to: '/note/$noteId', params: { noteId: remainingNotes[0].id } })
            } else {
              // 如果没有其他笔记，跳转到 chat 页面
              navigate({ to: '/chat' })
            }
          }
          showAlert({
            title: 'Deleted Successfully',
            description: `Note "${item.title ?? 'Untitled note'}" has been removed.`,
            icon: <CheckCircle2 className="h-4 w-4" />,
          })
        },
        onError: (error) => {
          console.error('Failed to delete note:', error)
          showAlert({
            title: 'Delete Failed',
            description: 'Unable to delete the note. Please try again later.',
            variant: 'destructive',
            icon: <AlertCircle className="h-4 w-4" />,
          })
        },
      })
    },
    [deleteNoteMutation, location.pathname, navigate, showAlert, noteItemsWithActive]
  )

  const renderMessage = (message: string, action?: () => void) => (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Notes</SidebarGroupLabel>
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

  if (isLoading) {
    return renderMessage('Loading...')
  }

  if (isError) {
    return renderMessage('Failed to load. Click to retry.', () => void refetch())
  }

  const starredItems = noteItemsWithActive.filter((item) => Boolean(item.starred))
  const recentItems = noteItemsWithActive.filter((item) => !item.starred)

  const renderListItem = (item: NoteListItem & { isActive: boolean }, isStarredGroup: boolean) => {
    const isStarActionPending = updateNoteMutation.isPending
    const isDeleting = deleteNoteMutation.isPending

    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          onClick={() => handleNavigate(item)}
          title={item.title ?? 'Untitled note'}
          isActive={item.isActive}
        >
          <span>{item.title ?? 'Untitled note'}</span>
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
                disabled={isStarActionPending || isDeleting}
                onSelect={() => {
                  if (isStarActionPending || isDeleting) {
                    return
                  }
                  void handleToggleStar(item, !isStarredGroup)
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
              <AlertDialogTitle>Delete this note?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will permanently delete the note and its content. This cannot be undone.
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

  const renderGroup = (
    label: string,
    items: Array<NoteListItem & { isActive: boolean }>,
    isStarredGroup: boolean
  ) => {
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
