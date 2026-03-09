"use client"

import * as React from "react"
import * as Ariakit from "@ariakit/react"
import { cn } from "@/lib/tiptap-utils"
import "@/components/tiptap-ui-primitive/combobox/combobox.scss"

export function ComboboxProvider({ ...props }: Ariakit.ComboboxProviderProps) {
  return (
    <Ariakit.ComboboxProvider
      includesBaseElement={false}
      resetValueOnHide
      {...props}
    />
  )
}

export const ComboboxList = React.forwardRef<
  React.ComponentRef<typeof Ariakit.ComboboxList>,
  React.ComponentProps<typeof Ariakit.ComboboxList>
>(({ className, ...props }, ref) => {
  return (
    <Ariakit.ComboboxList
      ref={ref}
      className={cn("tiptap-combobox-list", className)}
      {...props}
    />
  )
})
ComboboxList.displayName = "ComboboxList"

export const ComboboxPopover = React.forwardRef<
  React.ComponentRef<typeof Ariakit.ComboboxPopover>,
  React.ComponentProps<typeof Ariakit.ComboboxPopover>
>(({ className, ...props }, ref) => {
  return (
    <Ariakit.ComboboxPopover
      ref={ref}
      className={cn("tiptap-combobox-popover", className)}
      {...props}
    />
  )
})
ComboboxPopover.displayName = "ComboboxPopover"

export const Combobox = React.forwardRef<
  React.ComponentRef<typeof Ariakit.Combobox>,
  React.ComponentProps<typeof Ariakit.Combobox>
>(({ className, ...props }, ref) => {
  return (
    <Ariakit.Combobox
      ref={ref}
      autoSelect
      {...props}
      className={cn("tiptap-combobox", className)}
    />
  )
})
Combobox.displayName = "Combobox"

export const ComboboxItem = React.forwardRef<
  React.ComponentRef<typeof Ariakit.ComboboxItem>,
  React.ComponentProps<typeof Ariakit.ComboboxItem>
>(({ className, ...props }, ref) => {
  return (
    <Ariakit.ComboboxItem
      ref={ref}
      className={cn("tiptap-combobox-item", className)}
      {...props}
    />
  )
})
ComboboxItem.displayName = "ComboboxItem"
