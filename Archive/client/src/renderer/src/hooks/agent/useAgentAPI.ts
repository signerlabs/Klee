import { useCallback } from 'react'
import { apiClient } from '@/lib/api-client'

/**
 * Agent API Hook
 *
 * 提供 Agent 相关的 API 操作
 * 注意：未来可考虑迁移至 RPC Hook
 */
export function useAgentAPI() {
  const createAgent = useCallback(
    async (agent: { name: string; description: string; prompt?: string }) => {
      const response = await apiClient.post('/agents', agent)
      if (!response.ok) {
        throw new Error(`Failed to create agent: ${response.status}`)
      }
      return response.json()
    },
    []
  )

  const fetchAgents = useCallback(async () => {
    const response = await apiClient.get('/agents')
    if (!response.ok) {
      throw new Error(`Failed to load agents: ${response.status}`)
    }
    return response.json()
  }, [])

  return {
    createAgent,
    fetchAgents,
  }
}
