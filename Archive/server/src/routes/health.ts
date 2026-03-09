import { Hono } from "hono"

const health = new Hono()

/**
 * 健康检查端点
 * 用于 AWS Elastic Beanstalk 和负载均衡器监控服务状态
 * 返回服务器状态、时间戳和版本信息
 */
health.get("/", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "unknown",
    uptime: process.uptime(),
  })
})

export default health
