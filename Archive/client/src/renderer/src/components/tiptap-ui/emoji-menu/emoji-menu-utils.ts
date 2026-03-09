import type { EmojiItem } from "@tiptap/extension-emoji"

const MAX_SUGGESTIONS = 100
const SORT_EMOJIS = <T extends EmojiItem>(a: T, b: T) =>
  a.name.localeCompare(b.name)

export const searchEmojiData = <T extends EmojiItem>(
  query: string,
  emojiData: T
): boolean => {
  const lowercaseQuery = query.toLowerCase().trim()

  return (
    emojiData.name.toLowerCase().includes(lowercaseQuery) ||
    emojiData.shortcodes.some((shortName) =>
      shortName.toLowerCase().includes(lowercaseQuery)
    ) ||
    emojiData.tags.some((tag) => tag.toLowerCase().includes(lowercaseQuery))
  )
}

export const getFilteredEmojis = <T extends EmojiItem>(props: {
  query: string
  emojis: T[]
}) => {
  const { query, emojis } = props
  const trimmedQuery = query.trim()

  const filteredEmojis = !trimmedQuery
    ? emojis.slice(0, MAX_SUGGESTIONS)
    : emojis
        .filter((emoji) => searchEmojiData(trimmedQuery, emoji))
        .slice(0, MAX_SUGGESTIONS)

  return filteredEmojis.sort(SORT_EMOJIS)
}
