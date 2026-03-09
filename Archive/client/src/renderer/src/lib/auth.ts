import type { AuthApiError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type SignUpResult =
  | { status: 'pending_verification' }
  | { status: 'email_status' }
  | { status: 'rate_limited'; error: AuthApiError }
  | { status: 'error'; error: Error }

function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable authentication features.'
    )
  }
  return supabase
}

export async function signInWithGoogle() {
  const client = getSupabaseClient()

  // 始终使用自定义协议，在 Electron 环境中 deep link 会捕获
  const redirectTo = 'klee://auth/callback'

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true, // 不自动重定向，我们手动处理
      queryParams: {
        prompt: 'select_account',
      },
    },
  })

  if (error) {
    throw error
  }

  // 在 Electron 环境中，使用系统浏览器打开 OAuth URL
  if (data?.url) {
    // 检查是否在 Electron 环境
    if (window.electron?.ipcRenderer) {
      // 使用 IPC 让主进程打开浏览器
      const result = await window.electron.ipcRenderer.invoke('oauth:openBrowser', data.url)

      if (!result.success) {
        throw new Error(`Failed to open browser: ${result.error}`)
      }
    } else {
      // Web 环境回退：直接重定向
      window.location.href = data.url
    }
  } else {
    throw new Error('Failed to get OAuth URL from Supabase')
  }
}

export async function signOut() {
  const client = getSupabaseClient()
  const { error } = await client.auth.signOut()

  if (error) {
    throw error
  }
}

/**
 * Create Supabase session from OAuth tokens
 * Called by Electron IPC after OAuth callback
 */
export async function createSessionFromOAuthTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  const client = getSupabaseClient()

  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    throw error
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }
}

export async function signUpWithEmail({
  email,
  password,
  username,
  redirectTo,
}: {
  email: string
  password: string
  username: string
  redirectTo?: string
}): Promise<SignUpResult> {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        full_name: username,
      },
      emailRedirectTo: redirectTo ?? window.location.origin,
    },
  })

  if (error instanceof Error) {
    if ((error as AuthApiError)?.status === 429) {
      return { status: 'rate_limited', error: error as AuthApiError }
    }
    return { status: 'error', error }
  }

  const user = data?.user
  if (!user) {
    return { status: 'error', error: new Error('Missing user information from sign-up response') }
  }

  const identities = Array.isArray(user.identities) ? user.identities : []
  const isExplicitlyUnverified = user.user_metadata?.email_verified === false
  const emailConfirmed = Boolean(user.email_confirmed_at ?? user.confirmed_at)

  const createdAt = user.created_at ? Date.parse(user.created_at) : Number.NaN
  const confirmationSentAt = user.confirmation_sent_at
    ? Date.parse(user.confirmation_sent_at)
    : Number.NaN

  const RECENT_SIGNUP_WINDOW_MS = 5_000
  const isNewlyCreated =
    isExplicitlyUnverified &&
    !Number.isNaN(createdAt) &&
    !Number.isNaN(confirmationSentAt) &&
    Math.abs(confirmationSentAt - createdAt) <= RECENT_SIGNUP_WINDOW_MS

  if (emailConfirmed || (!isExplicitlyUnverified && identities.length === 0)) {
    return { status: 'email_status' }
  }

  if (isExplicitlyUnverified && !isNewlyCreated) {
    return { status: 'email_status' }
  }

  return { status: 'pending_verification' }
}

type EmailOtpOptions = {
  shouldCreateUser?: boolean
}

async function sendEmailOtpRequest(email: string, options?: EmailOtpOptions): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: options?.shouldCreateUser ?? false,
    },
  })

  if (error) {
    throw error
  }
}

export async function sendSignupOtp(email: string): Promise<void> {
  await sendEmailOtpRequest(email, { shouldCreateUser: true })
}

export async function sendResetOtp(email: string): Promise<void> {
  await sendEmailOtpRequest(email, { shouldCreateUser: false })
}

export async function verifyEmailOtp({ email, token }: { email: string; token: string }) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error) {
    throw error
  }

  if (!data?.session) {
    throw new Error('Verification failed. Please try again')
  }

  return data.session
}

export async function verifySignupOtp(params: { email: string; token: string }) {
  return verifyEmailOtp(params)
}

export async function completeSignupWithPassword({
  password,
  username,
}: {
  password: string
  username: string
}) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.updateUser({
    password,
    data: {
      username,
      full_name: username,
    },
  })

  if (error) {
    throw error
  }

  return data.user
}

export async function updatePassword(password: string) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.updateUser({
    password,
  })

  if (error) {
    throw error
  }

  return data.user
}
