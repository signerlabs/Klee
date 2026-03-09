"use client"

import * as React from "react"
import * as Ariakit from "@ariakit/react"

// -- Hooks --
import { useOnClickOutside } from "@/hooks/use-on-click-outside"
import { useComposedRef } from "@/hooks/use-composed-ref"

// -- Utils --
import { cn } from "@/lib/tiptap-utils"

// -- UI Primitives --
import {
  ComboboxItem,
  ComboboxProvider,
} from "@/components/tiptap-ui-primitive/combobox"
import { Label } from "@/components/tiptap-ui-primitive/label"

// -- Local imports --
import type {
  MenuProps,
  MenuContentProps,
  MenuItemProps,
} from "@/components/tiptap-ui-primitive/menu"
import {
  SearchableContext,
  MenuContext,
  useSearchableContext,
  useMenuContext,
} from "@/components/tiptap-ui-primitive/menu"
import {
  useMenuPlacement,
  useMenuItemClick,
} from "@/components/tiptap-ui-primitive/menu"

// -- Styles --
import "@/components/tiptap-ui-primitive/menu/menu.scss"

export function Menu({
  children,
  trigger,
  value,
  onOpenChange,
  onValueChange,
  onValuesChange,
  ...props
}: MenuProps) {
  const isRootMenu = !Ariakit.useMenuContext()
  const [open, setOpen] = React.useState(false)
  const searchable = !!onValuesChange || isRootMenu

  const handleOpenChange = React.useCallback(
    (v: boolean) => {
      if (props.open === undefined) {
        setOpen(v)
      }
      onOpenChange?.(v)
    },
    [props.open, onOpenChange]
  )

  const menuContextValue = React.useMemo(
    () => ({
      isRootMenu,
      open: props.open ?? open,
    }),
    [isRootMenu, props.open, open]
  )

  const menuProvider = (
    <Ariakit.MenuProvider
      open={open}
      setOpen={handleOpenChange}
      setValues={onValuesChange}
      showTimeout={100}
      {...props}
    >
      {trigger}
      <MenuContext.Provider value={menuContextValue}>
        <SearchableContext.Provider value={searchable}>
          {children}
        </SearchableContext.Provider>
      </MenuContext.Provider>
    </Ariakit.MenuProvider>
  )

  if (searchable) {
    return (
      <ComboboxProvider value={value} setValue={onValueChange}>
        {menuProvider}
      </ComboboxProvider>
    )
  }

  return menuProvider
}

export function MenuContent({
  children,
  className,
  ref,
  onClickOutside,
  ...props
}: MenuContentProps) {
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const { open } = useMenuContext()
  const side = useMenuPlacement()

  useOnClickOutside(menuRef, onClickOutside || (() => {}))

  return (
    <Ariakit.Menu
      ref={useComposedRef(menuRef, ref)}
      className={cn("tiptap-menu-content", className)}
      data-side={side}
      data-state={open ? "open" : "closed"}
      gutter={4}
      flip
      unmountOnHide
      {...props}
    >
      {children}
    </Ariakit.Menu>
  )
}

export const MenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Ariakit.MenuButton>
>(({ className, ...props }, ref) => (
  <Ariakit.MenuButton
    ref={ref}
    {...props}
    className={cn("tiptap-menu-button", className)}
  />
))

MenuButton.displayName = "MenuButton"

export const MenuButtonArrow = React.forwardRef<
  React.ComponentRef<typeof Ariakit.MenuButtonArrow>,
  React.ComponentPropsWithoutRef<typeof Ariakit.MenuButtonArrow>
>(({ className, ...props }, ref) => (
  <Ariakit.MenuButtonArrow
    ref={ref}
    {...props}
    className={cn("tiptap-menu-button-arrow", className)}
  />
))

MenuButtonArrow.displayName = "MenuButtonArrow"

export const MenuGroup = React.forwardRef<
  React.ComponentRef<typeof Ariakit.MenuGroup>,
  React.ComponentPropsWithoutRef<typeof Ariakit.MenuGroup>
>(({ className, ...props }, ref) => (
  <Ariakit.MenuGroup
    ref={ref}
    {...props}
    className={cn("tiptap-menu-group", className)}
  />
))

MenuGroup.displayName = "MenuGroup"

export const MenuGroupLabel = React.forwardRef<
  React.ComponentRef<typeof Ariakit.MenuGroupLabel>,
  React.ComponentPropsWithoutRef<typeof Ariakit.MenuGroupLabel>
>((props, ref) => <Label ref={ref} {...props} />)

MenuGroupLabel.displayName = "MenuGroupLabel"

export const MenuItemCheck = React.forwardRef<
  React.ComponentRef<typeof Ariakit.MenuItemCheck>,
  React.ComponentPropsWithoutRef<typeof Ariakit.MenuItemCheck>
>(({ className, ...props }, ref) => (
  <Ariakit.MenuItemCheck
    ref={ref}
    {...props}
    className={cn("tiptap-menu-item-check", className)}
  />
))

MenuItemCheck.displayName = "MenuItemCheck"

export const MenuItemRadio = React.forwardRef<
  React.ComponentRef<typeof Ariakit.MenuItemRadio>,
  React.ComponentPropsWithoutRef<typeof Ariakit.MenuItemRadio>
>(({ className, ...props }, ref) => (
  <Ariakit.MenuItemRadio
    ref={ref}
    {...props}
    className={cn("tiptap-menu-item-radio", className)}
  />
))

MenuItemRadio.displayName = "MenuItemRadio"

export const MenuItem = function MenuItem({
  name,
  value,
  preventClose,
  className,
  ...props
}: MenuItemProps) {
  const menu = Ariakit.useMenuContext()
  const searchable = useSearchableContext()

  const hideOnClick = useMenuItemClick(menu, preventClose)

  const itemProps: MenuItemProps = {
    blurOnHoverEnd: false,
    focusOnHover: true,
    className: cn("tiptap-menu-item", className),
    ...props,
  }

  if (!searchable) {
    if (name && value) {
      return (
        <MenuItemRadio
          {...itemProps}
          hideOnClick={true}
          name={name}
          value={value}
        />
      )
    }

    return <Ariakit.MenuItem {...itemProps} />
  }

  return <ComboboxItem {...itemProps} hideOnClick={hideOnClick} />
}
