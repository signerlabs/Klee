import * as React from "react"
import { flip, offset, shift, size } from "@floating-ui/react"
import { PluginKey } from "@tiptap/pm/state"

// --- Hooks ---
import { useFloatingElement } from "@/hooks/use-floating-element"
import { useMenuNavigation } from "@/hooks/use-menu-navigation"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Tiptap Editor ---
import type { Range } from "@tiptap/react"

// --- Tiptap UI ---
import { Suggestion } from "@tiptap/suggestion"

// --- UI Primitives ---
import {
  SuggestionPluginKey,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion"

import { calculateStartPosition } from "./suggestion-menu-utils"
import type {
  SuggestionItem,
  SuggestionMenuProps,
} from "./suggestion-menu-types"

/**
 * A component that renders a suggestion menu for Tiptap editors.
 * Displays a floating menu when a trigger character is typed.
 */
export const SuggestionMenu = ({
  editor: providedEditor,
  floatingOptions,
  selector = "tiptap-suggestion-menu",
  children,
  maxHeight = 384,
  pluginKey = SuggestionPluginKey,
  ...internalSuggestionProps
}: SuggestionMenuProps) => {
  const { editor } = useTiptapEditor(providedEditor)

  const [show, setShow] = React.useState<boolean>(false)
  const [internalClientRect, setInternalClientRect] =
    React.useState<DOMRect | null>(null)
  const [internalCommand, setInternalCommand] = React.useState<
    ((item: SuggestionItem) => void) | null
  >(null)
  const [internalItems, setInternalItems] = React.useState<SuggestionItem[]>([])
  const [internalQuery, setInternalQuery] = React.useState<string>("")
  const [, setInternalRange] = React.useState<Range | null>(null)

  const { ref, style, getFloatingProps, isMounted } = useFloatingElement(
    show,
    internalClientRect,
    1000,
    {
      placement: "bottom-start",
      middleware: [
        offset(10),
        flip({
          mainAxis: true,
          crossAxis: false,
        }),
        shift(),
        size({
          apply({ availableHeight, elements }) {
            if (elements.floating) {
              const maxHeightValue = maxHeight
                ? Math.min(maxHeight, availableHeight)
                : availableHeight

              elements.floating.style.setProperty(
                "--suggestion-menu-max-height",
                `${maxHeightValue}px`
              )
            }
          },
        }),
      ],
      onOpenChange(open) {
        if (!open) {
          setShow(false)
        }
      },
      ...floatingOptions,
    }
  )

  const internalSuggestionPropsRef = React.useRef(internalSuggestionProps)

  React.useEffect(() => {
    internalSuggestionPropsRef.current = internalSuggestionProps
  }, [internalSuggestionProps])

  const closePopup = React.useCallback(() => {
    setShow(false)
  }, [])

  React.useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return
    }

    const existingPlugin = editor.state.plugins.find(
      (plugin) => plugin.spec.key === pluginKey
    )
    if (existingPlugin) {
      editor.unregisterPlugin(pluginKey)
    }

    const suggestion = Suggestion({
      pluginKey:
        pluginKey instanceof PluginKey ? pluginKey : new PluginKey(pluginKey),
      editor,

      command({ editor, range, props }) {
        if (!range) {
          return
        }

        const { view, state } = editor
        const { selection } = state

        const isMention = editor.extensionManager.extensions.some(
          (extension) => {
            const name = extension.name
            return (
              name === "mention" &&
              extension.options?.suggestion?.char ===
                internalSuggestionPropsRef.current.char
            )
          }
        )

        if (!isMention) {
          const cursorPosition = selection.$from.pos
          const previousNode = selection.$head?.nodeBefore

          const startPosition = previousNode
            ? calculateStartPosition(
                cursorPosition,
                previousNode,
                internalSuggestionPropsRef.current.char
              )
            : selection.$from.start()

          const transaction = state.tr.deleteRange(
            startPosition,
            cursorPosition
          )
          view.dispatch(transaction)
        }

        const nodeAfter = view.state.selection.$to.nodeAfter
        const overrideSpace = nodeAfter?.text?.startsWith(" ")

        const rangeToUse = { ...range }

        if (overrideSpace) {
          rangeToUse.to += 1
        }

        props.onSelect({ editor, range: rangeToUse, context: props.context })
      },

      render: () => {
        return {
          onStart: (props: SuggestionProps<SuggestionItem>) => {
            setInternalCommand(() => props.command)
            setInternalItems(props.items)
            setInternalQuery(props.query)
            setInternalRange(props.range)
            setInternalClientRect(props.clientRect?.() ?? null)
            setShow(true)
          },

          onUpdate: (props: SuggestionProps<SuggestionItem>) => {
            setInternalCommand(() => props.command)
            setInternalItems(props.items)
            setInternalQuery(props.query)
            setInternalRange(props.range)
            setInternalClientRect(props.clientRect?.() ?? null)
          },

          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (props.event.key === "Escape") {
              closePopup()
              return true
            }
            return false
          },

          onExit: () => {
            setInternalCommand(null)
            setInternalItems([])
            setInternalQuery("")
            setInternalRange(null)
            setInternalClientRect(null)
            setShow(false)
          },
        }
      },
      ...internalSuggestionPropsRef.current,
    })

    editor.registerPlugin(suggestion)

    return () => {
      if (!editor.isDestroyed) {
        editor.unregisterPlugin(pluginKey)
      }
    }
  }, [editor, pluginKey, closePopup])

  const onSelect = React.useCallback(
    (item: SuggestionItem) => {
      closePopup()

      if (internalCommand) {
        internalCommand(item)
      }
    },
    [closePopup, internalCommand]
  )

  const { selectedIndex } = useMenuNavigation({
    editor: editor,
    query: internalQuery,
    items: internalItems,
    onSelect,
  })

  if (!isMounted || !show || !editor) {
    return null
  }

  return (
    <div
      ref={ref}
      style={style}
      {...getFloatingProps()}
      data-selector={selector}
      className="tiptap-suggestion-menu"
      role="listbox"
      aria-label="Suggestions"
      onPointerDown={(e) => e.preventDefault()}
    >
      {children({
        items: internalItems,
        selectedIndex,
        onSelect,
      })}
    </div>
  )
}
