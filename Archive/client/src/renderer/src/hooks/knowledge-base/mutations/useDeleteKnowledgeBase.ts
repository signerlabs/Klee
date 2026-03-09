import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys, marketplaceKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'

// 尝试获取 ChatContext，如果不在聊天页面则返回 null
function useChatContextOptional() {
  try {
    // 动态导入以避免循环依赖
    const { useChatContext } = require('@/contexts/ChatContext')
    return useChatContext()
  } catch {
    return null
  }
}

export function useDeleteKnowledgeBase() {
  const queryClient = useQueryClient()
  const { mode } = useMode()
  const chatContext = useChatContextOptional()

  return useMutation({
    mutationFn: async (id: string) => {
      if (mode === 'private') {
        // Private Mode: 使用 IPC
        const result = await window.api.knowledgeBase.delete(id)
        return result
      }

      // Cloud Mode: 使用 Hono RPC
      const res = await honoClient.api.knowledgebase[':id'].$delete({
        param: { id },
      })

      if (!res.ok) {
        // 尝试解析服务器返回的错误消息
        const errorData = (await res.json().catch(() => ({ error: 'Unknown error' }))) as {
          error?: string
        }
        throw new Error(errorData.error || `Failed to delete knowledge base: ${res.status}`)
      }

      return res.json()
    },
    /**
     * 乐观更新：在服务器响应前立即从列表中移除
     * 提升用户体验，使操作感觉更快
     */
    onMutate: async (id) => {
      // 1. 取消所有正在进行的列表查询，防止竞态条件
      await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.lists(mode) })

      // 2. 保存当前列表数据，用于失败时回滚
      const previousList = queryClient.getQueryData(knowledgeBaseKeys.lists(mode))

      // 3. 乐观更新：立即从列表中移除该知识库
      queryClient.setQueryData(knowledgeBaseKeys.lists(mode), (old: any) => {
        if (!old?.knowledgeBases) return old
        return {
          ...old,
          knowledgeBases: old.knowledgeBases.filter((kb: any) => kb.id !== id),
        }
      })

      // 返回上下文，用于 onError 回滚
      return { previousList }
    },
    /**
     * 错误处理：如果删除失败，回滚到之前的列表状态
     */
    onError: (err, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(knowledgeBaseKeys.lists(mode), context.previousList)
      }
    },
    /**
     * 成功处理：清理所有相关缓存和聊天会话引用
     * T058: 扩展缓存失效策略，包括 marketplace 缓存
     */
    onSuccess: (data, id) => {
      // 移除该知识库的详情缓存（包括嵌套的文件列表）
      queryClient.removeQueries({ queryKey: knowledgeBaseKeys.detail(id, mode) })

      // 失效列表查询，确保数据一致性
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists(mode) })

      // 🧹 清理当前聊天会话的知识库引用（仅在聊天页面内）
      if (chatContext) {
        const { selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds } = chatContext
        if (selectedKnowledgeBaseIds.includes(id)) {
          setSelectedKnowledgeBaseIds((prev: string[]) => prev.filter((kbId: string) => kbId !== id))
        }
      }
      // 注意：如果在侧边栏删除（无 ChatContext），会话加载时会自动验证并清理已删除的 ID

      // T058: 失效 marketplace 缓存（如果该知识库曾经分享过）
      // 即使当前未分享，之前可能分享过，所以需要失效 marketplace 缓存
      // 注意：Private Mode 不支持 marketplace，但保留此逻辑以兼容 Cloud Mode
      if (mode === 'cloud') {
        queryClient.invalidateQueries({ queryKey: marketplaceKeys.knowledgeBases() })
      }
    },
  })
}
