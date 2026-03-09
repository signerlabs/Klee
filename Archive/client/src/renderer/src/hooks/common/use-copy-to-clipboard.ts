"use client"
import { useState, useCallback } from "react"

export function useCopyToClipboard() {
  const [isCopied, setIsCopied] = useState(false)

  const copyToClipboard = useCallback((text: string) => {
    if (typeof window === "undefined") return
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    })
  }, [])

  return { copyToClipboard, isCopied }
} 