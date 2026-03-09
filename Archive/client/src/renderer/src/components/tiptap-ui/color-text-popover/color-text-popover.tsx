"use client"

import * as React from "react"

// --- Hooks ---
import { useMenuNavigation } from "@/hooks/use-menu-navigation"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"

// --- Tiptap UI ---
import type {
  ColorType,
  ColorItem,
  RecentColor,
  UseColorTextPopoverConfig,
} from "@/components/tiptap-ui/color-text-popover"
import {
  useColorTextPopover,
  useRecentColors,
  getColorByValue,
} from "@/components/tiptap-ui/color-text-popover"
import {
  TEXT_COLORS,
  ColorTextButton,
} from "@/components/tiptap-ui/color-text-button"
import {
  HIGHLIGHT_COLORS,
  ColorHighlightButton,
} from "@/components/tiptap-ui/color-highlight-button"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/tiptap-ui-primitive/popover"
import {
  Card,
  CardBody,
  CardGroupLabel,
  CardItemGroup,
} from "@/components/tiptap-ui-primitive/card"

// --- Utils ---
import { chunkArray } from "@/lib/tiptap-advanced-utils"

// --- Styles ---
import "@/components/tiptap-ui/color-text-popover/color-text-popover.scss"

export interface RenderColorButtonProps extends ButtonProps {
  colorObj: RecentColor
  withLabel?: boolean
  onColorChanged?: ({
    type,
    label,
    value,
  }: {
    type: ColorType
    label: string
    value: string
  }) => void
}

export const RecentColorButton: React.FC<RenderColorButtonProps> = ({
  colorObj,
  withLabel = false,
  onColorChanged,
  ...props
}) => {
  const colorSet = colorObj.type === "text" ? TEXT_COLORS : HIGHLIGHT_COLORS
  const color = getColorByValue(colorObj.value, colorSet)

  const commonProps = {
    tooltip: color.label,
    text: withLabel ? color.label : undefined,
    onApplied: () =>
      onColorChanged?.({
        type: colorObj.type,
        label: color.label,
        value: color.value,
      }),
    ...props,
  }

  return colorObj.type === "text" ? (
    <ColorTextButton
      textColor={color.value}
      label={color.label}
      {...commonProps}
    />
  ) : (
    <ColorHighlightButton highlightColor={color.value} {...commonProps} />
  )
}

export interface ColorGroupProps {
  type: ColorType
  colors: ColorItem[][]
  onColorSelected: ({
    type,
    label,
    value,
  }: {
    type: ColorType
    label: string
    value: string
  }) => void
  selectedIndex?: number
  startIndexOffset: number
}

export const ColorGroup: React.FC<ColorGroupProps> = ({
  type,
  colors,
  onColorSelected,
  selectedIndex,
  startIndexOffset,
}) => {
  return colors.map((group, groupIndex) => (
    <ButtonGroup key={`${type}-group-${groupIndex}`} orientation="horizontal">
      {group.map((color, colorIndex) => {
        const itemIndex =
          startIndexOffset +
          colors.slice(0, groupIndex).reduce((acc, g) => acc + g.length, 0) +
          colorIndex

        const isHighlighted = selectedIndex === itemIndex

        const commonProps = {
          tooltip: color.label,
          onApplied: () =>
            onColorSelected({ type, label: color.label, value: color.value }),
          tabIndex: isHighlighted ? 0 : -1,
          "data-highlighted": isHighlighted,
          "aria-label": `${color.label} ${type === "text" ? "text" : "highlight"} color`,
        }

        return type === "text" ? (
          <ColorTextButton
            key={`${type}-${color.value}-${colorIndex}`}
            textColor={color.value}
            label={color.label}
            {...commonProps}
          />
        ) : (
          <ColorHighlightButton
            key={`${type}-${color.value}-${colorIndex}`}
            highlightColor={color.value}
            {...commonProps}
          />
        )
      })}
    </ButtonGroup>
  ))
}

interface RecentColorsSectionProps {
  recentColors: RecentColor[]
  onColorSelected: ({
    type,
    label,
    value,
  }: {
    type: ColorType
    label: string
    value: string
  }) => void
  selectedIndex?: number
}

const RecentColorsSection: React.FC<RecentColorsSectionProps> = ({
  recentColors,
  onColorSelected,
  selectedIndex,
}) => {
  if (recentColors.length === 0) return null

  return (
    <CardItemGroup>
      <CardGroupLabel>Recently used</CardGroupLabel>
      <ButtonGroup orientation="horizontal">
        {recentColors.map((colorObj, index) => (
          <RecentColorButton
            key={`recent-${colorObj.type}-${colorObj.value}`}
            colorObj={colorObj}
            onColorChanged={onColorSelected}
            tabIndex={selectedIndex === index ? 0 : -1}
            data-highlighted={selectedIndex === index}
          />
        ))}
      </ButtonGroup>
    </CardItemGroup>
  )
}

export interface TextStyleColorPanelProps {
  maxColorsPerGroup?: number
  maxRecentColors?: number
  onColorChanged?: ({
    type,
    label,
    value,
  }: {
    type: ColorType
    label: string
    value: string
  }) => void
}

