import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import * as authActions from './auth'
import { setCachedSession } from './auth-session-store'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  session: Session | null | undefined
  isLoading: boolean
  signInWithGoogle: typeof authActions.signInWithGoogle
  signOut: typeof authActions.signOut
  signInWithEmail: typeof authActions.signInWithEmail
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null | undefined>(undefined)

  React.useEffect(() => {
    // If supabase client is not initialized, set session to null
    if (!supabase) {
      console.error('Supabase client not initialized')
      setSession(null)
      setCachedSession(null)
      return
    }

    let cancelled = false

    void (async () => {
      const { data, error } = await supabase.auth.getSession()
      if (cancelled) return

      if (error) {
        console.error('Session check error:', error.message)
        setSession(null)
        setCachedSession(null)
        return
      }

      setSession(data.session)
      setCachedSession(data.session ?? null)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!cancelled) {
        setSession(authSession)
        setCachedSession(authSession ?? null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const isLoading = session === undefined

  const value = React.useMemo(
    () => ({
      session,
      isLoading,
      signInWithGoogle: authActions.signInWithGoogle,
      signOut: authActions.signOut,
      signInWithEmail: authActions.signInWithEmail,
    }),
    [session, isLoading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
