import type { Context, MiddlewareHandler } from "hono"
import type { User, SupabaseClient } from "@supabase/supabase-js"
import { env } from "hono/adapter"
import { createServerClient, parseCookieHeader } from "@supabase/ssr"
import { setCookie } from "hono/cookie"

declare module "hono" {
  interface ContextVariableMap {
    supabase: SupabaseClient
    user: User
  }
}

type SupabaseEnv = {
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
}

// Session 缓存
type CachedSession = {
  user: User
  expiresAt: number
}

const sessionCache = new Map<string, CachedSession>()

// 缓存配置
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟
const CLEANUP_INTERVAL = 60 * 1000 // 每分钟清理一次

// 定期清理过期缓存
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, value] of sessionCache) {
    if (value.expiresAt < now) {
      sessionCache.delete(key)
    }
  }
}, CLEANUP_INTERVAL)

// 确保进程退出时清理定时器
if (typeof process !== "undefined") {
  process.on("beforeExit", () => {
    clearInterval(cleanupTimer)
  })
}

export const getSupabase = (c: Context) => c.get("supabase") as SupabaseClient
export const getUser = (c: Context) => c.get("user") as User

export const supabaseMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const supabaseEnv = env<SupabaseEnv>(c)
    const supabaseUrl =
      supabaseEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
    const supabaseAnonKey =
      supabaseEnv.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL missing!")
    if (!supabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY missing!")

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return parseCookieHeader(c.req.header("Cookie") ?? "")
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            setCookie(c, name, value, options as any)
          )
        },
      },
    })

    c.set("supabase", supabase)
    await next()
  }
}

// 认证中间件
export const requireAuth = (): MiddlewareHandler => {
  return async (c, next) => {
    const supabase = getSupabase(c)

    // 1. 尝试从 cookie 中获取 access token 作为缓存 key
    const cookies = parseCookieHeader(c.req.header("Cookie") ?? "")
    const accessTokenCookie = cookies.find(
      (cookie) =>
        cookie.name.includes("access") && cookie.name.includes("token")
    )
    const cacheKey = accessTokenCookie?.value

    // 2. 如果有缓存 key，检查缓存
    if (cacheKey) {
      const cached = sessionCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        c.set("user", cached.user)
        await next()
        return
      }
    }

    // 3. 缓存未命中或过期，调用 Supabase Auth
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) {
      // 4. 更新缓存
      if (cacheKey) {
        sessionCache.set(cacheKey, {
          user: data.user,
          expiresAt: Date.now() + CACHE_TTL,
        })
      }

      c.set("user", data.user)
      await next()
      return
    }

    // 5. 备用方案：Bearer token（用于 Electron file:// 或严格的 cookie 环境）
    const authHeader = c.req.header("Authorization")
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : undefined

    if (token) {
      // 检查 Bearer token 的缓存
      const bearerCached = sessionCache.get(token)
      if (bearerCached && bearerCached.expiresAt > Date.now()) {
        c.set("user", bearerCached.user)
        await next()
        return
      }

      // 缓存未命中，调用 Supabase Auth
      const { data: tokenUser } = await supabase.auth.getUser(token)
      if (tokenUser?.user) {
        // 更新缓存
        sessionCache.set(token, {
          user: tokenUser.user,
          expiresAt: Date.now() + CACHE_TTL,
        })

        c.set("user", tokenUser.user)
        await next()
        return
      }
    }

    return c.json({ error: "Unauthorized" }, 401)
  }
}

export const optionalAuth = (): MiddlewareHandler => {
  return async (c, next) => {
    const supabase = getSupabase(c)

    // 1. 尝试从 cookie 中获取 access token
    const cookies = parseCookieHeader(c.req.header("Cookie") ?? "")
    const accessTokenCookie = cookies.find(
      (cookie) =>
        cookie.name.includes("access") && cookie.name.includes("token")
    )
    const cacheKey = accessTokenCookie?.value

    // 2. 检查缓存
    if (cacheKey) {
      const cached = sessionCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        c.set("user", cached.user)
        await next()
        return
      }
    }

    // 3. 调用 Supabase Auth
    const { data } = await supabase.auth.getUser()
    if (data?.user) {
      // 更新缓存
      if (cacheKey) {
        sessionCache.set(cacheKey, {
          user: data.user,
          expiresAt: Date.now() + CACHE_TTL,
        })
      }

      c.set("user", data.user)
      await next()
      return
    }

    // 4. 尝试 Bearer token
    const authHeader = c.req.header("Authorization")
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : undefined

    if (token) {
      // 检查缓存
      const bearerCached = sessionCache.get(token)
      if (bearerCached && bearerCached.expiresAt > Date.now()) {
        c.set("user", bearerCached.user)
        await next()
        return
      }

      // 调用 Supabase Auth
      const { data: tokenUser } = await supabase.auth.getUser(token)
      if (tokenUser?.user) {
        // 更新缓存
        sessionCache.set(token, {
          user: tokenUser.user,
          expiresAt: Date.now() + CACHE_TTL,
        })

        c.set("user", tokenUser.user)
      }
    }

    await next()
  }
}
