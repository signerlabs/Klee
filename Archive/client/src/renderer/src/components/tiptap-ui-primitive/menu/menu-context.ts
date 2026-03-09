import * as React from "react"
import type { MenuContextValue } from "./menu-types"

export const SearchableContext = React.createContext<boolean>(false)

export const MenuContext = React.createContext<MenuContextValue>({
  isRootMenu: false,
  open: false,
})

export const useSearchableContext = (): boolean => {
  return React.useContext(SearchableContext)
}

export const useMenuContext = (): MenuContextValue => {
  return React.useContext(MenuContext)
}
