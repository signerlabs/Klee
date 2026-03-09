'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { useAutoSaveNote } from '@/hooks/note/useAutoSaveNote'
import { useAlert } from '@/components/ui/alert-provider'
import { AlertCircle } from 'lucide-react'
import { SimpleNotionEditor } from '@/components/tiptap-templates/notion-like/simple-notion-editor'

type NoteEditorProps = {
  noteId: string
  initialTitle?: string
  initialContent?: string
  // 配置选项
  autoSave?: boolean // 是否启用自动保存，默认 true
  autoEmbed?: boolean // 是否自动 embedding，默认 true
  saveDebounceMs?: number // 保存防抖时间（未传时沿用 useAutoSaveNote 默认值）
  embedDebounceMs?: number // embedding 防抖时间（未传时沿用 useAutoSaveNote 默认值）
}

export function NoteEditor({
  noteId,
  initialTitle,
  initialContent,
  autoSave = true,
  autoEmbed = true,
  saveDebounceMs,
  embedDebounceMs,
}: NoteEditorProps) {
  const normalizedInitialTitle = initialTitle ?? ''
  const normalizedInitialContent = initialContent ?? ''

  const [title, setTitle] = React.useState(normalizedInitialTitle)
  const [markdown, setMarkdown] = React.useState(normalizedInitialContent)

  const titleInputRef = React.useRef<HTMLInputElement | null>(null)
  const { showAlert } = useAlert()

  // 使用自动保存 hook
  const {
    isSaving,
    isEmbedding,
    saveStatus,
    embedStatus,
    lastEmbeddedAt,
    hasUnsavedChanges,
    hasPendingEmbed,
    autoSave: performAutoSave,
    cancelPending,
    saveNow,
  } = useAutoSaveNote({
    noteId,
    saveDebounceMs,
    embedDebounceMs,
    autoEmbed,
    onSaveSuccess: () => {
      // 静默成功，不显示 alert
      console.log('[NoteEditor] Auto-saved successfully')
    },
    onEmbedSuccess: () => {
      // 静默成功，不显示 alert
      console.log('[NoteEditor] Auto-embedded successfully')
    },
    onError: (error, type) => {
      showAlert({
        title: type === 'save' ? 'Auto-save failed' : 'Embedding failed',
        description: error.message,
        variant: 'destructive',
        icon: <AlertCircle className="h-4 w-4" />,
      })
    },
  })

  // 使用 refs 保存最新的编辑状态，避免在离开保存的 effect 中形成依赖循环
  const latestTitleRef = React.useRef(title)
  const latestMarkdownRef = React.useRef(markdown)
  const latestUnsavedRef = React.useRef(hasUnsavedChanges)
  const saveNowRef = React.useRef(saveNow)
  React.useEffect(() => {
    latestTitleRef.current = title
  }, [title])
  React.useEffect(() => {
    latestMarkdownRef.current = markdown
  }, [markdown])
  React.useEffect(() => {
    latestUnsavedRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])
  React.useEffect(() => {
    saveNowRef.current = saveNow
  }, [saveNow])

  // 仅在切换 noteId 或卸载时触发：若存在未保存更改，则静默保存一次
  React.useEffect(() => {
    return () => {
      if (latestUnsavedRef.current) {
        void saveNowRef.current(latestTitleRef.current, latestMarkdownRef.current)
      }
    }
  }, [noteId])

  // 保持本地状态与 props 同步（仅在路由/笔记切换时）
  React.useEffect(() => {
    setTitle(normalizedInitialTitle)
    setMarkdown(normalizedInitialContent)
    // 取消之前的待处理操作
    cancelPending()
  }, [noteId, normalizedInitialTitle, normalizedInitialContent, cancelPending])

  // 自动聚焦到标题输入框
  React.useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [noteId])

  const handleTitleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value
      setTitle(newTitle)

      // 如果启用自动保存，触发防抖保存
      if (autoSave) {
        performAutoSave(newTitle, markdown)
      }
    },
    [autoSave, performAutoSave, markdown]
  )

  // Editor onCreate callback
  const handleEditorCreate = React.useCallback(() => {
    // Editor created
    console.log('[NoteEditor] Editor created')
  }, [])

  // Editor onUpdate callback
  const handleEditorUpdate = React.useCallback(
    (newMarkdown: string) => {
      setMarkdown(newMarkdown)

      // If auto-save is enabled, trigger debounced save
      if (autoSave) {
        performAutoSave(title, newMarkdown)
      }
    },
    [autoSave, performAutoSave, title]
  )

  return (
    <div className="flex h-full flex-1 flex-col p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl py-8 px-10">
        <Input
          ref={titleInputRef}
          value={title}
          onChange={handleTitleChange}
          placeholder="Untitled note"
          className="border-0 bg-transparent p-0 text-2xl font-bold tracking-tight shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-3xl md:text-4xl"
        />

        {/* Notion-like TipTap 编辑器 */}
        <SimpleNotionEditor
          content={normalizedInitialContent}
          placeholder="Type '/' for commands"
          onCreate={handleEditorCreate}
          onUpdate={handleEditorUpdate}
          isSaving={isSaving}
          hasUnsavedChanges={hasUnsavedChanges}
          saveStatus={saveStatus === 'pending' ? 'saving' : saveStatus}
          isEmbedding={isEmbedding}
          hasPendingEmbed={hasPendingEmbed}
          embedStatus={embedStatus === 'pending' ? 'embedding' : embedStatus}
          lastEmbeddedAt={lastEmbeddedAt}
        />
      </div>
    </div>
  )
}
