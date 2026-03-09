import * as React from "react"

// --- Lib ---
import { parseShortcutKeys } from "@/lib/tiptap-utils"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Tiptap UI ---
import type { UseCopyAnchorLinkConfig } from "./use-copy-anchor-link"
import {
  COPY_ANCHOR_LINK_SHORTCUT_KEY,
  useCopyAnchorLink,
} from "./use-copy-anchor-link"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Badge } from "@/components/tiptap-ui-primitive/badge"

export interface CopyAnchorLinkButtonProps
  extends Omit<ButtonProps, "type">,
    UseCopyAnchorLinkConfig {
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

export function CopyAnchorLinkShortcutBadge({
  shortcutKeys = COPY_ANCHOR_LINK_SHORTCUT_KEY,
}: {
  shortcutKeys?: string
}) {
  return <Badge>{parseShortcutKeys({ shortcutKeys })}</Badge>
}

/**
 * Button component for copying anchor links in a Tiptap editor.
 *
 * For custom button implementations, use the `useCopyAnchorLink` hook instead.
 */
export const CopyAnchorLinkButton = React.forwardRef<
  HTMLButtonElement,
  CopyAnchorLinkButtonProps
>(
  (
    {
      editor: providedEditor,
      text,
      hideWhenUnavailable = false,
      onNodeIdNotFound,
      onExtractedNodeId,
      onCopied,
      showShortcut = false,
      onClick,
      children,
      ...buttonProps
    },
    ref
  ) => {
    const { editor } = useTiptapEditor(providedEditor)
    const { isVisible, handleCopyAnchorLink, label, shortcutKeys, Icon } =
      useCopyAnchorLink({
        editor,
        hideWhenUnavailable,
        onNodeIdNotFound,
        onExtractedNodeId,
        onCopied,
      })

    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        handleCopyAnchorLink()
      },
      [handleCopyAnchorLink, onClick]
    )

    if (!isVisible) {
      return null
    }

    return (
      <Button
        type="button"
        data-style="ghost"
        role="button"
        tabIndex={-1}
        aria-label={label}
        tooltip="Copy anchor link"
        onClick={handleClick}
        {...buttonProps}
        ref={ref}
      >
        {children ?? (
          <>
            <Icon className="tiptap-button-icon" />
            {text && <span className="tiptap-button-text">{text}</span>}
            {showShortcut && (
              <CopyAnchorLinkShortcutBadge shortcutKeys={shortcutKeys} />
            )}
          </>
        )}
      </Button>
    )
  }
)

CopyAnchorLinkButton.displayName = "CopyAnchorLinkButton"
