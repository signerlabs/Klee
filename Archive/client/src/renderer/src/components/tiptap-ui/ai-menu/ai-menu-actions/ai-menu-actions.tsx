"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import { RefreshAiIcon } from "@/components/tiptap-icons/refresh-ai-icon"
import { XIcon } from "@/components/tiptap-icons/x-icon"
import { CheckIcon } from "@/components/tiptap-icons/check-icon"
import type { TextOptions } from "@tiptap-pro/extension-ai"
import { useUiEditorState } from "@/hooks/use-ui-editor-state"

import "@/components/tiptap-ui/ai-menu/ai-menu-actions/ai-menu-actions.scss"

export interface AiMenuActionsProps {
  editor: Editor | null
  options: TextOptions
  onRegenerate?: () => void
  onAccept?: () => void
  onReject?: () => void
}

export function AiMenuActions({
  editor,
  options,
  onRegenerate,
  onAccept,
  onReject,
}: AiMenuActionsProps) {
  const { aiGenerationIsLoading } = useUiEditorState(editor)

  const handleRegenerate = React.useCallback(() => {
    if (!editor) return
    editor.chain().focus().aiRegenerate(options).run()
    onRegenerate?.()
  }, [editor, onRegenerate, options])

  const handleDiscard = React.useCallback(() => {
    if (!editor) return
    editor.chain().focus().aiReject().run()
    onReject?.()
  }, [editor, onReject])

  const handleApply = React.useCallback(() => {
    if (!editor) return
    editor.chain().focus().aiAccept().run()
    onAccept?.()
  }, [editor, onAccept])

  return (
    <div className="tiptap-ai-menu-actions">
      <div className="tiptap-ai-menu-results">
        <ButtonGroup orientation="horizontal">
          <Button
            data-style="ghost"
            className="tiptap-button"
            onClick={handleRegenerate}
            disabled={aiGenerationIsLoading}
          >
            <RefreshAiIcon className="tiptap-button-icon" />
            Try again
          </Button>
        </ButtonGroup>
      </div>

      <div className="tiptap-ai-menu-commit">
        <ButtonGroup orientation="horizontal">
          <Button
            data-style="ghost"
            className="tiptap-button"
            onClick={handleDiscard}
          >
            <XIcon className="tiptap-button-icon" />
            Discard
          </Button>
          <Button
            data-style="primary"
            className="tiptap-button"
            onClick={handleApply}
          >
            <CheckIcon className="tiptap-button-icon" />
            Apply
          </Button>
        </ButtonGroup>
      </div>
    </div>
  )
}
