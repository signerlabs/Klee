import type * as React from "react"
import type * as Ariakit from "@ariakit/react"

export interface Action {
  filterItems?: boolean
  group?: string
  icon?: React.ReactNode
  items?: Action[]
  keywords?: string[]
  label?: string
  value?: string
}

export interface MenuItemProps
  extends Omit<Ariakit.ComboboxItemProps, "store"> {
  group?: string
  name?: string
  parentGroup?: string
  preventClose?: boolean
}

export interface MenuContextValue {
  isRootMenu: boolean
  open: boolean
}

export interface MenuProps extends Ariakit.MenuProviderProps {
  trigger?: React.ReactNode
  value?: string
  onOpenChange?: Ariakit.MenuProviderProps["setOpen"]
  onValueChange?: Ariakit.ComboboxProviderProps["setValue"]
  onValuesChange?: Ariakit.MenuProviderProps["setValues"]
}

export interface MenuContentProps
  extends React.ComponentProps<typeof Ariakit.Menu> {
  onClickOutside?: (event: MouseEvent | TouchEvent | FocusEvent) => void
}

export interface ContextMenuAnchor {
  x: number
  y: number
}

export interface UseContextMenuReturn {
  store: ReturnType<typeof Ariakit.useMenuStore>
  getAnchorRect: () => ContextMenuAnchor
  show: () => void
}

export interface UseMenuStoreReturn {
  store: ReturnType<typeof Ariakit.useMenuStore>
  show: (anchorElement: HTMLElement) => void
}
