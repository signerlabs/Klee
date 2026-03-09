import * as React from "react"

export type AppContextValue = {
  activeThread: string | null
  setActiveThread: (threadId: string | null) => void

  /**
   * A map of thread ids to their respective bubble elements
   */
  threadBubbles: Record<string, HTMLElement[]>

  /**
   * Add new thread bubbles to the map
   * @param threadIds The thread IDs attached to the bubble
   * @param element The bubble element
   * @returns void
   */
  addThreadBubble: (threadIds: string | string[], element: HTMLElement) => void

  /**
   * Remove a thread bubble from the map
   * @param threadId The thread ID to remove
   * @returns void
   */
  removeThreadBubble: (threadIdOrElement: string | HTMLElement) => void
}

export const AppContext = React.createContext<AppContextValue>({
  activeThread: null,
  setActiveThread: () => {},
  threadBubbles: {},
  addThreadBubble: () => {},
  removeThreadBubble: () => {},
})

export const AppConsumer = AppContext.Consumer

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeThread, setActiveThread] = React.useState<string | null>(null)
  const [threadBubbles, setThreadBubbles] = React.useState<
    Record<string, HTMLElement[]>
  >({})
  const threadBubblesRef = React.useRef(threadBubbles)

  const addThreadBubble = React.useCallback(
    (threadIds: string | string[], element: HTMLElement) => {
      const ids = Array.isArray(threadIds) ? threadIds : [threadIds]

      ids.forEach((id) => {
        const hasThread = threadBubblesRef.current[id]
        const hasElement = threadBubblesRef.current[id]?.includes(element)

        if (hasThread && hasElement) {
          return
        }

        if (!threadBubblesRef.current[id]) {
          threadBubblesRef.current[id] = [element]
          return
        }

        threadBubblesRef.current[id] = [
          ...threadBubblesRef.current[id],
          element,
        ]
      })
      setThreadBubbles({ ...threadBubblesRef.current })
    },
    []
  )

  const removeThreadBubble = React.useCallback(
    (threadIdOrElement: string | HTMLElement) => {
      const isElement = typeof threadIdOrElement !== "string"
      const isString = typeof threadIdOrElement === "string"

      if (isString) {
        delete threadBubblesRef.current[threadIdOrElement]
        setThreadBubbles({ ...threadBubblesRef.current })
        return
      }

      if (isElement) {
        const element = threadIdOrElement as HTMLElement

        Object.keys(threadBubblesRef.current).forEach((id) => {
          const threadBubble = threadBubblesRef.current[id]

          // if the element is included in the thread bubble
          // we'll remove it from the array
          if (threadBubble && threadBubble.includes(element)) {
            threadBubblesRef.current[id] = threadBubble.filter(
              (el) => el !== element
            )
          }

          // if there are no more elements in the thread bubble
          // we'll remove the thread bubble data
          if (
            threadBubblesRef.current[id] &&
            threadBubblesRef.current[id].length === 0
          ) {
            delete threadBubblesRef.current[id]
          }
        })
        setThreadBubbles({ ...threadBubblesRef.current })
        return
      }
    },
    []
  )

  threadBubblesRef.current = threadBubbles

  const providerValue = React.useMemo(
    () => ({
      activeThread,
      setActiveThread,
      threadBubbles,
      addThreadBubble,
      removeThreadBubble,
    }),
    [
      activeThread,
      setActiveThread,
      threadBubbles,
      addThreadBubble,
      removeThreadBubble,
    ]
  )

  return (
    <AppContext.Provider value={providerValue}>{children}</AppContext.Provider>
  )
}

/**
 * Hook to access the app state.
 * @returns {AppContextValue}
 */
export const useAppState = (): AppContextValue => {
  const context = React.useContext(AppContext)
  if (!context) {
    throw new Error("useAppState must be used within an AppProvider")
  }
  return context
}
