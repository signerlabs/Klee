import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/(auth)')({
  beforeLoad: async () => {
    if (!supabase) {
      console.error('Supabase client not initialized. Please check environment variables.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()

    // If already authenticated, redirect to chat
    if (session) {
      throw redirect({ to: '/chat' })
    }
  },
  component: Outlet,
})
