import type { Attrs, Node } from "@tiptap/pm/model"
import { findNodePosition, isValidPosition } from "./tiptap-utils"
import type { Editor } from "@tiptap/react"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"

/**
 * Splits an array into chunks of specified size
 */
export function chunkArray<T>(array: Array<T>, size: number): Array<Array<T>> {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
    array.slice(index * size, index * size + size)
  )
}

/**
 * Helper function to check if there's content above the current position
 */
export function hasContentAbove(editor: Editor | null): {
  hasContent: boolean
  content: string
} {
  if (!editor) return { hasContent: false, content: "" }

  const { state } = editor
  const { $from } = state.selection

  for (let i = $from.index(0) - 1; i >= 0; i--) {
    const node = state.doc.child(i)
    const content = node.textContent.trim()

    if (content) {
      return { hasContent: true, content }
    }
  }

  return { hasContent: false, content: "" }
}

/**
 * Gets the active attributes of a specific mark in the current editor selection.
 *
 * @param editor - The Tiptap editor instance.
 * @param markName - The name of the mark to look for (e.g., "highlight", "link").
 * @returns The attributes of the active mark, or `null` if the mark is not active.
 */
export function getActiveMarkAttrs(
  editor: Editor | null,
  markName: string
): Attrs | null {
  if (!editor) return null

  const { state } = editor
  const { from, to, empty, $from } = state.selection

  if (empty) {
    const mark = $from.marks().find((m) => m.type.name === markName)
    return mark?.attrs ?? null
  }

  const seen = new Set<string>()
  let foundAttrs: Attrs | null = null

  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return

    for (const mark of node.marks) {
      if (mark.type.name === markName && !seen.has(mark.type.name)) {
        seen.add(mark.type.name)
        foundAttrs = mark.attrs
      }
    }
  })

  return foundAttrs
}

/**
 * Finds the position of a node in the editor selection
 * @param params Object containing editor, node (optional), and nodePos (optional)
 * @returns The position of the node in the selection or null if not found
 */
export function findSelectionPosition(params: {
  editor: Editor
  node?: Node | null
  nodePos?: number | null
}): number | null {
  const { editor, node, nodePos } = params

  if (isValidPosition(nodePos)) return nodePos

  if (node) {
    const found = findNodePosition({ editor, node })
    if (found) return found.pos
  }

  const { selection } = editor.state
  if (!selection.empty) return null

  const resolvedPos = selection.$anchor
  const nodeDepth = 1
  const selectedNode = resolvedPos.node(nodeDepth)

  return selectedNode ? resolvedPos.before(nodeDepth) : null
}

/**
 * Gets the currently selected DOM element in the editor
 * @param editor The Tiptap editor instance
 * @returns The selected DOM element or null if no selection is present
 */
export function getSelectedDOMElement(editor: Editor): HTMLElement | null {
  const { state, view } = editor
  const { selection } = state

  if (selection instanceof NodeSelection) {
    return view.nodeDOM(selection.from) as HTMLElement | null
  }

  if (selection instanceof TextSelection) {
    const $anchor = selection.$anchor

    // Ensure the depth is sufficient to avoid errors
    if ($anchor.depth >= 1) {
      const dom = view.nodeDOM($anchor.before(1))
      if (dom instanceof HTMLElement) {
        return dom
      }
    }
  }

  return null
}

/**
 * Gets the closest block node from the current selection in the editor
 * @param editor The Tiptap editor instance
 * @returns An object containing the closest block node, its position, and depth, or null if not found
 */
export function getClosestBlockNode(editor: Editor | null) {
  if (!editor) return null
  const { selection } = editor.state
  const { $from } = selection

  let depth = $from.depth
  while (depth > 0) {
    const node = $from.node(depth)
    if (node.type.isBlock) {
      const pos = $from.before(depth)
      return { node, pos, depth }
    }
    depth--
  }
  return null
}

/**
 * Gets the anchor node and its position in the editor.
 * @param editor The Tiptap editor instance
 * @param allowEmptySelection If true, still returns the node at the cursor position even if selection is empty
 * @returns An object containing the anchor node and its position, or null if not found
 */
export function getAnchorNodeAndPos(
  editor: Editor | null,
  allowEmptySelection: boolean = true
): { node: Node; pos: number } | null {
  if (!editor) return null

  const { state } = editor
  const { selection } = state

  if (selection instanceof NodeSelection) {
    const node = selection.node
    const pos = selection.from

    if (node && isValidPosition(pos)) {
      return { node, pos }
    }
  }

  if (selection.empty && !allowEmptySelection) return null

  const $anchor = selection.$anchor
  const depth = 1 // explicitly use depth 1
  const node = $anchor.node(depth)
  const pos = $anchor.before(depth)

  return { node, pos }
}

/**
 * Checks if the current selection in the editor contains any text.
 *
 * @param editor - The Tiptap editor instance.
 * @returns `true` if the selection contains text, `false` otherwise.
 */
export function selectionHasText(editor: Editor | null): boolean {
  if (!editor) return false

  const { state } = editor
  const { selection, doc } = state

  if (selection.empty) return false

  const text = doc.textBetween(selection.from, selection.to, "\n", "\0")
  return text.trim().length > 0
}

/**
 * Retrieves a specific extension by name from the Tiptap editor.
 * @param editor - The Tiptap editor instance
 * @param extensionName - The name of the extension to retrieve
 * @returns The extension instance if found, otherwise null
 */
export function getEditorExtension(
  editor: Editor | null,
  extensionName: string
) {
  if (!editor) return null

  const extension = editor.extensionManager.extensions.find(
    (ext) => ext.name === extensionName
  )

  if (!extension) {
    console.warn(
      `Extension "${extensionName}" not found in the editor schema. Ensure it is included in the editor configuration.`
    )
    return null
  }

  return extension
}
