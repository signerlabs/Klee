import { NodeSelection, type Selection } from "@tiptap/pm/state"
import type { JSONContent, Editor } from "@tiptap/react"
import { isTextSelection, isNodeSelection, posToDOMRect } from "@tiptap/react"

// TipTap Collaboration
export const TIPTAP_COLLAB_DOC_PREFIX =
  import.meta.env.VITE_TIPTAP_COLLAB_DOC_PREFIX || ""
export const TIPTAP_COLLAB_APP_ID =
  import.meta.env.VITE_TIPTAP_COLLAB_APP_ID || ""
export const TIPTAP_COLLAB_TOKEN =
  import.meta.env.VITE_TIPTAP_COLLAB_TOKEN || ""

// TipTap AI
export const TIPTAP_AI_APP_ID = import.meta.env.VITE_TIPTAP_AI_APP_ID || ""
export const TIPTAP_AI_TOKEN = import.meta.env.VITE_TIPTAP_AI_TOKEN || ""

export const USE_JWT_TOKEN_API_ENDPOINT =
  import.meta.env.VITE_USE_JWT_TOKEN_API_ENDPOINT || ""

const NODE_TYPE_LABELS: Record<string, string> = {
  paragraph: "text",
  codeBlock: "Codeblock",
}
export type OverflowPosition = "none" | "top" | "bottom" | "both"

/**
 * Utility function to get URL parameters
 */
export const getUrlParam = (param: string): string | null => {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  return params.get(param)
}

/**
 * Returns a display name for the current node in the editor
 * @param editor The Tiptap editor instance
 * @returns The display name of the current node
 */
export const getNodeDisplayName = (editor: Editor | null): string => {
  if (!editor) return "Node"

  const { selection } = editor.state

  if (selection instanceof NodeSelection) {
    const nodeType = selection.node.type.name
    return NODE_TYPE_LABELS[nodeType] || nodeType.toLowerCase()
  }

  const { $anchor } = selection
  const nodeType = $anchor.parent.type.name
  return NODE_TYPE_LABELS[nodeType] || nodeType.toLowerCase()
}

/**
 * Removes empty paragraph nodes from content
 */
export const removeEmptyParagraphs = (content: JSONContent) => ({
  ...content,
  content: content.content?.filter(
    (node) =>
      node.type !== "paragraph" ||
      node.content?.some((child) => child.text?.trim() || child.type !== "text")
  ),
})

/**
 * Determines how a target element overflows relative to a container element
 */
export function getElementOverflowPosition(
  targetElement: Element,
  containerElement: HTMLElement
): OverflowPosition {
  const targetBounds = targetElement.getBoundingClientRect()
  const containerBounds = containerElement.getBoundingClientRect()

  const isOverflowingTop = targetBounds.top < containerBounds.top
  const isOverflowingBottom = targetBounds.bottom > containerBounds.bottom

  if (isOverflowingTop && isOverflowingBottom) return "both"
  if (isOverflowingTop) return "top"
  if (isOverflowingBottom) return "bottom"
  return "none"
}

/**
 * Checks if the current selection is valid for a given editor
 */
export const isSelectionValid = (
  editor: Editor | null,
  selection?: Selection,
  excludedNodeTypes: string[] = ["imageUpload", "horizontalRule"]
): boolean => {
  if (!editor) return false
  if (!selection) selection = editor.state.selection

  const { state } = editor
  const { doc } = state
  const { empty, from, to } = selection

  const isEmptyTextBlock =
    !doc.textBetween(from, to).length && isTextSelection(selection)
  const isCodeBlock =
    selection.$from.parent.type.spec.code ||
    (isNodeSelection(selection) && selection.node.type.spec.code)
  const isExcludedNode =
    isNodeSelection(selection) &&
    excludedNodeTypes.includes(selection.node.type.name)

  return !empty && !isEmptyTextBlock && !isCodeBlock && !isExcludedNode
}

/**
 * Checks if the current text selection is valid for editing
 * - Not empty
 * - Not a code block
 * - Not a node selection
 */
export const isTextSelectionValid = (editor: Editor | null): boolean => {
  if (!editor) return false
  const { state } = editor
  const { selection } = state
  const isValid =
    isTextSelection(selection) &&
    !selection.empty &&
    !selection.$from.parent.type.spec.code &&
    !isNodeSelection(selection)

  return isValid
}

/**
 * Gets the bounding rect of the current selection in the editor.
 */
export const getSelectionBoundingRect = (editor: Editor): DOMRect | null => {
  const { state } = editor.view
  const { selection } = state
  const { ranges } = selection

  const from = Math.min(...ranges.map((range) => range.$from.pos))
  const to = Math.max(...ranges.map((range) => range.$to.pos))

  if (isNodeSelection(selection)) {
    const node = editor.view.nodeDOM(from) as HTMLElement
    if (node) {
      return node.getBoundingClientRect()
    }
  }

  return posToDOMRect(editor.view, from, to)
}

