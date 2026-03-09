import * as React from "react"

// --- Lib ---
import { getElementOverflowPosition } from "@/lib/tiptap-collab-utils"

// --- Tiptap UI ---
import type {
  SuggestionMenuProps,
  SuggestionItem,
  SuggestionMenuRenderProps,
} from "@/components/tiptap-ui-utils/suggestion-menu"
import { filterSuggestionItems } from "@/components/tiptap-ui-utils/suggestion-menu"
import { SuggestionMenu } from "@/components/tiptap-ui-utils/suggestion-menu"

// --- Hooks ---
import type { SlashMenuConfig } from "@/components/tiptap-ui/slash-dropdown-menu/use-slash-dropdown-menu"
import { useSlashDropdownMenu } from "@/components/tiptap-ui/slash-dropdown-menu/use-slash-dropdown-menu"

// --- UI Primitives ---
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import { Separator } from "@/components/tiptap-ui-primitive/separator"
import {
  Card,
  CardBody,
  CardGroupLabel,
  CardItemGroup,
} from "@/components/tiptap-ui-primitive/card"

import "@/components/tiptap-ui/slash-dropdown-menu/slash-dropdown-menu.scss"

type SlashDropdownMenuProps = Omit<
  SuggestionMenuProps,
  "items" | "children"
> & {
  config?: SlashMenuConfig
}

export const SlashDropdownMenu = (props: SlashDropdownMenuProps) => {
  const { config, ...restProps } = props
  const { getSlashMenuItems } = useSlashDropdownMenu(config)

  return (
    <SuggestionMenu
      char="/"
      pluginKey="slashDropdownMenu"
      decorationClass="tiptap-slash-decoration"
      decorationContent="Filter..."
      selector="tiptap-slash-dropdown-menu"
      items={({ query, editor }) =>
        filterSuggestionItems(getSlashMenuItems(editor), query)
      }
      {...restProps}
    >
      {(props) => <List {...props} config={config} />}
    </SuggestionMenu>
  )
}

const Item = (props: {
  item: SuggestionItem
  isSelected: boolean
  onSelect: () => void
}) => {
  const { item, isSelected, onSelect } = props
  const itemRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    const selector = document.querySelector(
      '[data-selector="tiptap-slash-dropdown-menu"]'
    ) as HTMLElement
    if (!itemRef.current || !isSelected || !selector) return

    const overflow = getElementOverflowPosition(itemRef.current, selector)

    if (overflow === "top") {
      itemRef.current.scrollIntoView(true)
    } else if (overflow === "bottom") {
      itemRef.current.scrollIntoView(false)
    }
  }, [isSelected])

  const BadgeIcon = item.badge

  return (
    <Button
      ref={itemRef}
      data-style="ghost"
      data-active-state={isSelected ? "on" : "off"}
      onClick={onSelect}
    >
      {BadgeIcon && <BadgeIcon className="tiptap-button-icon" />}
      <div className="tiptap-button-text">{item.title}</div>
    </Button>
  )
}

const List = ({
  items,
  selectedIndex,
  onSelect,
  config,
}: SuggestionMenuRenderProps & { config?: SlashMenuConfig }) => {
  const renderedItems = React.useMemo(() => {
    const rendered: React.ReactElement[] = []
    const showGroups = config?.showGroups !== false

    if (!showGroups) {
      items.forEach((item, index) => {
        rendered.push(
          <Item
            key={`item-${index}-${item.title}`}
            item={item}
            isSelected={index === selectedIndex}
            onSelect={() => onSelect(item)}
          />
        )
      })
      return rendered
    }

    const groups: {
      [groupLabel: string]: { items: SuggestionItem[]; indices: number[] }
    } = {}

    items.forEach((item, index) => {
      const groupLabel = item.group || ""
      if (!groups[groupLabel]) {
        groups[groupLabel] = { items: [], indices: [] }
      }
      groups[groupLabel].items.push(item)
      groups[groupLabel].indices.push(index)
    })

    Object.entries(groups).forEach(([groupLabel, groupData], groupIndex) => {
      if (groupIndex > 0) {
        rendered.push(
          <Separator key={`separator-${groupIndex}`} orientation="horizontal" />
        )
      }

      const groupItems = groupData.items.map((item, itemIndex) => {
        const originalIndex = groupData.indices[itemIndex]
        return (
          <Item
            key={`item-${originalIndex}-${item.title}`}
            item={item}
            isSelected={originalIndex === selectedIndex}
            onSelect={() => onSelect(item)}
          />
        )
      })

      if (groupLabel) {
        rendered.push(
          <CardItemGroup key={`group-${groupIndex}-${groupLabel}`}>
            <CardGroupLabel>{groupLabel}</CardGroupLabel>
            <ButtonGroup>{groupItems}</ButtonGroup>
          </CardItemGroup>
        )
      } else {
        rendered.push(...groupItems)
      }
    })

    return rendered
  }, [items, selectedIndex, onSelect, config?.showGroups])

  if (!renderedItems.length) {
    return null
  }

  return (
    <Card
      className="tiptap-slash-card"
      style={{
        maxHeight: "var(--suggestion-menu-max-height)",
      }}
    >
      <CardBody className="tiptap-slash-card-body">{renderedItems}</CardBody>
    </Card>
  )
}
