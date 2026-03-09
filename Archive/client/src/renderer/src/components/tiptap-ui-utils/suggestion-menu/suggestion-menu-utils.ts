import type { Node } from "@tiptap/pm/model"
import type { SuggestionItem } from "./suggestion-menu-types"

/**
 * Calculates the start position of a suggestion command in the text.
 *
 * @param cursorPosition Current cursor position
 * @param previousNode Node before the cursor
 * @param triggerChar Character that triggers the suggestion
 * @returns The position where the command starts
 */
export function calculateStartPosition(
  cursorPosition: number,
  previousNode: Node | null,
  triggerChar?: string
): number {
  if (!previousNode?.text || !triggerChar) {
    return cursorPosition
  }

  const commandText = previousNode.text
  const triggerCharIndex = commandText.lastIndexOf(triggerChar)

  if (triggerCharIndex === -1) {
    return cursorPosition
  }

  const textLength = commandText.substring(triggerCharIndex).length

  return cursorPosition - textLength
}

/**
 * Filters and sorts suggestion items based on a search query.
 *
 * @param items List of suggestion items to filter
 * @param query Search query string
 * @returns Filtered and sorted list of suggestions
 */
export function filterSuggestionItems(items: SuggestionItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return items
  }

  return items
    .filter((item) => {
      if (item.title.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      if (item.subtext?.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      if (
        item.keywords?.some((keyword) =>
          keyword.toLowerCase().includes(normalizedQuery)
        )
      ) {
        return true
      }

      return false
    })
    .sort((a, b) => {
      // Prioritize exact matches and "starts with" matches
      const aTitle = a.title.toLowerCase()
      const bTitle = b.title.toLowerCase()

      if (aTitle === normalizedQuery && bTitle !== normalizedQuery) return -1
      if (bTitle === normalizedQuery && aTitle !== normalizedQuery) return 1
      if (
        aTitle.startsWith(normalizedQuery) &&
        !bTitle.startsWith(normalizedQuery)
      )
        return -1
      if (
        bTitle.startsWith(normalizedQuery) &&
        !aTitle.startsWith(normalizedQuery)
      )
        return 1

      return 0
    })
}
