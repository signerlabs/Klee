"use client"

import * as React from "react"

// --- Lib ---
import { parseShortcutKeys } from "@/lib/tiptap-utils"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Tiptap UI ---
import type { UseColorTextConfig } from "@/components/tiptap-ui/color-text-button"
import {
  COLOR_TEXT_SHORTCUT_KEY,
  useColorText,
} from "@/components/tiptap-ui/color-text-button"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Badge } from "@/components/tiptap-ui-primitive/badge"

// --- Styles ---
import "@/components/tiptap-ui/color-text-button/color-text-button.scss"

export interface ColorTextButtonProps
  extends Omit<ButtonProps, "type">,
    UseColorTextConfig {
  /**
   * Optional text to display alongside the icon.
   */
  text?: string
  /**
   * Optional show shortcut keys in the button.
   * @default false
   */
  showShortcut?: boolean
}

export function ColorTextShortcutBadge({
  shortcutKeys = COLOR_TEXT_SHORTCUT_KEY,
}: {
  shortcutKeys?: string
}) {
  return <Badge>{parseShortcutKeys({ shortcutKeys })}</Badge>
}

/**
 * Button component for applying text colors in a Tiptap editor.
 *
 * For custom button implementations, use the `useColorText` hook instead.
 */
export const ColorTextButton = React.forwardRef<
  HTMLButtonElement,
  ColorTextButtonProps
>(
  (
    {
      editor: providedEditor,
      textColor,
      text,
      hideWhenUnavailable = false,
      onApplied,
      showShortcut = false,
      onClick,
      children,
      style,
      ...buttonProps
    },
    ref
  ) => {
    const { editor } = useTiptapEditor(providedEditor)
    const {
      isVisible,
      canColorText,
      isActive,
      handleColorText,
      label,
      shortcutKeys,
      Icon,
    } = useColorText({
      editor,
      textColor,
      label: text || `Color text to ${textColor}`,
      hideWhenUnavailable,
      onApplied,
    })

    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        handleColorText()
      },
      [handleColorText, onClick]
    )

    const buttonStyle = React.useMemo(
      () =>
        ({
          ...style,
          "--color-text-button-color": textColor,
        }) as React.CSSProperties,
      [textColor, style]
    )

    if (!isVisible) {
      return null
    }

    return (
      <Button
        type="button"
        data-style="ghost"
        data-active-state={isActive ? "on" : "off"}
        role="button"
        tabIndex={-1}
        disabled={!canColorText}
        data-disabled={!canColorText}
        aria-label={label}
        aria-pressed={isActive}
        tooltip={label}
        onClick={handleClick}
        style={buttonStyle}
        {...buttonProps}
        ref={ref}
      >
        {children ?? (
          <>
            <span
              className="tiptap-button-color-text"
              style={{ color: textColor }}
            >
              <Icon
                className="tiptap-button-icon"
                style={{ color: textColor, flexGrow: 1 }}
              />
            </span>
            {text && <span className="tiptap-button-text">{text}</span>}
            {showShortcut && (
              <ColorTextShortcutBadge shortcutKeys={shortcutKeys} />
            )}
          </>
        )}
      </Button>
    )
  }
)

ColorTextButton.displayName = "ColorTextButton"
