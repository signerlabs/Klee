import { type Editor } from "@tiptap/react"
import { getSelectedDOMElement } from "@/lib/tiptap-advanced-utils"

export function getContextAndInsertAt(editor: Editor) {
  let context: string | undefined = ""
  let insertAt = { from: 0, to: 0 }
  let isSelection = true
  const generatedWith = editor.storage.ai.generatedWith

  if (generatedWith && generatedWith.range) {
    context = editor.storage.ai.response
    insertAt = generatedWith.range
    isSelection = false
  }

  if (!generatedWith || !generatedWith.range) {
    const { state } = editor
    const { selection } = state
    const { from, to } = editor.state.selection

    const selectionContent = selection.content()

    const htmlContent =
      editor.view.serializeForClipboard(selectionContent).dom.innerHTML
    const textContent = selectionContent.content.textBetween(
      0,
      selectionContent.content.size,
      "\n"
    )

    context = htmlContent || textContent
    insertAt = { from, to }
  }

  return { context, insertAt, isSelection }
}

export function createPositionAnchor(rect: DOMRect): HTMLElement {
  const anchor = document.createElement("div")
  Object.assign(anchor.style, {
    position: "absolute",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: "none",
    opacity: "0",
    zIndex: "-1",
  })

  anchor.setAttribute("data-fallback-anchor", "true")
  document.body.appendChild(anchor)
  return anchor
}

export function cleanupFallbackAnchors(): void {
  document
    .querySelectorAll('[data-fallback-anchor="true"]')
    .forEach((el) => el.remove())
}

export function getTopMostParentInsideEditor(
  element: HTMLElement,
  editorRoot: HTMLElement
): HTMLElement {
  if (!element || !editorRoot) {
    throw new Error("Both element and editorRoot must be provided")
  }

  if (element === editorRoot) return element

  if (!editorRoot.contains(element)) {
    throw new Error("Element is not inside the editor root")
  }

  let parent = element
  while (parent.parentElement && parent.parentElement !== editorRoot) {
    parent = parent.parentElement
  }

  return parent
}

export function findAiMarkedDOMElement(editor: Editor): HTMLElement | null {
  const view = editor.view
  const aiMarkedElements = view.dom.querySelectorAll(
    ".tiptap-ai-insertion"
  ) as NodeListOf<HTMLElement>

  if (aiMarkedElements.length === 0) return null

  const lastAiMarkElement = aiMarkedElements[aiMarkedElements.length - 1]

  if (lastAiMarkElement && view.dom) {
    try {
      return getTopMostParentInsideEditor(lastAiMarkElement, view.dom)
    } catch {
      return lastAiMarkElement || null
    }
  }

  return lastAiMarkElement || null
}

export function findPrioritizedAIElement(editor: Editor): HTMLElement | null {
  // AI marked elements
  const aiMarkedElement = findAiMarkedDOMElement(editor)
  if (aiMarkedElement) {
    return aiMarkedElement
  }

  // Currently selected element
  const selectedElement = getSelectedDOMElement(editor)
  if (selectedElement) {
    return selectedElement
  }

  return null
}
