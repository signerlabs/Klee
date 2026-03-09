'use client'

import * as React from 'react'
import { EditorContent, EditorContext, useEditor } from '@tiptap/react'
import { createPortal } from 'react-dom'

// --- Tiptap Core Extensions ---
import { StarterKit } from '@tiptap/starter-kit'
import { Mention } from '@tiptap/extension-mention'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Typography } from '@tiptap/extension-typography'
import { Highlight } from '@tiptap/extension-highlight'
import { Superscript } from '@tiptap/extension-superscript'
import { Subscript } from '@tiptap/extension-subscript'
import { TextAlign } from '@tiptap/extension-text-align'
import { Mathematics } from '@tiptap/extension-mathematics'
import { UniqueID } from '@tiptap/extension-unique-id'
import { Emoji, gitHubEmojis } from '@tiptap/extension-emoji'
import CharacterCount from '@tiptap/extension-character-count'
import { Markdown } from 'tiptap-markdown'

// --- Hooks ---
import { useUiEditorState } from '@/hooks/use-ui-editor-state'
import { useScrollToHash } from '@/components/tiptap-ui/copy-anchor-link-button/use-scroll-to-hash'

// --- Custom Extensions ---
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension'
import { UiState } from '@/components/tiptap-extension/ui-state-extension'
import { Image } from '@/components/tiptap-node/image-node/image-node-extension'

// --- Tiptap Node ---
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension'
import '@/components/tiptap-node/blockquote-node/blockquote-node.scss'
import '@/components/tiptap-node/code-block-node/code-block-node.scss'
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss'
import '@/components/tiptap-node/list-node/list-node.scss'
import '@/components/tiptap-node/image-node/image-node.scss'
import '@/components/tiptap-node/heading-node/heading-node.scss'
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss'

// --- Tiptap UI ---
import { EmojiDropdownMenu } from '@/components/tiptap-ui/emoji-dropdown-menu'
import { MentionDropdownMenu } from '@/components/tiptap-ui/mention-dropdown-menu'
import { SlashDropdownMenu } from '@/components/tiptap-ui/slash-dropdown-menu'
import { DragContextMenu } from '@/components/tiptap-ui/drag-context-menu'

// --- Config ---
import { simpleSlashMenuConfig } from '@/components/tiptap-templates/notion-like/simple-slash-config'

// --- Contexts ---
import { AppProvider } from '@/contexts/app-context'

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils'

// --- Styles ---
import '@/components/tiptap-templates/notion-like/notion-like-editor.scss'

// --- Content ---
import { NotionToolbarFloating } from '@/components/tiptap-templates/notion-like/notion-like-editor-toolbar-floating'
import { MobileToolbar } from '@/components/tiptap-templates/notion-like/notion-like-editor-mobile-toolbar'
import { WordCountDisplay } from '@/components/tiptap-templates/notion-like/word-count-display'

export interface SimpleNotionEditorProps {
  content?: string
  placeholder?: string
  onUpdate?: (markdown: string) => void
  onCreate?: () => void
  // Status props for WordCountDisplay
  isSaving?: boolean
  hasUnsavedChanges?: boolean
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  isEmbedding?: boolean
  hasPendingEmbed?: boolean
  embedStatus?: 'idle' | 'embedding' | 'embedded' | 'error'
  lastEmbeddedAt?: Date | null
}

/**
 * EditorContent component that renders the actual editor
 */
export function EditorContentArea() {
  const { editor } = React.useContext(EditorContext)!
  const { isDragging } = useUiEditorState(editor)

  useScrollToHash()

  if (!editor) {
    return null
  }

  return (
    <EditorContent
      editor={editor}
      role="presentation"
      className="notion-like-editor-content"
      style={{
        cursor: isDragging ? 'grabbing' : 'auto',
      }}
    >
      <DragContextMenu />
      <EmojiDropdownMenu />
      <MentionDropdownMenu />
      <SlashDropdownMenu config={simpleSlashMenuConfig} />
      <NotionToolbarFloating />

      {createPortal(<MobileToolbar />, document.body)}
    </EditorContent>
  )
}

/**
 * Simple Notion-like Editor without collaboration features
 */
export function SimpleNotionEditor({
  content = '',
  placeholder = 'Start writing...',
  onUpdate,
  onCreate,
  isSaving,
  hasUnsavedChanges,
  saveStatus,
  isEmbedding,
  hasPendingEmbed,
  embedStatus,
  lastEmbeddedAt,
}: SimpleNotionEditorProps) {
  // Track the initial content to detect external changes
  const lastContentRef = React.useRef(content)

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'notion-like-editor',
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        dropcursor: {
          width: 2,
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({
        placeholder,
        emptyNodeClass: 'is-empty with-slash',
      }),
      Mention,
      Emoji.configure({
        emojis: gitHubEmojis.filter((emoji) => !emoji.name.includes('regional')),
        forceFallbackImages: true,
      }),
      Mathematics,
      Superscript,
      Subscript,
      Color,
      TextStyle,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      ImageUploadNode.configure({
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error('Upload failed:', error),
      }),
      UniqueID.configure({
        types: [
          'paragraph',
          'bulletList',
          'orderedList',
          'taskList',
          'heading',
          'blockquote',
          'codeBlock',
        ],
      }),
      Typography,
      UiState,
      CharacterCount,
      Markdown.configure({
        html: true,
        tightLists: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    onCreate: () => {
      onCreate?.()
    },
    onUpdate: ({ editor: currentEditor }) => {
      // Get markdown from editor
      const storage = currentEditor.storage as any
      const currentMarkdown =
        typeof storage?.markdown?.getMarkdown === 'function' ? storage.markdown.getMarkdown() : ''

      onUpdate?.(currentMarkdown || '')
    },
  })

  // Update editor content when the content prop changes (e.g., when switching notes)
  React.useEffect(() => {
    if (!editor) return

    // Only update if the content actually changed from outside
    if (content !== lastContentRef.current) {
      const storage = editor.storage as any
      const currentMarkdown =
        typeof storage?.markdown?.getMarkdown === 'function' ? storage.markdown.getMarkdown() : ''

      // Only update if the new content is different from what's currently in the editor
      if (content !== currentMarkdown) {
        editor.commands.setContent(content)
        lastContentRef.current = content
      }
    }
  }, [content, editor])

  // Update the ref when content changes from user editing
  React.useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      const storage = editor.storage as any
      const currentMarkdown =
        typeof storage?.markdown?.getMarkdown === 'function' ? storage.markdown.getMarkdown() : ''
      lastContentRef.current = currentMarkdown
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor])

  if (!editor) {
    return null
  }

  return (
    <AppProvider>
      <div className="notion-like-editor-wrapper">
        <EditorContext.Provider value={{ editor }}>
          <EditorContentArea />
          <WordCountDisplay
            editor={editor}
            isSaving={isSaving}
            hasUnsavedChanges={hasUnsavedChanges}
            saveStatus={saveStatus}
            isEmbedding={isEmbedding}
            hasPendingEmbed={hasPendingEmbed}
            embedStatus={embedStatus}
            lastEmbeddedAt={lastEmbeddedAt}
          />
        </EditorContext.Provider>
      </div>
    </AppProvider>
  )
}
