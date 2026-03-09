import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'

type DeleteKnowledgeBaseFileVariables = {
  knowledgeBaseId: string
  fileId: string
}

export function useDeleteKnowledgeBaseFile() {
  const queryClient = useQueryClient()
  const { mode } = useMode()

  return useMutation({
    mutationFn: async ({ knowledgeBaseId, fileId }: DeleteKnowledgeBaseFileVariables) => {
      if (mode === 'private') {
        // Private Mode: 使用 IPC
        const result = await window.api.knowledgeBase.deleteFile(knowledgeBaseId, fileId)
        return result
      }

      // Cloud Mode: 使用 Hono RPC
      const res = await honoClient.api.knowledgebase[':id'].files[':fileId'].$delete({
        param: { id: knowledgeBaseId, fileId },
      })

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({ error: 'Unknown error' }))) as {
          error?: string
        }
        throw new Error(errorData.error || `Failed to delete file: ${res.status}`)
      }

      return res.json()
    },

    /**
     * 乐观更新: 在服务器响应前立即从文件列表中移除
     */
    onMutate: async ({ knowledgeBaseId, fileId }) => {
      // 1. 取消进行中的查询，避免覆盖我们的乐观更新
      await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.detail(knowledgeBaseId, mode) })

      // 2. 保存当前值，以便失败时回滚
      const previousDetail = queryClient.getQueryData(
        knowledgeBaseKeys.detail(knowledgeBaseId, mode)
      )

      // 3. 乐观更新：从文件列表中移除该文件
      queryClient.setQueryData(knowledgeBaseKeys.detail(knowledgeBaseId, mode), (old: any) => {
        if (!old?.files) return old
        return {
          ...old,
          files: old.files.filter((file: any) => file.id !== fileId),
        }
      })

      // 返回上下文对象，包含旧值
      return { previousDetail }
    },

    /**
     * 错误处理: 回滚到旧值
     */
    onError: (_err, { knowledgeBaseId }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(
          knowledgeBaseKeys.detail(knowledgeBaseId, mode),
          context.previousDetail
        )
      }
    },

    /**
     * 成功后: 确保数据一致性
     */
    onSuccess: (_data, { knowledgeBaseId }) => {
      // 强制重新获取详情查询
      queryClient.refetchQueries({ queryKey: knowledgeBaseKeys.detail(knowledgeBaseId, mode) })
    },

    /**
     * 错误后: 重新获取以确保显示正确数据
     */
    onSettled: (_data, _error, { knowledgeBaseId }) => {
      // 失效查询，确保下次访问时会重新获取
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(knowledgeBaseId, mode) })
    },
  })
}
