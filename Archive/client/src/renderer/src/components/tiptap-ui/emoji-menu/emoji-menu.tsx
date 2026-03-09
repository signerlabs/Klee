import * as React from "react"
import type { EmojiItem } from "@tiptap/extension-emoji"

// --- Hooks ---
import { useMenuNavigation } from "@/hooks/use-menu-navigation"

// --- Lib ---
import { getElementOverflowPosition } from "@/lib/tiptap-collab-utils"

// --- UI Primitives ---
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import { Input } from "@/components/tiptap-ui-primitive/input"
import { Card, CardBody, CardHeader } from "@/components/tiptap-ui-primitive/card"

import { getFilteredEmojis } from "./emoji-menu-utils"

// --- Styles ---
import "@/components/tiptap-ui/emoji-menu/emoji-menu.scss"

export interface EmojiMenuItemProps<T extends EmojiItem> {
  emoji: T
  index: number
  isSelected: boolean
  onSelect: (emoji: T) => void
  selector: string
}

export const EmojiMenuItem = <T extends EmojiItem>(
  props: EmojiMenuItemProps<T>
) => {
  const { emoji, isSelected, onSelect, selector } = props
  const itemRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    const menuElement = document.querySelector(selector) as HTMLElement
    if (!itemRef.current || !isSelected || !menuElement) return

    const overflow = getElementOverflowPosition(itemRef.current, menuElement)
    if (overflow === "top") {
      itemRef.current.scrollIntoView(true)
    } else if (overflow === "bottom") {
      itemRef.current.scrollIntoView(false)
    }
  }, [isSelected, selector])

  if (!emoji) return null

  return (
    <Button
      ref={itemRef}
      data-style="ghost"
      data-active-state={isSelected ? "on" : "off"}
      onClick={() => onSelect(emoji)}
    >
      {emoji.fallbackImage ? (
        <img
          className="tiptap-button-emoji"
          src={emoji.fallbackImage}
          alt={emoji.name}
        />
      ) : (
        <span className="tiptap-button-emoji">{emoji.emoji}</span>
      )}
      <span className="tiptap-button-text">:{emoji.name}:</span>
    </Button>
  )
}

export interface EmojiMenuProps<T extends EmojiItem> {
  emojis: T[]
  onSelect: (emoji: T) => void
  onClose?: () => void
  showSearch?: boolean
  selector?: string
}

export const EmojiMenu = <T extends EmojiItem>(props: EmojiMenuProps<T>) => {
  const {
    emojis,
    onSelect,
    onClose,
    showSearch = false,
    selector = ".emoji-menu-list",
  } = props

  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const [searchQuery, setSearchQuery] = React.useState("")

  const filteredEmojis = React.useMemo(() => {
    const filtered = getFilteredEmojis({ query: searchQuery, emojis })
    return filtered
  }, [emojis, searchQuery])

  const { selectedIndex } = useMenuNavigation({
    containerRef,
    query: searchQuery,
    items: filteredEmojis,
    onSelect,
    onClose,
  })

  const renderedItems = React.useMemo(() => {
    return filteredEmojis.map((emoji, index) => (
      <EmojiMenuItem
        key={emoji.name}
        emoji={emoji}
        index={index}
        isSelected={index === selectedIndex}
        onSelect={() => onSelect(emoji)}
        selector={selector}
      />
    ))
  }, [filteredEmojis, selectedIndex, onSelect, selector])

  return (
    <Card ref={containerRef}>
      {showSearch && (
        <CardHeader>
          <Input
            ref={searchRef}
            type="text"
            placeholder="Add a emoji reaction..."
            value={searchQuery}
            autoFocus
            onChange={(e) => setSearchQuery(e.target.value)}
            className="emoji-menu-search-input"
          />
        </CardHeader>
      )}

      {renderedItems.length && (
        <CardBody className="emoji-menu-list">
          <ButtonGroup>{renderedItems}</ButtonGroup>
        </CardBody>
      )}
    </Card>
  )
}
