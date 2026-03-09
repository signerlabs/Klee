import { Hono } from "hono"
import { requireAuth, getUser } from "../middleware/auth.middleware.js"

const agent = new Hono()

agent.use("*", requireAuth())

// 获取 agent 列表
agent.get("/", async (c) => {
  const user = getUser(c)
  // TODO: 实现获取 agent 列表逻辑
  return c.json({ agents: [] })
})

// 创建 agent
agent.post("/", async (c) => {
  const user = getUser(c)
  const body = await c.req.json()
  // TODO: 实现创建 agent 逻辑
  return c.json({ message: "Agent created" })
})

// 执行 agent
agent.post("/:id/execute", async (c) => {
  const id = c.req.param("id")
  const user = getUser(c)
  const body = await c.req.json()
  // TODO: 实现执行 agent 逻辑
  return c.json({ message: "Agent executed", result: {} })
})

// 获取单个 agent
agent.get("/:id", async (c) => {
  const id = c.req.param("id")
  const user = getUser(c)
  // TODO: 实现获取 agent 详情逻辑
  return c.json({ id, name: "Example Agent" })
})

// 更新 agent
agent.put("/:id", async (c) => {
  const id = c.req.param("id")
  const user = getUser(c)
  const body = await c.req.json()
  // TODO: 实现更新 agent 逻辑
  return c.json({ message: "Agent updated" })
})

// 删除 agent
agent.delete("/:id", async (c) => {
  const id = c.req.param("id")
  const user = getUser(c)
  // TODO: 实现删除 agent 逻辑
  return c.json({ message: "Agent deleted" })
})

export default agent