/**
 * Generates a deterministic avatar URL from a user name
 */
export const getAvatar = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }

  const randomFraction = (Math.abs(hash) % 1000000) / 1000000
  const id = 1 + Math.floor(randomFraction * 20)
  const idString = id.toString().padStart(2, "0")
  return `/avatars/memoji_${idString}.png`
}

/**
 * Fetch collaboration JWT token from the API
 */
export const fetchCollabToken = async () => {
  if (USE_JWT_TOKEN_API_ENDPOINT) {
    try {
      // Example API endpoint that returns a JWT token.
      // TODO: implement this API endpoint in your app
      const apiBaseUrl = import.meta.env.DEV
        ? '' // 开发环境使用相对路径（Vite 代理）
        : (import.meta.env.VITE_API_URL || 'http://rafa-prod.eba-mmc3gc5h.us-east-1.elasticbeanstalk.com')

      const response = await fetch(`${apiBaseUrl}/api/collaboration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.status}`)
      }

      const data = await response.json()
      return data.token
    } catch (error) {
      console.error("Failed to fetch collaboration token:", error)
      return null
    }
  }

  // TODO: as a developer, use the example JWT token provided in the Tiptap
  // Cloud dashboard for local development only. In production, implement an API
  // endpoint that generates a new JWT token in the server. Then, call that API
  // endpoint from this function.
  // When you've implemented the API endpoint, remove the code below.
  if (!TIPTAP_COLLAB_TOKEN) {
    alert(`Set up your environment variables to connect to Tiptap Cloud:
- VITE_TIPTAP_COLLAB_DOC_PREFIX - Prefix for identifying collaborative documents
- VITE_TIPTAP_COLLAB_APP_ID - Your Document Server App ID
- VITE_TIPTAP_COLLAB_TOKEN - JWT token for accessing Collaboration services (do not use in production)
- VITE_TIPTAP_AI_APP_ID - Your AI App ID
- VITE_TIPTAP_AI_TOKEN - JWT token for accessing AI services (do not use in production)
Follow this guide: https://tiptap.dev/docs/ui-components/templates/notion-like-editor`)
  } else {
    console.warn(
      "You are using the example JWT token provided in the Tiptap Cloud dashboard. This is only for local development and should not be used in production. In production, implement an API endpoint that generates a new JWT token in the server, and call that API endpoint from the fetchCollabToken function. More info in the docs: https://tiptap.dev/docs/ui-components/templates/notion-like-editor"
    )
  }

  // A hardcoded token for demonstration purposes.
  // TODO: remove this in production and use the API endpoint instead
  return TIPTAP_COLLAB_TOKEN
}

/**
 * Fetch AI JWT token from the API
 */
export const fetchAiToken = async () => {
  if (USE_JWT_TOKEN_API_ENDPOINT) {
    try {
      // Example API endpoint that returns a JWT token.
      // TODO: implement this API endpoint in your app
      const apiBaseUrl = import.meta.env.DEV
        ? '' // 开发环境使用相对路径（Vite 代理）
        : (import.meta.env.VITE_API_URL || 'http://rafa-prod.eba-mmc3gc5h.us-east-1.elasticbeanstalk.com')

      const response = await fetch(`${apiBaseUrl}/api/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.status}`)
      }

      const data = await response.json()
      return data.token
    } catch (error) {
      console.error("Failed to fetch AI token:", error)
      return null
    }
  }

  // TODO: as a developer, use the example JWT token provided in the Tiptap
  // Cloud dashboard for local development only. In production, implement an API
  // endpoint that generates a new JWT token in the server. Then, call that API
  // endpoint from this function.
  // When you've implemented the API endpoint, remove the code below.
  if (!TIPTAP_AI_TOKEN) {
    alert(`Set up your environment variables to connect to Tiptap Cloud:
- VITE_TIPTAP_COLLAB_DOC_PREFIX - Prefix for identifying collaborative documents
- VITE_TIPTAP_COLLAB_APP_ID - Your Document Server App ID
- VITE_TIPTAP_COLLAB_TOKEN - JWT token for accessing Collaboration services (do not use in production)
- VITE_TIPTAP_AI_APP_ID - Your AI App ID
- VITE_TIPTAP_AI_TOKEN - JWT token for accessing AI services (do not use in production)
Follow this guide: https://tiptap.dev/docs/ui-components/templates/notion-like-editor`)
  } else {
    console.warn(
      "You are using the example JWT token provided in the Tiptap Cloud dashboard. This is only for local development and should not be used in production. In production, implement an API endpoint that generates a new JWT token in the server, and call that API endpoint from the fetchAiToken function. More info in the docs: https://tiptap.dev/docs/ui-components/templates/notion-like-editor"
    )
  }

  // A hardcoded token for demonstration purposes.
  // TODO: remove this in production and use the API endpoint instead
  return TIPTAP_AI_TOKEN
}
