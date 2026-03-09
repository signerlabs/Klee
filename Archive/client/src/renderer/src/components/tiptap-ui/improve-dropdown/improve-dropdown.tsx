import * as React from "react"
import { type Editor } from "@tiptap/react"
import type { Language, TextOptions, Tone } from "@tiptap-pro/extension-ai"
import { NodeSelection } from "@tiptap/pm/state"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { MicAiIcon } from "@/components/tiptap-icons/mic-ai-icon"
import { AiSparklesIcon } from "@/components/tiptap-icons/ai-sparkles-icon"
import { CheckAiIcon } from "@/components/tiptap-icons/check-ai-icon"
import { TextExtendIcon } from "@/components/tiptap-icons/text-extend-icon"
import { TextReduceIcon } from "@/components/tiptap-icons/text-reduce-icon"
import { Simplify2Icon } from "@/components/tiptap-icons/simplify-2-icon"
import { SmileAiIcon } from "@/components/tiptap-icons/smile-ai-icon"
import { CompleteSentenceIcon } from "@/components/tiptap-icons/complete-sentence-icon"
import { SummarizeTextIcon } from "@/components/tiptap-icons/summarize-text-icon"
import { LanguagesIcon } from "@/components/tiptap-icons/languages-icon"
import { ChevronRightIcon } from "@/components/tiptap-icons/chevron-right-icon"

// --- Tiptap UI ---
import {
  SUPPORTED_LANGUAGES,
  SUPPORTED_TONES,
} from "@/components/tiptap-ui/ai-menu"
import { AiAskButton } from "@/components/tiptap-ui/ai-ask-button"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/tiptap-ui-primitive/dropdown-menu"
import { Card, CardBody } from "@/components/tiptap-ui-primitive/card"
import { Separator } from "@/components/tiptap-ui-primitive/separator"

export interface ToneOption {
  label: string
  value: Tone
  icon?: React.ComponentType<{ className?: string }>
}

export interface ImproveDropdownProps extends Omit<ButtonProps, "type"> {
  /**
   * Optional editor instance. If not provided, will use editor from context
   */
  editor?: Editor
  /**
   * List of AI command types to show in the dropdown.
   */
  types?: Tone[]
  /**
   * Optional text options for AI commands
   * @default { stream: true, format: "rich-text" }
   */
  textOptions?: TextOptions
  /**
   * Whether to hide the dropdown when AI features are not available
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Whether to render the dropdown menu in a portal
   * @default false
   */
  portal?: boolean
}

type AICommand =
  | "fixSpellingAndGrammar"
  | "extend"
  | "shorten"
  | "simplify"
  | "emojify"
  | "complete"
  | "summarize"

interface MenuAction {
  icon: React.ComponentType<{ className?: string }>
  label: string
  command: AICommand
  onClick: () => void
}

interface SubMenuAction {
  icon: React.ComponentType<{ className?: string }>
  label: string
  items: Array<{
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
    onClick: () => void
  }>
}

const AI_EXCLUDED_BLOCKS = [
  "image",
  "imageUpload",
  "video",
  "audio",
  "table",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
]

export function canUseAi(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false

  const { selection } = editor.state

  if (selection.empty) {
    return false
  }

  if (selection instanceof NodeSelection) {
    if (!selection.node.content.size) {
      return false
    }

    const node = selection.node
    if (AI_EXCLUDED_BLOCKS.includes(node.type.name)) {
      return false
    }
  }

  return true
}

export function shouldShowImproveDropdown(params: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, hideWhenUnavailable } = params

  if (!editor || !editor.isEditable) {
    return false
  }

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canUseAi(editor)
  }

  return true
}

export function useImproveDropdownState(
  editor: Editor | null,
  hideWhenUnavailable: boolean = false
) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [show, setShow] = React.useState(false)
  const isDisabled = !canUseAi(editor)

  const handleOpenChange = React.useCallback(
    (open: boolean, callback?: (isOpen: boolean) => void) => {
      if (!editor || isDisabled) return
      setIsOpen(open)
      callback?.(open)
    },
    [editor, isDisabled]
  )

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setShow(
        shouldShowImproveDropdown({
          editor,
          hideWhenUnavailable,
        })
      )
    }

    handleSelectionUpdate()
    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable])

  return {
    isDisabled,
    isOpen,
    setIsOpen,
    handleOpenChange,
    show,
  }
}

function useAICommands(editor: Editor | null, textOptions?: TextOptions) {
  const defaultOptions = React.useMemo(
    () => ({
      stream: true,
      format: "rich-text" as const,
      ...textOptions,
    }),
    [textOptions]
  )

  const executeAICommand = React.useCallback(
    (command: AICommand) => {
      if (!editor) return

      editor.chain().focus().aiGenerationShow().run()

      setTimeout(() => {
        switch (command) {
          case "fixSpellingAndGrammar":
            editor.commands.aiFixSpellingAndGrammar(defaultOptions)
            break
          case "extend":
            editor.commands.aiExtend(defaultOptions)
            break
          case "shorten":
            editor.commands.aiShorten(defaultOptions)
            break
          case "simplify":
            editor.commands.aiSimplify(defaultOptions)
            break
          case "emojify":
            editor.commands.aiEmojify(defaultOptions)
            break
          case "complete":
            editor.commands.aiComplete(defaultOptions)
            break
          case "summarize":
            editor.commands.aiSummarize(defaultOptions)
            break
        }
      }, 0)
    },
    [editor, defaultOptions]
  )

  const adjustTone = React.useCallback(
    (tone: Tone) => {
      if (!editor) return
      editor.chain().focus().aiGenerationShow().run()

      setTimeout(() => {
        editor.commands.aiAdjustTone(tone, defaultOptions)
      }, 0)
    },
    [editor, defaultOptions]
  )

  const translate = React.useCallback(
    (language: Language) => {
      if (!editor) return
      editor.chain().focus().aiGenerationShow().run()

      setTimeout(() => {
        editor.commands.aiTranslate(language, defaultOptions)
      }, 0)
    },
    [editor, defaultOptions]
  )

  return {
    executeAICommand,
    adjustTone,
    translate,
  }
}

