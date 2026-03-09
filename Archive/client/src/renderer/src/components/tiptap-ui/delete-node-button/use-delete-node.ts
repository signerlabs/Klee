"use client"

import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { type Editor } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsMobile } from "@/hooks/use-mobile"

// --- Icons ---
import { TrashIcon } from "@/components/tiptap-icons/trash-icon"

export const DELETE_NODE_SHORTCUT_KEY = "backspace"

/**
 * Configuration for the delete node functionality
 */
export interface UseDeleteNodeConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Whether the button should hide when node deletion is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Callback function called after a successful deletion.
   */
  onDeleted?: () => void
}

/**
 * Checks if a node can be deleted based on the current selection
 */
export function canDeleteNode(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false

  const { state } = editor
  const { selection } = state

  if (selection instanceof NodeSelection) {
    return true
  }

  const $pos = selection.$anchor

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    const pos = $pos.before(depth)

    // Check if we could delete the range from pos to pos + nodeSize
    const tr = state.tr.delete(pos, pos + node.nodeSize)
    if (tr.doc !== state.doc) {
      return true
    }
  }

  return false
}

/**
 * Helper function to delete a node with fallback strategy
 */
export function deleteNodeAtPosition(
  editor: Editor,
  pos: number,
  nodeSize: number
): boolean {
  const chain = editor.chain().focus()
  const success = chain.deleteRange({ from: pos, to: pos + nodeSize }).run()

  if (success) return true

  // Fallback
  return chain.setNodeSelection(pos).deleteSelection().run()
}

/**
 * Deletes the selected node in the editor using current selection
 */
export function deleteNode(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false

  try {
    const { state } = editor
    const { selection } = state

    if (selection instanceof NodeSelection) {
      const pos = selection.from
      const selectedNode = selection.node

      if (!selectedNode) return false

      return deleteNodeAtPosition(editor, pos, selectedNode.nodeSize)
    }

    const $pos = selection.$anchor

    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth)
      const pos = $pos.before(depth)

      if (node && node.isBlock) {
        return deleteNodeAtPosition(editor, pos, node.nodeSize)
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Determines if the delete node button should be shown
 */
export function shouldShowButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, hideWhenUnavailable } = props

  if (!editor || !editor.isEditable) return false

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canDeleteNode(editor)
  }

  return true
}

/**
 * Custom hook that provides delete node functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage - no params needed
 * function MySimpleDeleteButton() {
 *   const { isVisible, handleDeleteNode } = useDeleteNode()
 *
 *   if (!isVisible) return null
 *
 *   return <button onClick={handleDeleteNode}>Delete</button>
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedDeleteButton() {
 *   const { isVisible, handleDeleteNode, label } = useDeleteNode({
 *     editor: myEditor,
 *     hideWhenUnavailable: true,
 *     onDeleted: () => console.log('Node deleted!')
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <MyButton
 *       onClick={handleDeleteNode}
 *       aria-label={label}
 *     >
 *       Delete Node
 *     </MyButton>
 *   )
 * }
 * ```
 */
export function useDeleteNode(config?: UseDeleteNodeConfig) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onDeleted,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsMobile()
  const [isVisible, setIsVisible] = React.useState<boolean>(true)
  const canDeleteNodeState = canDeleteNode(editor)

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(shouldShowButton({ editor, hideWhenUnavailable }))
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable])

  const handleDeleteNode = React.useCallback(() => {
    if (!editor) return false

    const success = deleteNode(editor)
    if (success) {
      onDeleted?.()
    }
    return success
  }, [editor, onDeleted])

  useHotkeys(
    DELETE_NODE_SHORTCUT_KEY,
    (event) => {
      event.preventDefault()
      handleDeleteNode()
    },
    {
      enabled: isVisible && canDeleteNodeState,
      enableOnContentEditable: !isMobile,
      enableOnFormTags: true,
    }
  )

  return {
    isVisible,
    handleDeleteNode,
    canDeleteNode: canDeleteNodeState,
    label: "Delete",
    shortcutKeys: DELETE_NODE_SHORTCUT_KEY,
    Icon: TrashIcon,
  }
}
