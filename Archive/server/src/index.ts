import { serve } from "@hono/node-server"
import { Hono } from "hono"
import "dotenv/config"
import {
  supabaseMiddleware,
  getSupabase,
} from "./middleware/auth.middleware.js"
import { ensureBucketExists } from "./lib/storage.js"

// 导入路由模块
import healthRoutes from "./routes/health.js"
import chatRoutes from "./routes/chat.js"
import chatConfigRoutes from "./routes/chatConfig.js"
import authRoutes from "./routes/auth.js"
import knowledgebaseRoutes from "./routes/knowledgebase.js"
import agentRoutes from "./routes/agent.js"
import noteRoutes from "./routes/note.js"
import marketplaceRoutes from "./routes/marketplace.js"

// 初始化 Storage Bucket
await ensureBucketExists()

const app = new Hono()
  .basePath("/api")
  // Health check endpoint (no auth required)
  .route("/health", healthRoutes)
  .use("*", supabaseMiddleware())
  .route("/chat", chatRoutes)
  .route("/chat-configs", chatConfigRoutes)
  .route("/auth", authRoutes)
  .route("/knowledgebase", knowledgebaseRoutes)
  .route("/agent", agentRoutes)
  .route("/note", noteRoutes)
  .route("/marketplace", marketplaceRoutes)
  .get("/signout", async (c) => {
    const supabase = getSupabase(c)
    await supabase.auth.signOut()
    console.log("Signed out server-side!")
    return c.redirect("/")
  })

export type AppType = typeof app

const port = Number(process.env.PORT) || 3000

// 优雅关闭处理
const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`🚀 Server is running on http://localhost:${info.port}`)
    console.log(`✨ Supabase middleware initialized`)
  }
)

// 处理进程信号以优雅关闭
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...")
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})

process.on("SIGINT", () => {
  console.log("SIGINT received, closing server...")
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})
