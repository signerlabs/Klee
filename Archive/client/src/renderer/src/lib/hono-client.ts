import { hc } from 'hono/client'
import type { AppType } from 'server/client'
import { supabase } from './supabase'

/**
 * 检查是否为 Private Mode
 */
function isPrivateMode(): boolean {
  const mode = localStorage.getItem('run-mode')
  return mode === 'private'
}

/**
 * 获取认证 headers（Electron 环境使用 Bearer token）
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}

  const client = supabase
  if (!client) {
    return headers
  }

  const { data, error } = await client.auth.getSession()
  if (!error && data.session?.access_token) {
    headers['Authorization'] = `Bearer ${data.session.access_token}`
  }

  return headers
}

/**
 * 自定义 fetch 函数，自动添加 Bearer token 认证
 *
 * T039: Private Mode 下阻止所有网络请求
 */
async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // T039: 在 Private Mode 下阻止所有云端请求
  if (isPrivateMode()) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    console.warn(`[Private Mode] Blocked network request to: ${url}`)

    // 返回一个模拟的 Response 对象，包含错误信息
    return new Response(
      JSON.stringify({
        error: 'Network requests are disabled in Private Mode',
        message:
          'This feature requires Cloud Mode. Please switch to Cloud Mode to use this feature.',
      }),
      {
        status: 403,
        statusText: 'Forbidden - Private Mode Active',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }

  const authHeaders = await getAuthHeaders()
  const headers = new Headers(init?.headers)

  // 添加认证 headers
  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value)
  })

  return fetch(input, {
    ...init,
    headers,
  })
}

/**
 * 获取 API Base URL
 * - 开发环境: 使用相对路径（Vite 代理到 localhost:3000）
 * - 生产环境: 使用 AWS Elastic Beanstalk URL
 */
function getApiBaseUrl(): string {
  // 开发环境：使用相对路径，通过 Vite 代理
  if (import.meta.env.DEV) {
    return ''
  }

  // 生产环境：优先使用环境变量，否则使用硬编码 URL (HTTP - HTTPS 尚未配置)
  return import.meta.env.VITE_API_URL || 'http://rafa-prod.eba-mmc3gc5h.us-east-1.elasticbeanstalk.com'
}

/**
 * 类型安全的 Hono RPC 客户端
 *
 * ✨ 特性:
 * - 端到端类型推导（请求参数 + 响应类型）
 * - 自动添加 Bearer token 认证（Electron 环境）
 * - API 路径自动补全
 * - 开发环境使用相对路径（Vite 代理），生产环境使用云端 URL
 *
 * 使用方法:
 * const res = await honoClient.api.knowledgebase.$get()
 * const data = await res.json() // ✨ 类型自动推导
 */
export const honoClient = hc<AppType>(getApiBaseUrl(), {
  fetch: customFetch,
})

// 导出类型
export type HonoClient = typeof honoClient
