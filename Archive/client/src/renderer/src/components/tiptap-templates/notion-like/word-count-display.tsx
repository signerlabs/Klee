import * as React from 'react'
import { useEditor } from '@tiptap/react'
import { Loader2, Sparkles, CloudOff, AlertCircle, CloudCheck } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface WordCountDisplayProps {
  editor: ReturnType<typeof useEditor>
  // Save status props
  isSaving?: boolean
  hasUnsavedChanges?: boolean
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  // Embedding status props
  isEmbedding?: boolean
  hasPendingEmbed?: boolean
  embedStatus?: 'idle' | 'embedding' | 'embedded' | 'error'
  lastEmbeddedAt?: Date | null
}

/**
 * Floating status display in the bottom right corner
 * Shows word count, save status, and embedding status
 */
export function WordCountDisplay({
  editor,
  isSaving = false,
  hasUnsavedChanges = false,
  saveStatus = 'idle',
  isEmbedding = false,
  hasPendingEmbed = false,
  embedStatus = 'idle',
  lastEmbeddedAt = null,
}: WordCountDisplayProps) {
  const [counts, setCounts] = React.useState({
    characters: 0,
    words: 0,
  })

  React.useEffect(() => {
    if (!editor) return

    const updateCounts = () => {
      const storage = editor.storage.characterCount as any
      if (storage) {
        setCounts({
          characters: storage.characters?.() || 0,
          words: storage.words?.() || 0,
        })
      }
    }

    // Initial update
    updateCounts()

    // Update on editor changes
    editor.on('update', updateCounts)
    editor.on('selectionUpdate', updateCounts)

    return () => {
      editor.off('update', updateCounts)
      editor.off('selectionUpdate', updateCounts)
    }
  }, [editor])

  // Format timestamp
  const formatTimestamp = (date: Date | null) => {
    if (!date) return null
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString()
  }

  // Save indicator
  const SaveIndicator = () => {
    if (hasUnsavedChanges || isSaving) {
      return <CloudOff className="h-3 w-3" />
    }

    if (saveStatus === 'saved') {
      return <CloudCheck className="h-3 w-3" />
    }

    if (saveStatus === 'error') {
      return <AlertCircle className="h-3 w-3" />
    }

    return <CloudCheck className="h-3 w-3" />
  }

  // Embedding indicator
  const EmbeddingIndicator = () => {
    if (isEmbedding || hasPendingEmbed) {
      return <Loader2 className="h-3 w-3 animate-spin" />
    }

    if (embedStatus === 'embedded') {
      return <Sparkles className="h-3 w-3" />
    }

    return <Sparkles className="h-3 w-3" />
  }

  if (!editor) return null

  // Get tooltip text for save status
  const getSaveTooltip = () => {
    if (isSaving) return 'Saving...'
    if (hasUnsavedChanges) return 'Unsaved'
    if (saveStatus === 'error') return 'Save failed'
    return 'Saved'
  }

  // Get tooltip text for embedding status
  const getEmbedTooltip = () => {
    if (isEmbedding) return 'Embedding...'
    if (hasPendingEmbed) return 'Pending...'
    return 'Embedded'
  }

  return (
    <TooltipProvider>
      <div className="fixed bottom-4 right-4 z-10 rounded-md bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md border border-border">
        <div className="flex items-center gap-3">
          {/* Word count */}
          <span>{counts.words} words</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{counts.characters} chars</span>

          <span className="text-muted-foreground/50">·</span>

          {/* Save status icon with tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default">
                <SaveIndicator />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{getSaveTooltip()}</p>
            </TooltipContent>
          </Tooltip>

          {/* Embedding status icon with tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default">
                <EmbeddingIndicator />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{getEmbedTooltip()}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