export const TextStyleColorPanel: React.FC<TextStyleColorPanelProps> = ({
  maxColorsPerGroup = 5,
  maxRecentColors = 3,
  onColorChanged,
}) => {
  const { recentColors, addRecentColor, isInitialized } =
    useRecentColors(maxRecentColors)

  const containerRef = React.useRef<HTMLDivElement>(null)

  const textColorGroups = React.useMemo(
    () => chunkArray(TEXT_COLORS, maxColorsPerGroup),
    [maxColorsPerGroup]
  )

  const highlightColorGroups = React.useMemo(
    () => chunkArray(HIGHLIGHT_COLORS, maxColorsPerGroup),
    [maxColorsPerGroup]
  )

  const allTextColors = React.useMemo(
    () => textColorGroups.flat(),
    [textColorGroups]
  )

  const allHighlightColors = React.useMemo(
    () => highlightColorGroups.flat(),
    [highlightColorGroups]
  )

  const textColorStartIndex = React.useMemo(
    () => (isInitialized ? recentColors.length : 0),
    [isInitialized, recentColors.length]
  )

  const highlightColorStartIndex = React.useMemo(
    () => textColorStartIndex + allTextColors.length,
    [textColorStartIndex, allTextColors.length]
  )

  const menuItems = React.useMemo(() => {
    const items = []

    if (isInitialized && recentColors.length > 0) {
      items.push(
        ...recentColors.map((color) => ({
          type: color.type,
          value: color.value,
          label: `Recent ${color.type === "text" ? "text" : "highlight"} color`,
          group: "recent",
        }))
      )
    }

    items.push(
      ...allTextColors.map((color) => ({
        type: "text" as ColorType,
        value: color.value,
        label: color.label,
        group: "text",
      }))
    )

    items.push(
      ...allHighlightColors.map((color) => ({
        type: "highlight" as ColorType,
        value: color.value,
        label: color.label,
        group: "highlight",
      }))
    )

    return items
  }, [isInitialized, recentColors, allTextColors, allHighlightColors])

  const handleColorSelected = React.useCallback(
    ({
      type,
      label,
      value,
    }: {
      type: ColorType
      label: string
      value: string
    }) => {
      if (!containerRef.current) return false

      const highlightedElement = containerRef.current.querySelector(
        '[data-highlighted="true"]'
      ) as HTMLElement

      if (highlightedElement) {
        highlightedElement.click()
      }

      addRecentColor({ type, label, value })
      onColorChanged?.({ type, label, value })
    },
    [addRecentColor, onColorChanged]
  )

  const { selectedIndex } = useMenuNavigation({
    containerRef,
    items: menuItems,
    onSelect: (item) => {
      if (item) {
        handleColorSelected({
          type: item.type,
          label: item.label,
          value: item.value,
        })
      }
    },
    orientation: "both",
    autoSelectFirstItem: false,
  })

  return (
    <Card ref={containerRef} tabIndex={0} role="menu">
      <CardBody>
        {isInitialized && (
          <RecentColorsSection
            recentColors={recentColors}
            onColorSelected={handleColorSelected}
            selectedIndex={selectedIndex}
          />
        )}

        <CardItemGroup>
          <CardGroupLabel>Text color</CardGroupLabel>
          <ColorGroup
            type="text"
            colors={textColorGroups}
            onColorSelected={handleColorSelected}
            selectedIndex={selectedIndex}
            startIndexOffset={textColorStartIndex}
          />
        </CardItemGroup>

        <CardItemGroup>
          <CardGroupLabel>Highlight color</CardGroupLabel>
          <ColorGroup
            type="highlight"
            colors={highlightColorGroups}
            onColorSelected={handleColorSelected}
            selectedIndex={selectedIndex}
            startIndexOffset={highlightColorStartIndex}
          />
        </CardItemGroup>
      </CardBody>
    </Card>
  )
}

export interface ColorTextPopoverProps
  extends Omit<ButtonProps, "type">,
    UseColorTextPopoverConfig {}

/**
 * Color text popover component for Tiptap editors.
 *
 * For custom popover implementations, use the `useColorTextPopover` hook instead.
 */
export const ColorTextPopover = React.forwardRef<
  HTMLButtonElement,
  ColorTextPopoverProps
>(
  (
    {
      editor: providedEditor,
      hideWhenUnavailable = false,
      onColorChanged,
      onClick,
      children,
      ...buttonProps
    },
    ref
  ) => {
    const { editor } = useTiptapEditor(providedEditor)
    const [isOpen, setIsOpen] = React.useState(false)
    const {
      isVisible,
      canToggle,
      activeTextStyle,
      activeHighlight,
      handleColorChanged,
      label,
      Icon,
    } = useColorTextPopover({
      editor,
      hideWhenUnavailable,
      onColorChanged,
    })

    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        setIsOpen(!isOpen)
      },
      [onClick, isOpen, setIsOpen]
    )

    if (!isVisible) {
      return null
    }

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            data-style="ghost"
            data-appearance="default"
            role="button"
            aria-label={label}
            tooltip={label}
            disabled={!canToggle}
            data-disabled={!canToggle}
            onClick={handleClick}
            {...buttonProps}
            ref={ref}
          >
            {children ?? (
              <>
                <span
                  className="tiptap-button-color-text-popover"
                  style={
                    activeHighlight.color
                      ? ({
                          "--active-highlight-color": activeHighlight.color,
                        } as React.CSSProperties)
                      : ({} as React.CSSProperties)
                  }
                >
                  <Icon
                    className="tiptap-button-icon"
                    style={{
                      color: activeTextStyle.color || undefined,
                    }}
                  />
                </span>
                <ChevronDownIcon className="tiptap-button-dropdown-small" />
              </>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          aria-label="Text color options"
          side="bottom"
          align="start"
        >
          <TextStyleColorPanel onColorChanged={handleColorChanged} />
        </PopoverContent>
      </Popover>
    )
  }
)

ColorTextPopover.displayName = "ColorTextPopover"

export default ColorTextPopover
