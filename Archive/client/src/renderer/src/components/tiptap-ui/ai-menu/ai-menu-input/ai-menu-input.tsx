import * as React from "react"

// Tiptap Core Extensions
import type { Tone } from "@tiptap-pro/extension-ai"

// Icons
import { MicAiIcon } from "@/components/tiptap-icons/mic-ai-icon"
import { ArrowUpIcon } from "@/components/tiptap-icons/arrow-up-icon"
import { AiSparklesIcon } from "@/components/tiptap-icons/ai-sparkles-icon"

// UI Components
import { SUPPORTED_TONES } from "@/components/tiptap-ui/ai-menu"

// UI Primitives
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import { Toolbar, ToolbarGroup } from "@/components/tiptap-ui-primitive/toolbar"
import { useComboboxValueState } from "@/components/tiptap-ui-primitive/menu"
import { Combobox } from "@/components/tiptap-ui-primitive/combobox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"
import { TextareaAutosize } from "@/components/tiptap-ui-primitive/textarea-autosize"
import { Card, CardBody } from "@/components/tiptap-ui-primitive/card"

import { useBlurHandler, useKeyboardHandlers } from "./ai-menu-input-hooks"
import type { AiMenuInputTextareaProps } from "./ai-menu-input-types"

// Styles
import "@/components/tiptap-ui/ai-menu/ai-menu-input/ai-menu-input.scss"

export function AiMenuInputPlaceholder({
  onPlaceholderClick,
}: {
  onPlaceholderClick: () => void
}) {
  return (
    <div
      className="tiptap-ai-prompt-input-placeholder"
      onClick={onPlaceholderClick}
    >
      <div className="tiptap-ai-prompt-input-placeholder-content">
        <AiSparklesIcon className="tiptap-ai-prompt-input-placeholder-icon" />
        <span className="tiptap-ai-prompt-input-placeholder-text">
          Tell AI what else needs to be changed...
        </span>
      </div>
      <Button data-style="primary" disabled>
        <ArrowUpIcon className="tiptap-button-icon" />
      </Button>
    </div>
  )
}

export function ToneSelector({
  tone,
  onToneChange,
}: {
  tone: Tone | null
  onToneChange: (tone: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          data-style="ghost"
          data-active-state={tone ? "on" : "off"}
          role="button"
          tabIndex={-1}
          aria-label="Tone adjustment options"
        >
          <MicAiIcon className="tiptap-button-icon" />
          <span className="tiptap-button-text">Tone</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        <Card>
          <CardBody>
            <ButtonGroup>
              {SUPPORTED_TONES.map((supportedTone) => (
                <DropdownMenuItem key={supportedTone.value} asChild>
                  <Button
                    data-style="ghost"
                    data-active-state={
                      tone === supportedTone.value ? "on" : "off"
                    }
                    onClick={() => onToneChange(supportedTone.value)}
                  >
                    <span className="tiptap-button-text">
                      {supportedTone.label}
                    </span>
                  </Button>
                </DropdownMenuItem>
              ))}
            </ButtonGroup>
          </CardBody>
        </Card>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AiPromptInputToolbar({
  showPlaceholder,
  onInputSubmit,
  onToneChange,
  isEmpty = false,
}: {
  showPlaceholder?: boolean
  onInputSubmit: (prompt: string) => void
  onToneChange?: (tone: string) => void
  isEmpty?: boolean
}) {
  const [tone, setTone] = React.useState<Tone | null>(null)
  const [promptValue] = useComboboxValueState()

  const handleToneChange = React.useCallback(
    (newTone: string) => {
      setTone(newTone)
      onToneChange?.(newTone)
    },
    [onToneChange]
  )

  const handleSubmit = React.useCallback(() => {
    onInputSubmit(promptValue)
  }, [onInputSubmit, promptValue])

  return (
    <Toolbar
      variant="floating"
      data-plain="true"
      className="tiptap-ai-prompt-input-toolbar"
      style={{ display: showPlaceholder ? "none" : "flex" }}
    >
      <ToolbarGroup>
        <ToneSelector tone={tone} onToneChange={handleToneChange} />
      </ToolbarGroup>

      <Spacer />

      <ToolbarGroup>
        <Button
          onClick={handleSubmit}
          disabled={isEmpty}
          data-style="primary"
          aria-label="Submit prompt"
        >
          <ArrowUpIcon className="tiptap-button-icon" />
        </Button>
      </ToolbarGroup>
    </Toolbar>
  )
}

export function AiMenuInputTextarea({
  onInputSubmit,
  onToneChange,
  onClose,
  onInputFocus,
  onInputBlur,
  onEmptyBlur,
  onPlaceholderClick,
  showPlaceholder = false,
  placeholder = "Ask AI what you want...",
  ...props
}: AiMenuInputTextareaProps) {
  const [promptValue, setPromptValue] = useComboboxValueState()
  const [isFocused, setIsFocused] = React.useState(false)

  const handleSubmit = React.useCallback(() => {
    const cleanedPrompt = promptValue?.trim()
    if (cleanedPrompt) {
      onInputSubmit(cleanedPrompt)
      setPromptValue("")
    }
  }, [onInputSubmit, promptValue, setPromptValue])

  const handleKeyDown = useKeyboardHandlers(promptValue, onClose, handleSubmit)

  const handleBlur = useBlurHandler(
    promptValue.trim() === "",
    onInputBlur,
    onEmptyBlur
  )

  const handleOnPlaceholderClick = React.useCallback(() => {
    if (onPlaceholderClick) {
      onPlaceholderClick()
    }
  }, [onPlaceholderClick])

  const handleFocus = React.useCallback(() => {
    setIsFocused(true)
    if (onInputFocus) {
      onInputFocus()
    }
  }, [onInputFocus])

  const handleTextareaBlur = React.useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(false)
      handleBlur(e)
    },
    [handleBlur]
  )

  return (
    <div
      className="tiptap-ai-prompt-input"
      data-focused={isFocused}
      data-active-state={showPlaceholder ? "off" : "on"}
      {...props}
    >
      {showPlaceholder ? (
        <AiMenuInputPlaceholder onPlaceholderClick={handleOnPlaceholderClick} />
      ) : (
        <>
          <Combobox
            autoSelect="always"
            autoFocus
            render={
              <TextareaAutosize
                onChange={(e) => setPromptValue(e.target.value)}
                value={promptValue}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleTextareaBlur}
                className="tiptap-ai-prompt-input-content"
                placeholder={placeholder}
                autoFocus
                style={{
                  display: showPlaceholder ? "none" : "flex",
                }}
              />
            }
          />

          <AiPromptInputToolbar
            showPlaceholder={showPlaceholder}
            onInputSubmit={handleSubmit}
            onToneChange={onToneChange}
            isEmpty={!promptValue?.trim()}
          />
        </>
      )}
    </div>
  )
}
