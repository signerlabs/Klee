import * as React from "react"
import { type Editor } from "@tiptap/react"

import { AiMenuItems } from "@/components/tiptap-ui/ai-menu/ai-menu-items/ai-menu-items"

// -- Hooks --
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useUiEditorState } from "@/hooks/use-ui-editor-state"

// -- Utils --
import {
  getSelectedDOMElement,
  selectionHasText,
} from "@/lib/tiptap-advanced-utils"

// -- Tiptap UI --
import { AiMenuInputTextarea } from "@/components/tiptap-ui/ai-menu/ai-menu-input/ai-menu-input"
import { AiMenuActions } from "@/components/tiptap-ui/ai-menu/ai-menu-actions/ai-menu-actions"

// -- UI Primitives --
import {
  Menu,
  MenuContent,
  useFloatingMenuStore,
} from "@/components/tiptap-ui-primitive/menu"
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import {
  ComboboxList,
  ComboboxPopover,
} from "@/components/tiptap-ui-primitive/combobox"
import { Card } from "@/components/tiptap-ui-primitive/card/card"

import { getContextAndInsertAt } from "./ai-menu-utils"
import {
  useAiContentTracker,
  useAiMenuState,
  useAiMenuStateProvider,
  useTextSelectionTracker,
} from "./ai-menu-hooks"

// -- Icons --
import { StopCircle2Icon } from "@/components/tiptap-icons/stop-circle-2-icon"

import "@/components/tiptap-ui/ai-menu/ai-menu.scss"

export function AiMenuStateProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { value, AiMenuStateContext } = useAiMenuStateProvider()

  return (
    <AiMenuStateContext.Provider value={value}>
      {children}
    </AiMenuStateContext.Provider>
  )
}

