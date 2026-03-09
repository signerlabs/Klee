import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'
import { ensureSession, getCachedSession } from '@/lib/auth-session-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    if (!supabase) {
      console.error('Supabase client not initialized. Please check environment variables.')
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }

    let session = getCachedSession()
    if (session === undefined) {
      session = await ensureSession()
    }

    if (!session) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }

    return { session }
  },
  component: Outlet,
})
