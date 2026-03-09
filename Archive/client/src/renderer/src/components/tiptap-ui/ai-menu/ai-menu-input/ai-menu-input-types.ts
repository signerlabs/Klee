export interface BaseAiMenuInputProps {
  onInputSubmit: (value: string) => void
  onToneChange?: (tone: string) => void
  onClose?: () => void
  onInputFocus?: () => void
  onInputBlur?: () => void
  onEmptyBlur?: () => void
  showPlaceholder?: boolean
  onPlaceholderClick?: () => void
}

export interface AiMenuInputTextareaProps
  extends BaseAiMenuInputProps,
    Omit<React.ComponentProps<"div">, "style"> {
  placeholder?: string
}
