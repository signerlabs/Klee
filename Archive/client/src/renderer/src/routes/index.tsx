import { createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (!supabase) {
      console.error('Supabase client not initialized. Please check environment variables.')
      throw redirect({ to: '/login' })
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session) {
      throw redirect({ to: '/chat' })
    }

    throw redirect({ to: '/login' })
  },
})
