import { useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledgeBaseKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'
import { honoClient } from '@/lib/hono-client'
import { useEffect, useState } from 'react'

type UploadKnowledgeBaseFileVariables = {
  knowledgeBaseId: string
  file: File
}

export function useUploadKnowledgeBaseFile() {
  const queryClient = useQueryClient()
  const { mode } = useMode()
  const [uploadProgress, setUploadProgress] = useState<number>(0)

  useEffect(() => {
    if (mode === 'private' && window.api?.knowledgeBase) {
      const handleProgress = (progress: FileProcessingProgress) => {
        setUploadProgress(progress.percent)
      }

      const handleComplete = (payload: { knowledgeBaseId: string; fileId: string; status: 'completed' | 'failed' }) => {
        queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(payload.knowledgeBaseId, mode) })
        queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists(mode) })
        setUploadProgress(0)
      }

      const handleError = () => {
        setUploadProgress(0)
      }

      window.api.knowledgeBase.onFileProcessingProgress?.(handleProgress)
      window.api.knowledgeBase.onFileProcessingComplete?.(handleComplete)
      window.api.knowledgeBase.onFileProcessingError?.(handleError)

      return () => {
        window.api.knowledgeBase.removeFileProcessingListeners?.()
      }
    }
  }, [mode, queryClient])

  return useMutation({
    mutationFn: async ({ knowledgeBaseId, file }: UploadKnowledgeBaseFileVariables) => {
      if (mode === 'cloud') {
        // 使用 Hono RPC 客户端上传文件
        const res = await honoClient.api.knowledgebase[':id'].files.$post({
          param: { id: knowledgeBaseId },
          form: { file },
        })

        if (!res.ok) {
          const errorData = (await res.json().catch(() => ({ error: 'Unknown error' }))) as {
            error?: string
          }
          throw new Error(errorData.error || `Failed to upload file: ${res.status}`)
        }

        return res.json()
      } else {
        // Private Mode: 使用 IPC
        setUploadProgress(0)

        // 将 File 转换为 Uint8Array
        // Uint8Array 可以正确通过 IPC 传递,preload 层会转换为 Buffer
        const arrayBuffer = await file.arrayBuffer()
        const fileBuffer = new Uint8Array(arrayBuffer)

        const response = await window.api.knowledgeBase.uploadFile({
          knowledgeBaseId,
          fileBuffer,
          fileName: file.name,
          fileSize: file.size,
        })

        return response.success ? response.data : null
      }
    },

    onSuccess: (_data, { knowledgeBaseId }) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(knowledgeBaseId, mode) })
      setUploadProgress(0)
    },

    onError: () => {
      setUploadProgress(0)
    },

    meta: {
      uploadProgress,
    },
  })
}
