"use client"

import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { type Editor } from "@tiptap/react"
import type { Node } from "@tiptap/pm/model"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsMobile } from "@/hooks/use-mobile"

// --- Utils ---
import {
  getAnchorNodeAndPos,
  getEditorExtension,
} from "@/lib/tiptap-advanced-utils"

// --- Icons ---
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

export const COPY_ANCHOR_LINK_SHORTCUT_KEY = "mod+ctrl+l"

/**
 * Configuration for the copy anchor link functionality
 */
export interface UseCopyAnchorLinkConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Whether the button should hide when no node ID is available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Called when the copy operation finishes.
   * Provides a boolean indicating whether a node ID was found.
   */
  onNodeIdNotFound?: (found: boolean) => void
  /**
   * Called after the node ID is extracted.
   * Provides the extracted node ID, or null if none found.
   */
  onExtractedNodeId?: (nodeId: string | null) => void
  /**
   * Callback function called after a successful copy operation.
   */
  onCopied?: () => void
}

/**
 * Validates if editor is ready for operations
 */
function isEditorReady(editor: Editor | null): boolean {
  return !!(editor && editor.isEditable)
}

/**
 * Gets the attribute name for unique IDs from the editor extension
 */
function getAttributeName(editor: Editor): string {
  const ext = getEditorExtension(editor, "uniqueID")
  return ext?.options?.attributeName || "data-id"
}

/**
 * Comprehensive node info retrieval with validation
 */
function getNodeWithId(editor: Editor | null): {
  node: Node
  nodeId: string | null
  hasNodeId: boolean
} | null {
  if (!isEditorReady(editor)) return null

  const nodeInfo = getAnchorNodeAndPos(editor!)
  if (!nodeInfo) return null

  const attributeName = getAttributeName(editor!)
  const nodeId = extractNodeId(nodeInfo.node, attributeName)

  return {
    node: nodeInfo.node,
    nodeId,
    hasNodeId: nodeId !== null,
  }
}

/**
 * Extracts the data-id from a node
 */
export function extractNodeId(
  node: Node | null,
  attributeName: string
): string | null {
  if (!node?.attrs?.[attributeName]) return null

  try {
    return node.attrs[attributeName]
  } catch {
    return null
  }
}

/**
 * Checks if a node has a data-id that can be copied
 */
export function canCopyAnchorLink(editor: Editor | null): boolean {
  const nodeWithId = getNodeWithId(editor)
  return nodeWithId?.hasNodeId ?? false
}

/**
 * Extracts and copies the node ID to clipboard with full URL like Notion
 */
export async function copyNodeId(
  editor: Editor | null,
  onExtractedNodeId?: (nodeId: string | null) => void,
  onNodeIdNotFound?: (found: boolean) => void
): Promise<boolean> {
  const nodeWithId = getNodeWithId(editor)

  if (!nodeWithId) return false

  const { nodeId, hasNodeId } = nodeWithId

  onExtractedNodeId?.(nodeId)
  onNodeIdNotFound?.(!hasNodeId)

  if (!hasNodeId || !nodeId) return false

  try {
    const currentUrl = new URL(window.location.href)

    currentUrl.searchParams.set("source", "copy_link")
    currentUrl.hash = nodeId

    await navigator.clipboard.writeText(currentUrl.toString())
    return true
  } catch (err) {
    console.error("Failed to copy node ID to clipboard:", err)
    return false
  }
}

/**
 * Determines if the copy anchor link button should be shown
 */
export function shouldShowButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, hideWhenUnavailable } = props

  if (!isEditorReady(editor)) return false

  const hasNode = !!getAnchorNodeAndPos(editor!)

  if (!hideWhenUnavailable) return hasNode

  return canCopyAnchorLink(editor)
}

/**
 * Custom hook that provides copy anchor link functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage - no params needed
 * function MyCopyAnchorLinkButton() {
 *   const { isVisible, handleCopyAnchorLink } = useCopyAnchorLink()
 *
 *   if (!isVisible) return null
 *
 *   return <button onClick={handleCopyAnchorLink}>Copy Link</button>
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedCopyAnchorLinkButton() {
 *   const { isVisible, handleCopyAnchorLink, label } = useCopyAnchorLink({
 *     editor: myEditor,
 *     hideWhenUnavailable: true,
 *     onCopied: () => console.log('Link copied!')
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <MyButton
 *       onClick={handleCopyAnchorLink}
 *       aria-label={label}
 *     >
 *       Copy Anchor Link
 *     </MyButton>
 *   )
 * }
 * ```
 */
export function useCopyAnchorLink(config?: UseCopyAnchorLinkConfig) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onNodeIdNotFound,
    onExtractedNodeId,
    onCopied,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsMobile()
  const [isVisible, setIsVisible] = React.useState<boolean>(true)
  const canCopyAnchor = canCopyAnchorLink(editor)

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

  const handleCopyAnchorLink = React.useCallback(async () => {
    const success = await copyNodeId(
      editor,
      onExtractedNodeId,
      onNodeIdNotFound
    )

    if (success) {
      onCopied?.()
    }

    return success
  }, [editor, onExtractedNodeId, onNodeIdNotFound, onCopied])

  useHotkeys(
    COPY_ANCHOR_LINK_SHORTCUT_KEY,
    (event) => {
      event.preventDefault()
      handleCopyAnchorLink()
    },
    {
      enabled: isVisible && canCopyAnchor,
      enableOnContentEditable: !isMobile,
      enableOnFormTags: true,
    }
  )

  return {
    isVisible,
    handleCopyAnchorLink,
    canCopyAnchorLink: canCopyAnchor,
    label: "Copy anchor link",
    shortcutKeys: COPY_ANCHOR_LINK_SHORTCUT_KEY,
    Icon: LinkIcon,
  }
}
