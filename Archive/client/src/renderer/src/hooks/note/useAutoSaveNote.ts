import { useCallback, useEffect, useRef, useState } from 'react'
import { useUpdateNote } from './mutations/useUpdateNote'
import { useEmbedNote } from './mutations/useEmbedNote'
import { useDebouncedCallback } from 'use-debounce'

interface AutoSaveOptions {
  noteId: string
  saveDebounceMs?: number // 保存防抖时间，默认 5000ms (5秒)
  embedDebounceMs?: number // embedding 防抖时间，默认 3000ms (3秒)
  autoEmbed?: boolean // 是否自动 embedding，默认 true
  onSaveSuccess?: () => void
  onEmbedSuccess?: () => void
  onError?: (error: Error, type: 'save' | 'embed') => void
}

interface AutoSaveState {
  isSaving: boolean
  isEmbedding: boolean
  lastSavedAt: Date | null
  lastEmbeddedAt: Date | null
  saveStatus: 'idle' | 'pending' | 'saved' | 'error'
  embedStatus: 'idle' | 'pending' | 'embedded' | 'error'
  pendingContent: { title: string; content: string } | null
}

export function useAutoSaveNote(options: AutoSaveOptions) {
  const {
    noteId,
    saveDebounceMs = 5000, // 5秒
    embedDebounceMs = 3000, // 3秒
    autoEmbed = true,
    onSaveSuccess,
    onEmbedSuccess,
    onError,
  } = options

  const updateNoteMutation = useUpdateNote()
  const embedNoteMutation = useEmbedNote()

  // 状态管理
  const [state, setState] = useState<AutoSaveState>({
    isSaving: false,
    isEmbedding: false,
    lastSavedAt: null,
    lastEmbeddedAt: null,
    saveStatus: 'idle',
    embedStatus: 'idle',
    pendingContent: null,
  })

  // 追踪最新保存的内容，用于判断是否需要 embedding
  const lastSavedContentRef = useRef<{ title: string; content: string } | null>(null)
  const embedQueueRef = useRef<boolean>(false)

  // 保存逻辑
  const performSave = useCallback(
    async (title: string, content: string) => {
      if (!noteId) return

      setState((prev) => ({
        ...prev,
        isSaving: true,
        saveStatus: 'pending',
        pendingContent: { title, content },
      }))

      try {
        await updateNoteMutation.mutateAsync({
          id: noteId,
          payload: {
            title: title || 'Untitled note',
            content,
          },
        })

        const now = new Date()
        setState((prev) => ({
          ...prev,
          isSaving: false,
          saveStatus: 'saved',
          lastSavedAt: now,
          pendingContent: null,
        }))

        // 更新最后保存的内容
        lastSavedContentRef.current = { title, content }

        onSaveSuccess?.()

        // 如果启用自动 embedding，标记需要 embedding
        if (autoEmbed) {
          embedQueueRef.current = true
        }

        // 3秒后重置保存状态为 idle
        setTimeout(() => {
          setState((prev) => (prev.saveStatus === 'saved' ? { ...prev, saveStatus: 'idle' } : prev))
        }, 3000)
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isSaving: false,
          saveStatus: 'error',
        }))
        onError?.(error as Error, 'save')
      }
    },
    [noteId, updateNoteMutation, onSaveSuccess, onError, autoEmbed]
  )

  // Embedding 逻辑
  const performEmbed = useCallback(async () => {
    if (!noteId || !embedQueueRef.current) return

    embedQueueRef.current = false

    setState((prev) => ({
      ...prev,
      isEmbedding: true,
      embedStatus: 'pending',
    }))

    try {
      await embedNoteMutation.mutateAsync(noteId)

      const now = new Date()
      setState((prev) => ({
        ...prev,
        isEmbedding: false,
        embedStatus: 'embedded',
        lastEmbeddedAt: now,
      }))

      onEmbedSuccess?.()

      // 3秒后重置 embedding 状态为 idle
      setTimeout(() => {
        setState((prev) =>
          prev.embedStatus === 'embedded' ? { ...prev, embedStatus: 'idle' } : prev
        )
      }, 3000)
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isEmbedding: false,
        embedStatus: 'error',
      }))
      onError?.(error as Error, 'embed')
    }
  }, [noteId, embedNoteMutation, onEmbedSuccess, onError])

  // 防抖保存
  const debouncedSave = useDebouncedCallback((title: string, content: string) => {
    performSave(title, content)
  }, saveDebounceMs)

  // 防抖 embedding - 在最后一次保存后延迟执行
  const debouncedEmbed = useDebouncedCallback(() => {
    performEmbed()
  }, embedDebounceMs)

  // 监听保存完成，触发 embedding
  useEffect(() => {
    if (state.saveStatus === 'saved' && autoEmbed && embedQueueRef.current) {
      debouncedEmbed()
    }
  }, [state.saveStatus, autoEmbed, debouncedEmbed])

  // 自动保存方法
  const autoSave = useCallback(
    (title: string, content: string) => {
      // 检查内容是否真的改变了
      if (
        lastSavedContentRef.current?.title === title &&
        lastSavedContentRef.current?.content === content
      ) {
        return
      }

      debouncedSave(title, content)
    },
    [debouncedSave]
  )

  // 手动触发立即保存
  const saveNow = useCallback(
    async (title: string, content: string) => {
      debouncedSave.cancel()
      await performSave(title, content)
    },
    [debouncedSave, performSave]
  )

  // 手动触发立即 embedding
  const embedNow = useCallback(async () => {
    debouncedEmbed.cancel()
    embedQueueRef.current = true
    await performEmbed()
  }, [debouncedEmbed, performEmbed])

  // 取消所有待处理的操作
  const cancelPending = useCallback(() => {
    debouncedSave.cancel()
    debouncedEmbed.cancel()
    embedQueueRef.current = false
  }, [debouncedSave, debouncedEmbed])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cancelPending()
    }
  }, [cancelPending])

  return {
    // 状态
    ...state,

    // 方法
    autoSave,
    saveNow,
    embedNow,
    cancelPending,

    // 计算属性
    hasUnsavedChanges: debouncedSave.isPending() || state.pendingContent !== null,
    hasPendingEmbed: embedQueueRef.current || debouncedEmbed.isPending(),
  }
}
