import { SidebarLeft } from '@/components/layout/sidebar-left/sidebar-left'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Outlet } from '@tanstack/react-router'

export default function Layout() {
  return (
    <SidebarProvider>
      <SidebarLeft />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
