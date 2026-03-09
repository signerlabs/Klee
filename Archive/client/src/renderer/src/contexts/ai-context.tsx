"use client"

import * as React from "react"
import { fetchAiToken, getUrlParam } from "@/lib/tiptap-collab-utils"

export type AiContextValue = {
  aiToken: string | null
  hasAi: boolean
}

export const AiContext = React.createContext<AiContextValue>({
  hasAi: false,
  aiToken: null,
})

export const AiConsumer = AiContext.Consumer
export const useAi = (): AiContextValue => {
  const context = React.useContext(AiContext)
  if (!context) {
    throw new Error("useAi must be used within an AiProvider")
  }
  return context
}

export const useAiToken = () => {
  const [aiToken, setAiToken] = React.useState<string | null>(null)
  const [hasAi, setHasAi] = React.useState<boolean>(true)

  React.useEffect(() => {
    const noAiParam = getUrlParam("noAi")
    setHasAi(parseInt(noAiParam || "0") !== 1)
  }, [])

  React.useEffect(() => {
    if (!hasAi) return

    const getToken = async () => {
      const token = await fetchAiToken()
      setAiToken(token)
    }

    getToken()
  }, [hasAi])

  return { aiToken, hasAi }
}

export function AiProvider({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { hasAi, aiToken } = useAiToken()

  const value = React.useMemo<AiContextValue>(
    () => ({
      hasAi,
      aiToken,
    }),
    [hasAi, aiToken]
  )

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>
}
