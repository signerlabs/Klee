"use client"

import * as React from "react"
import type { Editor, Range } from "@tiptap/react"

// --- Lib ---
import { getElementOverflowPosition } from "@/lib/tiptap-collab-utils"

// --- Tiptap UI ---
import type {
  SuggestionItem,
  SuggestionMenuProps,
  SuggestionMenuRenderProps,
} from "@/components/tiptap-ui-utils/suggestion-menu"
import { SuggestionMenu } from "@/components/tiptap-ui-utils/suggestion-menu"

// --- UI Primitives ---
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/tiptap-ui-primitive/avatar"
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import { Card, CardBody } from "@/components/tiptap-ui-primitive/card"

interface User {
  id: number
  name: string
  position: string
  avatarUrl: string
}

type MentionDropdownMenuProps = Omit<SuggestionMenuProps, "items" | "children">

interface MentionItemProps {
  item: SuggestionItem<User>
  isSelected: boolean
  onSelect: () => void
}

const fetchUsers = async (query: string): Promise<User[]> => {
  const employeeData = [
    ["Emily Johnson", "Marketing Manager"],
    ["Michael Thompson", "Sales Manager"],
    ["Sophia Lee", "Product Designer"],
    ["William Davis", "IT Project Manager"],
    ["Olivia Wilson", "HR Specialist"],
    ["Daniel Taylor", "Financial Controller"],
    ["Isabella Anderson", "Graphic Designer"],
    ["Jacob Martinez", "Sales Representative"],
    ["Ava Hernandez", "Marketing Assistant"],
    ["Alexander Diaz", "IT Support"],
    ["Emma Ramirez", "HR Specialist"],
    ["Ethan Flores", "Product Manager"],
    ["Mia Morales", "Graphic Designer"],
    ["Noah Reyes", "Sales Manager"],
    ["Isabella Castillo", "Marketing Manager"],
    ["Liam Gutierrez", "IT Project Manager"],
    ["Avery Jimenez", "HR Specialist"],
    ["Lucas Vargas", "Product Designer"],
    ["Chloe Rojas", "Graphic Designer"],
    ["Kai Zhang", "Sales Representative"],
  ] as const

  const userData = {
    users: employeeData.map(([name, position], index) => {
      const id = index + 1
      const avatarNumber = id < 10 ? `0${id}` : `${id}`

      return {
        id,
        name,
        position,
        avatarUrl: `/avatars/memoji_${avatarNumber}.png`,
      }
    }),
  }

  if (!query) return userData.users

  return userData.users.filter(
    (user) =>
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.position.toLowerCase().includes(query.toLowerCase())
  )
}

export const MentionDropdownMenu = (props: MentionDropdownMenuProps) => {
  const handleItemSelect = (props: {
    editor: Editor
    range: Range
    context?: User
  }) => {
    if (!props.editor || !props.range || !props.context) return

    props.editor
      .chain()
      .focus()
      .insertContentAt(props.range, [
        {
          type: "mention",
          attrs: {
            id: props.context.id.toString(),
            label: props.context.name,
          },
        },
        {
          type: "text",
          text: " ",
        },
      ])
      .run()
  }

  const getSuggestionItems = async (props: { query: string }) => {
    const users = await fetchUsers(props.query)

    return users.map((user) => ({
      title: user.name,
      subtext: user.name,
      context: user,
      onSelect: handleItemSelect,
    }))
  }

  return (
    <SuggestionMenu
      char="@"
      pluginKey="mentionDropdownMenu"
      decorationClass="tiptap-mention-decoration"
      selector="tiptap-mention-dropdown-menu"
      items={getSuggestionItems}
      {...props}
    >
      {(props) => <MentionList {...props} />}
    </SuggestionMenu>
  )
}

const MentionItem = ({ item, isSelected, onSelect }: MentionItemProps) => {
  const itemRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    const menuElement = document.querySelector(
      '[data-selector="tiptap-mention-dropdown-menu"]'
    ) as HTMLElement
    if (!itemRef.current || !isSelected || !menuElement) return

    const overflow = getElementOverflowPosition(itemRef.current, menuElement)
    if (overflow === "top") {
      itemRef.current.scrollIntoView(true)
    } else if (overflow === "bottom") {
      itemRef.current.scrollIntoView(false)
    }
  }, [isSelected])

  return (
    <Button
      ref={itemRef}
      data-style="ghost"
      data-active-state={isSelected ? "on" : "off"}
      onClick={onSelect}
      data-user-id={item.context?.id}
    >
      <Avatar>
        <AvatarImage src={item.context?.avatarUrl} alt={item.title} />
        <AvatarFallback>{item.title[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>

      <span className="tiptap-button-text">{item.title}</span>
    </Button>
  )
}

const MentionList = ({
  items,
  selectedIndex,
  onSelect,
}: SuggestionMenuRenderProps<User>) => {
  const renderedItems = React.useMemo(() => {
    const rendered: React.ReactElement[] = []

    items.forEach((item, index) => {
      rendered.push(
        <MentionItem
          key={item.context?.id || item.title}
          item={item}
          isSelected={index === selectedIndex}
          onSelect={() => onSelect(item)}
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
