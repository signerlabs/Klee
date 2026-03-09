import * as React from "react"
import type { Editor } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"

// --- Tiptap UI ---
import type { Level } from "@/components/tiptap-ui/heading-button"

export const TURN_INTO_BLOCKS = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "codeBlock",
]

/**
 * Configuration for the turn into dropdown functionality
 */
export interface UseTurnIntoDropdownConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Whether the dropdown should hide when no options are available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Which block types to show in the dropdown
   * @default ["paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock"]
   */
  blockTypes?: string[]
  /**
   * Callback function called when the dropdown state changes.
   */
  onOpenChange?: (isOpen: boolean) => void
}

export const blockTypeOptions = [
  {
    type: "paragraph",
    label: "Text",
    isActive: (editor: Editor) =>
      editor.isActive("paragraph") &&
      !editor.isActive("heading") &&
      !editor.isActive("bulletList") &&
      !editor.isActive("orderedList") &&
      !editor.isActive("taskList") &&
      !editor.isActive("blockquote") &&
      !editor.isActive("codeBlock"),
  },
  {
    type: "heading",
    label: "Heading 1",
    level: 1 as Level,
    isActive: (editor: Editor) => editor.isActive("heading", { level: 1 }),
  },
  {
    type: "heading",
    label: "Heading 2",
    level: 2 as Level,
    isActive: (editor: Editor) => editor.isActive("heading", { level: 2 }),
  },
  {
    type: "heading",
    label: "Heading 3",
    level: 3 as Level,
    isActive: (editor: Editor) => editor.isActive("heading", { level: 3 }),
  },
  {
    type: "bulletList",
    label: "Bulleted list",
    isActive: (editor: Editor) => editor.isActive("bulletList"),
  },
  {
    type: "orderedList",
    label: "Numbered list",
    isActive: (editor: Editor) => editor.isActive("orderedList"),
  },
  {
    type: "taskList",
    label: "To-do list",
    isActive: (editor: Editor) => editor.isActive("taskList"),
  },
  {
    type: "blockquote",
    label: "Blockquote",
    isActive: (editor: Editor) => editor.isActive("blockquote"),
  },
  {
    type: "codeBlock",
    label: "Code block",
    isActive: (editor: Editor) => editor.isActive("codeBlock"),
  },
]

/**
 * Checks if turn into functionality can be used in the current editor state
 */
export function canTurnInto(
  editor: Editor | null,
  allowedBlockTypes?: string[]
): boolean {
  if (!editor || !editor.isEditable) return false

  const blockTypes = allowedBlockTypes || TURN_INTO_BLOCKS
  const { selection } = editor.state

  if (selection instanceof NodeSelection) {
    const nodeType = selection.node.type.name
    return blockTypes.includes(nodeType)
  }

  const { $anchor } = selection
  const nodeType = $anchor.parent.type.name
  return blockTypes.includes(nodeType)
}

/**
 * Gets filtered block type options based on available types
 */
export function getFilteredBlockTypeOptions(blockTypes?: string[]) {
  if (!blockTypes) return blockTypeOptions

  return blockTypeOptions.filter((option) => {
    return blockTypes.includes(option.type)
  })
}

/**
 * Gets the currently active block type from the available options
 */
export function getActiveBlockType(
  editor: Editor | null,
  blockTypes?: string[]
) {
  if (!editor) return getFilteredBlockTypeOptions(blockTypes)[0]

  const filteredOptions = getFilteredBlockTypeOptions(blockTypes)
  const activeOption = filteredOptions.find((option) => option.isActive(editor))
  return activeOption || filteredOptions[0]
}

/**
 * Determines if the turn into dropdown should be visible
 */
export function shouldShowTurnInto(params: {
  editor: Editor | null
  hideWhenUnavailable: boolean
  blockTypes?: string[]
}): boolean {
  const { editor, hideWhenUnavailable, blockTypes } = params

  if (!editor) {
    return false
  }

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canTurnInto(editor, blockTypes)
  }

  return true
}

/**
 * Custom hook that provides turn into dropdown functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage
 * function MyTurnIntoDropdown() {
 *   const {
 *     isVisible,
 *     canToggle,
 *     activeBlockType,
 *     handleOpenChange,
 *     label,
 *     Icon,
 *   } = useTurnIntoDropdown()
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <DropdownMenu onOpenChange={handleOpenChange}>
 *       // dropdown content
 *     </DropdownMenu>
 *   )
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedTurnIntoDropdown() {
 *   const {
 *     isVisible,
 *     activeBlockType,
 *   } = useTurnIntoDropdown({
 *     editor: myEditor,
 *     blockTypes: ["paragraph", "heading", "bulletList"],
 *     hideWhenUnavailable: true,
 *     onOpenChange: (isOpen) => console.log("Dropdown toggled", isOpen),
 *   })
 *
 *   // component implementation
 * }
 * ```
 */
export function useTurnIntoDropdown(config?: UseTurnIntoDropdownConfig) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    blockTypes,
    onOpenChange,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const [isOpen, setIsOpen] = React.useState(false)
  const [isVisible, setIsVisible] = React.useState(true)

  const canToggle = canTurnInto(editor, blockTypes)
  const activeBlockType = getActiveBlockType(editor, blockTypes)

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!editor || !canToggle) return
      setIsOpen(open)
      onOpenChange?.(open)
    },
    [canToggle, editor, onOpenChange]
  )

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(
        shouldShowTurnInto({
          editor,
          hideWhenUnavailable,
          blockTypes,
        })
      )
    }

    handleSelectionUpdate()
    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable, blockTypes])

  return {
    isVisible,
    canToggle,
    isOpen,
    setIsOpen,
    activeBlockType,
    handleOpenChange,
    filteredOptions: getFilteredBlockTypeOptions(blockTypes),
    label: `Turn into (current: ${activeBlockType?.label || "Text"})`,
    Icon: ChevronDownIcon,
  }
}
