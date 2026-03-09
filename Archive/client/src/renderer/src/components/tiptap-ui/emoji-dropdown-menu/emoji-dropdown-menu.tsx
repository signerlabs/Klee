import * as React from "react"
import type { Editor, Range } from "@tiptap/react"
import type { EmojiItem } from "@tiptap/extension-emoji"

// --- Tiptap UI ---
import type {
  SuggestionItem,
  SuggestionMenuProps,
  SuggestionMenuRenderProps,
} from "@/components/tiptap-ui-utils/suggestion-menu"
import { SuggestionMenu } from "@/components/tiptap-ui-utils/suggestion-menu"
import {
  EmojiMenuItem,
  getFilteredEmojis,
} from "@/components/tiptap-ui/emoji-menu"
import { Card, CardBody } from "@/components/tiptap-ui-primitive/card"
import { ButtonGroup } from "@/components/tiptap-ui-primitive/button"

export type EmojiDropdownMenuProps = Omit<
  SuggestionMenuProps,
  "items" | "children"
>

export const EmojiDropdownMenu = (props: EmojiDropdownMenuProps) => {
  return (
    <SuggestionMenu
      char=":"
      pluginKey="emojiDropdownMenu"
      decorationClass="tiptap-emoji-decoration"
      selector="tiptap-emoji-dropdown-menu"
      items={getSuggestionItems}
      {...props}
    >
      {(props) => <EmojiList {...props} />}
    </SuggestionMenu>
  )
}

const getSuggestionItems = async (props: { query: string; editor: Editor }) => {
  const emojis: EmojiItem[] = props.editor.extensionStorage.emoji.emojis || []
  const filteredEmojis = getFilteredEmojis({ query: props.query, emojis })

  return filteredEmojis.map(
    (emoji): SuggestionItem => ({
      title: emoji.name,
      subtext: emoji.shortcodes.join(", "),
      context: emoji,
      onSelect: (props: {
        editor: Editor
        range: Range
        context?: EmojiItem
      }) => {
        if (!props.editor || !props.range || !props.context) return
        props.editor.chain().focus().setEmoji(props.context.name).run()
      },
    })
  )
}

const EmojiList = ({
  items,
  selectedIndex,
  onSelect,
}: SuggestionMenuRenderProps<EmojiItem>) => {
  const renderedItems = React.useMemo(() => {
    const rendered: React.ReactElement[] = []

    items.forEach((item, index) => {
      if (!item.context) return

      rendered.push(
        <EmojiMenuItem
          key={item.title}
          emoji={item.context}
          index={index}
          isSelected={index === selectedIndex}
          onSelect={() => onSelect(item)}
          selector="[data-selector='tiptap-emoji-dropdown-menu']"
        />
      )
    })

    return rendered
  }, [items, selectedIndex, onSelect])

  if (!renderedItems.length) {
    return null
  }

  return (
    <Card
      style={{
        maxHeight: "var(--suggestion-menu-max-height)",
      }}
    >
      <CardBody>
        <ButtonGroup>{renderedItems}</ButtonGroup>
      </CardBody>
    </Card>
  )
}
