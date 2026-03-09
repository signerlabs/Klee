import { Hono } from "hono"
import {
  requireAuth,
  getUser,
  optionalAuth,
  getSupabase
} from "../middleware/auth.middleware.js"

const auth = new Hono()

// 获取当前用户（需要认证）
auth.get("/me", requireAuth(), async (c) => {
  const user = getUser(c)
  return c.json({ message: "You are logged in!", user })
})

// 检查认证状态（可选认证）
auth.get("/status", optionalAuth(), async (c) => {
  const user = c.get("user")
  if (user) {
    return c.json({ authenticated: true, user })
  }
  return c.json({ authenticated: false })
})

// 登出
auth.post("/logout", requireAuth(), async (c) => {
  const user = getUser(c)

  // 使用 Supabase 登出
  const supabase = getSupabase(c)
  await supabase.auth.signOut()

  return c.json({ message: "Logged out successfully" })
})

// 刷新 token (cookies 会通过 SSR client 自动设置)
auth.post("/refresh", async (c) => {
  const supabase = getSupabase(c)
  const { data, error } = await supabase.auth.refreshSession()

  if (error) {
    return c.json({ error: error.message }, 401)
  }

  // Cookie 已通过 supabaseMiddleware 的 setAll 自动设置
  return c.json({
    message: "Session refreshed successfully",
    expires_at: data.session?.expires_at,
  })
})

export default auth
