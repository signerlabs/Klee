import type { DragHandleProps } from "@tiptap/extension-drag-handle-react"
import type { Node } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/react"

export interface DragContextMenuProps
  extends Omit<DragHandleProps, "editor" | "children"> {
  editor?: Editor | null
  withSlashCommandTrigger?: boolean
  mobileBreakpoint?: number
}

export interface NodeChangeData {
  node: Node | null
  editor: Editor
  pos: number
}

export interface MenuItemProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  onClick: () => void
  disabled?: boolean
  isActive?: boolean
  shortcutBadge?: React.ReactNode
}

export interface MenuActionVisibility {
  hasAnyActionGroups: boolean
  hasColorActions: boolean
  hasTransformActions: boolean
  hasResetFormatting: boolean
  hasImage: boolean
}

export interface ColorMenuItemProps {
  color: { value: string; label: string }
}
