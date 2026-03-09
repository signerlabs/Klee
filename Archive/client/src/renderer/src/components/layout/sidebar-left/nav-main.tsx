'use client'

import { type LucideIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

export function NavMain({
  items,
  onNoteClick,
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
    isActive?: boolean
  }[]
  onNoteClick?: () => void
}) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild={item.title !== 'Note'}
            isActive={item.isActive}
            onClick={item.title === 'Note' ? onNoteClick : undefined}
          >
            {item.title === 'Note' ? (
              <>
                <item.icon />
                <span>{item.title}</span>
              </>
            ) : (
              <Link to={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
