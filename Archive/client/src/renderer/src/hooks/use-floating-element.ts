"use client"

import * as React from "react"
import type { UseDismissProps, UseFloatingOptions } from "@floating-ui/react"
import {
  useDismiss,
  useFloating,
  useInteractions,
  useTransitionStyles,
} from "@floating-ui/react"

interface FloatingElementReturn {
  /**
   * Whether the floating element is currently mounted in the DOM.
   */
  isMounted: boolean
  /**
   * Ref function to attach to the floating element DOM node.
   */
  ref: (node: HTMLElement | null) => void
  /**
   * Combined styles for positioning, transitions, and z-index.
   */
  style: React.CSSProperties
  /**
   * Function to manually trigger position updates of the floating element.
   */
  update: () => void
  /**
   * Returns props that should be spread onto the floating element.
   */
  getFloatingProps: (
    userProps?: React.HTMLProps<HTMLElement>
  ) => Record<string, unknown>
  /**
   * Returns props that should be spread onto the reference element.
   */
  getReferenceProps: (
    userProps?: React.HTMLProps<Element>
  ) => Record<string, unknown>
}

/**
 * Custom hook for creating and managing floating elements relative to a reference position
 *
 * @param show - Boolean controlling visibility of the floating element
 * @param referencePos - DOMRect representing the position to anchor the floating element to
 * @param zIndex - Z-index value for the floating element
 * @param options - Additional options to pass to the underlying useFloating hook
 * @returns Object containing properties and methods to control the floating element
 */
export function useFloatingElement(
  show: boolean,
  referencePos: DOMRect | null,
  zIndex: number,
  options?: Partial<UseFloatingOptions & { dismissOptions?: UseDismissProps }>
): FloatingElementReturn {
  const { dismissOptions, ...floatingOptions } = options || {}

  const { refs, update, context, floatingStyles } = useFloating({
    open: show,
    ...floatingOptions,
  })

  const { isMounted, styles } = useTransitionStyles(context)

  const dismiss = useDismiss(context, dismissOptions)

  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss])

  React.useEffect(() => {
    update()
  }, [referencePos, update])

  React.useEffect(() => {
    if (referencePos === null) {
      return
    }

    refs.setReference({
      getBoundingClientRect: () => referencePos,
    })
  }, [referencePos, refs])

  return React.useMemo(
    () => ({
      isMounted,
      ref: refs.setFloating,
      style: {
        ...styles,
        ...floatingStyles,
        zIndex,
      },
      update,
      getFloatingProps,
      getReferenceProps,
    }),
    [
      floatingStyles,
      isMounted,
      refs.setFloating,
      styles,
      update,
      zIndex,
      getFloatingProps,
      getReferenceProps,
    ]
  )
}