export function AiMenuContent({
  editor: providedEditor,
}: {
  editor?: Editor | null
}) {
  const { editor } = useTiptapEditor(providedEditor)
  const { state, updateState, setFallbackAnchor, reset } = useAiMenuState()
  const { show, store } = useFloatingMenuStore()
  const { aiGenerationIsLoading, aiGenerationActive, aiGenerationHasMessage } =
    useUiEditorState(editor)
  const tiptapAiPromptInputRef = React.useRef<HTMLDivElement | null>(null)

  const closeAiMenu = React.useCallback(() => {
    if (!editor) return
    reset()
    store?.hideAll()
    editor.commands.resetUiState()
  }, [editor, reset, store])

  const handlePromptSubmit = React.useCallback(
    (userPrompt: string) => {
      if (!editor || !userPrompt.trim()) return

      const { context } = getContextAndInsertAt(editor)
      // if context, add it to the user prompt
      const promptWithContext = context
        ? `${context}\n\n${userPrompt}`
        : userPrompt

      // Ensure fallback anchor is set before submitting
      if (!state.fallbackAnchor.element || !state.fallbackAnchor.rect) {
        const currentSelectedElement = getSelectedDOMElement(editor)
        if (currentSelectedElement) {
          const rect = currentSelectedElement.getBoundingClientRect()
          setFallbackAnchor(currentSelectedElement, rect)
        }
      }

      editor
        .chain()
        .aiTextPrompt({
          text: promptWithContext,
          insert: true,
          stream: true,
          tone: state.tone,
          format: "rich-text",
        })
        .run()
    },
    [editor, state.tone, state.fallbackAnchor, setFallbackAnchor]
  )

  const setAnchorElement = React.useCallback(
    (element: HTMLElement) => {
      store.setAnchorElement(element)
    },
    [store]
  )

  const handleSelectionChange = React.useCallback(
    (element: HTMLElement | null, rect: DOMRect | null) => {
      setFallbackAnchor(element, rect)
    },
    [setFallbackAnchor]
  )

  const handleOnReject = React.useCallback(() => {
    if (!editor) return
    editor.commands.aiReject()
    closeAiMenu()
  }, [closeAiMenu, editor])

  const handleOnAccept = React.useCallback(() => {
    if (!editor) return
    editor.commands.aiAccept()
    closeAiMenu()
  }, [closeAiMenu, editor])

  const handleInputOnClose = React.useCallback(() => {
    if (!editor) return
    if (aiGenerationIsLoading) {
      editor.commands.aiReject({ type: "reset" })
    } else {
      editor.commands.aiAccept()
    }
    closeAiMenu()
  }, [aiGenerationIsLoading, closeAiMenu, editor])

  const handleClickOutside = React.useCallback(() => {
    if (!aiGenerationIsLoading) {
      closeAiMenu()

      if (!editor) return
      editor.commands.aiAccept()
    }
  }, [aiGenerationIsLoading, closeAiMenu, editor])

  useAiContentTracker({
    editor,
    aiGenerationActive,
    setAnchorElement,
    fallbackAnchor: state.fallbackAnchor,
  })

  useTextSelectionTracker({
    editor,
    aiGenerationActive,
    showMenuAtElement: show,
    setMenuVisible: (visible) => updateState({ isOpen: visible }),
    onSelectionChange: handleSelectionChange,
    prevent: aiGenerationIsLoading,
  })

  React.useEffect(() => {
    if (aiGenerationIsLoading) {
      updateState({ shouldShowInput: false })
    }
  }, [aiGenerationIsLoading, updateState])

  React.useEffect(() => {
    if (!aiGenerationActive && state.isOpen) {
      closeAiMenu()
    }
  }, [aiGenerationActive, state.isOpen, closeAiMenu])

  const smoothFocusAndScroll = (element: HTMLElement | null) => {
    element?.focus()
    element?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    })

    // Ensure the menu back to focus after focusing on the popover
    setTimeout(() => store.setAutoFocusOnShow(false), 0)
    return false
  }

  const shouldShowList =
    selectionHasText(editor) ||
    (aiGenerationHasMessage && state.shouldShowInput && state.inputIsFocused)

  if (!editor || !state.isOpen || !aiGenerationActive) {
    return null
  }

  return (
    <Menu open={state.isOpen} placement="bottom-start" store={store}>
      <MenuContent
        onClickOutside={handleClickOutside}
        className="tiptap-ai-menu"
        flip={false}
      >
        <Card>
          {aiGenerationIsLoading && <AiMenuProgress editor={editor} />}

          {!aiGenerationIsLoading && (
            <AiMenuInputTextarea
              ref={tiptapAiPromptInputRef}
              showPlaceholder={
                !aiGenerationIsLoading &&
                aiGenerationHasMessage &&
                !state.shouldShowInput
              }
              onInputFocus={() => updateState({ inputIsFocused: true })}
              onInputBlur={() => updateState({ inputIsFocused: false })}
              onClose={handleInputOnClose}
              onPlaceholderClick={() => updateState({ shouldShowInput: true })}
              onInputSubmit={(value) => handlePromptSubmit(value)}
              onToneChange={(tone) => updateState({ tone })}
            />
          )}

          {aiGenerationHasMessage && !aiGenerationIsLoading && (
            <AiMenuActions
              editor={editor}
              options={{ tone: state.tone, format: "rich-text" }}
              onAccept={handleOnAccept}
              onReject={handleOnReject}
            />
          )}
        </Card>

        {!aiGenerationIsLoading && (
          <ComboboxPopover
            flip={false}
            unmountOnHide
            autoFocus={false}
            onFocus={() => updateState({ inputIsFocused: true })}
            autoFocusOnShow={smoothFocusAndScroll}
            autoFocusOnHide={smoothFocusAndScroll}
            getAnchorRect={() => {
              return (
                tiptapAiPromptInputRef.current?.getBoundingClientRect() || null
              )
            }}
          >
            <ComboboxList
              style={{ display: shouldShowList ? "block" : "none" }}
            >
              <AiMenuItems />
            </ComboboxList>
          </ComboboxPopover>
        )}
      </MenuContent>
    </Menu>
  )
}

export function AiMenuProgress({ editor }: { editor: Editor }) {
  const { reset } = useAiMenuState()

  const handleStop = React.useCallback(() => {
    if (!editor) return

    editor.chain().aiReject({ type: "reset" }).run()
    reset()
    editor.commands.resetUiState()
  }, [editor, reset])

  return (
    <div className="tiptap-ai-menu-progress">
      <div className="tiptap-spinner-alt">
        <span>AI is writing</span>
        <div className="dots-container">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>
      </div>

      <ButtonGroup>
        <Button data-style="ghost" title="Stop" onClick={handleStop}>
          <StopCircle2Icon className="tiptap-button-icon" />
        </Button>
      </ButtonGroup>
    </div>
  )
}

export function AiMenu({ editor }: { editor?: Editor | null }) {
  return (
    <AiMenuStateProvider>
      <AiMenuContent editor={editor} />
    </AiMenuStateProvider>
  )
}