function SubMenuButton({ action }: { action: SubMenuAction }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger asChild>
        <Button data-style="ghost" type="button">
          <action.icon className="tiptap-button-icon" />
          <span className="tiptap-button-text">{action.label}</span>
          <ChevronRightIcon className="tiptap-button-icon-sub" />
        </Button>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <Card>
          <CardBody>
            <ButtonGroup>
              {action.items.map((item) => (
                <DropdownMenuItem key={item.value} asChild>
                  <Button
                    type="button"
                    data-style="ghost"
                    onClick={item.onClick}
                  >
                    {item.icon && <item.icon className="tiptap-button-icon" />}
                    <span className="tiptap-button-text">{item.label}</span>
                  </Button>
                </DropdownMenuItem>
              ))}
            </ButtonGroup>
          </CardBody>
        </Card>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function ImproveDropdown({
  editor: providedEditor,
  hideWhenUnavailable = false,
  textOptions,
  portal = false,
  ...props
}: ImproveDropdownProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const { executeAICommand, adjustTone, translate } = useAICommands(
    editor,
    textOptions
  )
  const { isDisabled, isOpen, handleOpenChange, show } =
    useImproveDropdownState(editor, hideWhenUnavailable)

  const menuActions: MenuAction[] = React.useMemo(
    () => [
      {
        icon: CheckAiIcon,
        label: "Fix spelling & grammar",
        command: "fixSpellingAndGrammar",
        onClick: () => executeAICommand("fixSpellingAndGrammar"),
      },
      {
        icon: TextExtendIcon,
        label: "Extend text",
        command: "extend",
        onClick: () => executeAICommand("extend"),
      },
      {
        icon: TextReduceIcon,
        label: "Reduce text",
        command: "shorten",
        onClick: () => executeAICommand("shorten"),
      },
      {
        icon: Simplify2Icon,
        label: "Simplify text",
        command: "simplify",
        onClick: () => executeAICommand("simplify"),
      },
      {
        icon: SmileAiIcon,
        label: "Emojify",
        command: "emojify",
        onClick: () => executeAICommand("emojify"),
      },
    ],
    [executeAICommand]
  )

  const secondaryActions: MenuAction[] = React.useMemo(
    () => [
      {
        icon: CompleteSentenceIcon,
        label: "Complete sentence",
        command: "complete",
        onClick: () => executeAICommand("complete"),
      },
      {
        icon: SummarizeTextIcon,
        label: "Summarize",
        command: "summarize",
        onClick: () => executeAICommand("summarize"),
      },
    ],
    [executeAICommand]
  )

  const subMenuActions: SubMenuAction[] = React.useMemo(
    () => [
      {
        icon: MicAiIcon,
        label: "Adjust tone",
        items: SUPPORTED_TONES.map((option) => ({
          label: option.label,
          value: option.value,
          onClick: () => adjustTone(option.value),
        })),
      },
    ],
    [adjustTone]
  )

  const translateSubMenu: SubMenuAction = React.useMemo(
    () => ({
      icon: LanguagesIcon,
      label: "Translate",
      items: SUPPORTED_LANGUAGES.map((option) => ({
        label: option.label,
        value: option.value,
        icon: LanguagesIcon,
        onClick: () => translate(option.value),
      })),
    }),
    [translate]
  )

  if (!show || !editor || !editor.isEditable) {
    return null
  }

  return (
    <DropdownMenu modal open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          data-style="ghost"
          disabled={isDisabled}
          data-disabled={isDisabled}
          role="button"
          tabIndex={-1}
          aria-label="Improve"
          tooltip="Improve"
          {...props}
        >
          <AiSparklesIcon className="tiptap-button-icon" />
          <span className="tiptap-button-text">Improve</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" portal={portal}>
        <Card>
          <CardBody>
            <ButtonGroup>
              {subMenuActions.map((action, index) => (
                <SubMenuButton key={index} action={action} />
              ))}

              {menuActions.map((action, index) => (
                <DropdownMenuItem key={index} asChild>
                  <Button
                    type="button"
                    data-style="ghost"
                    onClick={action.onClick}
                  >
                    <action.icon className="tiptap-button-icon" />
                    <span className="tiptap-button-text">{action.label}</span>
                  </Button>
                </DropdownMenuItem>
              ))}
            </ButtonGroup>

            <Separator orientation="horizontal" />

            <ButtonGroup>
              <DropdownMenuItem asChild>
                <AiAskButton text="Ask AI" showTooltip={false} />
              </DropdownMenuItem>

              {secondaryActions.map((action, index) => (
                <DropdownMenuItem key={index} asChild>
                  <Button
                    type="button"
                    data-style="ghost"
                    onClick={action.onClick}
                  >
                    <action.icon className="tiptap-button-icon" />
                    <span className="tiptap-button-text">{action.label}</span>
                  </Button>
                </DropdownMenuItem>
              ))}

              <SubMenuButton action={translateSubMenu} />
            </ButtonGroup>
          </CardBody>
        </Card>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ImproveDropdown
