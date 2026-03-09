import type { Action } from "@/components/tiptap-ui-primitive/menu"
import { type TextOptions } from "@tiptap-pro/extension-ai"
import type { Editor } from "@tiptap/react"

export interface MenuActionBase {
  icon: React.ReactNode
  label: string
  value: string
}

export interface ExecutableMenuAction extends MenuActionBase {
  type: "executable"
  onSelect: (params: {
    editor: Editor | null
    onDone?: () => void
    options?: TextOptions
  }) => void
}

export interface NestedMenuAction extends MenuActionBase {
  type: "nested"
  component: React.ComponentType<{
    editor: Editor | null
  }>
  filterItems?: boolean
  items?: Array<{ label: string; value: string }>
}

export type EditorMenuAction = ExecutableMenuAction | NestedMenuAction

export type MenuActionIdentifier =
  | "adjustTone"
  | "aiFixSpellingAndGrammar"
  | "aiExtend"
  | "aiShorten"
  | "simplifyLanguage"
  | "improveWriting"
  | "emojify"
  | "continueWriting"
  | "summarize"
  | "translateTo"

export interface MenuActionRendererProps {
  menuItem: Action
  availableActions: Record<string, EditorMenuAction>
  editor: Editor | null
}
