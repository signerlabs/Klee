import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

let cachedSession: Session | null | undefined = undefined
let inFlightSession: Promise<Session | null> | null = null

export function getCachedSession() {
  return cachedSession
}

export function setCachedSession(session: Session | null | undefined) {
  cachedSession = session
}

export async function ensureSession() {
  if (cachedSession !== undefined) {
    return cachedSession
  }

  if (!supabase) {
    cachedSession = null
    return cachedSession
  }

  if (!inFlightSession) {
    inFlightSession = supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error('Session check error:', error.message)
        }
        cachedSession = session ?? null
        return cachedSession
      })
      .finally(() => {
        inFlightSession = null
      })
  }

  return inFlightSession
}
