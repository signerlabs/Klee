"use client"

import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { type Editor } from "@tiptap/react"
import type { Node } from "@tiptap/pm/model"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsMobile } from "@/hooks/use-mobile"

// --- Icons ---
import { PlusIcon } from "@/components/tiptap-icons/plus-icon"

// --- Lib ---
import {
  findNodePosition,
  isNodeTypeSelected,
  isValidPosition,
} from "@/lib/tiptap-utils"

export const SLASH_COMMAND_TRIGGER_SHORTCUT_KEY = "mod+/"

/**
 * Configuration for the slash command functionality
 */
export interface UseSlashCommandTriggerConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * The node to apply trigger to
   */
  node?: Node | null
  /**
   * The position of the node in the document
   */
  nodePos?: number | null
  /**
   * The trigger text to insert
   * @default "/"
   */
  trigger?: string
  /**
   * Whether the button should hide when insertion is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Callback function called after a successful trigger insertion.
   */
  onTriggered?: (trigger: string) => void
}

/**
 * Checks if a slash command can be inserted in the current editor state
 */
export function canInsertSlashCommand(
  editor: Editor | null,
  node?: Node | null,
  nodePos?: number | null
): boolean {
  if (!editor || !editor.isEditable) return false
  if (isNodeTypeSelected(editor, ["image"])) return false

  if (node || isValidPosition(nodePos)) {
    if (isValidPosition(nodePos) && nodePos! >= 0) return true

    if (node) {
      const foundPos = findNodePosition({ editor, node })
      return foundPos !== null
    }
  }

  return true
}

/**
 * Inserts a slash command at a specified node position or after the current selection
 */
export function insertSlashCommand(
  editor: Editor | null,
  trigger: string = "/",
  node?: Node | null,
  nodePos?: number | null
): boolean {
  if (!editor || !editor.isEditable) return false
  if (!canInsertSlashCommand(editor, node, nodePos)) return false

  try {
    if ((node !== undefined && node !== null) || isValidPosition(nodePos)) {
      const foundPos = findNodePosition({
        editor,
        node: node || undefined,
        nodePos: nodePos || undefined,
      })

      if (!foundPos) {
        return false
      }

      const isEmpty =
        foundPos.node.type.name === "paragraph" &&
        foundPos.node.content.size === 0
      const insertPos = isEmpty
        ? foundPos.pos
        : foundPos.pos + foundPos.node.nodeSize

      editor.view.dispatch(
        editor.view.state.tr
          .scrollIntoView()
          .insertText(trigger, insertPos, insertPos)
      )

      const triggerLength = trigger.length + 1 // +1 for the space after the trigger
      const focusPos = isEmpty
        ? foundPos.pos + triggerLength
        : foundPos.pos + foundPos.node.nodeSize + triggerLength
      editor.commands.focus(focusPos)

      return true
    }

    const { $from } = editor.state.selection
    const currentNode = $from.node()
    const isEmpty = currentNode.textContent.length === 0
    const isStartOfBlock = $from.parentOffset === 0

    // Check if we're at the document node level
    // This is important if we dont have focus on the editor
    // and we want to insert the slash at the end of the document
    const isTopLevel = $from.depth === 0

    if (!isEmpty || !isStartOfBlock) {
      const insertPosition = isTopLevel
        ? editor.state.doc.content.size
        : $from.after()

      return editor
        .chain()
        .insertContentAt(insertPosition, {
          type: "paragraph",
          content: [{ type: "text", text: trigger }],
        })
        .focus()
        .run()
    }

    return editor
      .chain()
      .insertContent({ type: "text", text: trigger })
      .focus()
      .run()
  } catch {
    return false
  }
}

/**
 * Determines if the slash command button should be shown
 */
export function shouldShowButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
  node?: Node | null
  nodePos?: number | null
}): boolean {
  const { editor, hideWhenUnavailable, node, nodePos } = props

  if (!editor || !editor.isEditable) return false

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canInsertSlashCommand(editor, node, nodePos)
  }

  return true
}

/**
 * Custom hook that provides slash command functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage - no params needed
 * function MySimpleSlashButton() {
 *   const { isVisible, handleSlashCommand } = useSlashCommandTrigger()
 *
 *   if (!isVisible) return null
 *
 *   return <button onClick={handleSlashCommand}>Insert Block</button>
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedSlashButton() {
 *   const { isVisible, handleSlashCommand, label } = useSlashCommandTrigger({
 *     editor: myEditor,
 *     trigger: "/",
 *     hideWhenUnavailable: true,
 *     onTriggered: (trigger) => console.log('Inserted:', trigger)
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <MyButton
 *       onClick={handleSlashCommand}
 *       aria-label={label}
 *     >
 *       Insert Block
 *     </MyButton>
 *   )
 * }
 * ```
 */
export function useSlashCommandTrigger(config?: UseSlashCommandTriggerConfig) {
  const {
    editor: providedEditor,
    node,
    nodePos,
    trigger = "/",
    hideWhenUnavailable = false,
    onTriggered,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsMobile()
  const [isVisible, setIsVisible] = React.useState<boolean>(true)
  const canInsert = canInsertSlashCommand(editor, node, nodePos)

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(
        shouldShowButton({ editor, hideWhenUnavailable, node, nodePos })
      )
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable, node, nodePos])

  const handleSlashCommand = React.useCallback(() => {
    if (!editor) return false

    const success = insertSlashCommand(editor, trigger, node, nodePos)
    if (success) {
      onTriggered?.(trigger)
    }
    return success
  }, [editor, trigger, node, nodePos, onTriggered])

  useHotkeys(
    SLASH_COMMAND_TRIGGER_SHORTCUT_KEY,
    (event) => {
      event.preventDefault()
      handleSlashCommand()
    },
    {
      enabled: isVisible && canInsert,
      enableOnContentEditable: !isMobile,
      enableOnFormTags: true,
    },
    [isVisible, canInsert, handleSlashCommand]
  )

  return {
    isVisible,
    handleSlashCommand,
    canInsert,
    label: "Insert block",
    shortcutKeys: SLASH_COMMAND_TRIGGER_SHORTCUT_KEY,
    trigger,
    Icon: PlusIcon,
  }
}
