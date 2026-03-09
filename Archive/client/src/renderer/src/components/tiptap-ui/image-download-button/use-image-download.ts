"use client"

import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { type Editor } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsMobile } from "@/hooks/use-mobile"

// --- Lib ---
import {
  isExtensionAvailable,
  isNodeTypeSelected,
  sanitizeUrl,
} from "@/lib/tiptap-utils"

// --- Icons ---
import { ArrowDownToLineIcon } from "@/components/tiptap-icons/arrow-down-to-line-icon"

export const IMAGE_DOWNLOAD_SHORTCUT_KEY = "mod+shift+d"

/**
 * Extracts file extension from URL or content type
 */
function getFileExtension(url: string, contentType?: string): string {
  const urlMatch = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/)
  if (urlMatch && urlMatch[1]) {
    return `.${urlMatch[1].toLowerCase()}`
  }

  if (contentType) {
    const mimeMap: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
      "image/bmp": ".bmp",
    }
    return mimeMap[contentType.toLowerCase()] || ".jpg"
  }

  return ".jpg"
}

/**
 * Configuration for the image download functionality
 */
export interface UseImageDownloadConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Whether the button should hide when download is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Callback function called after a successful image download.
   */
  onDownloaded?: (filename?: string) => void
  /**
   * Optional function to resolve file URLs before downloading.
   * Useful for handling relative paths or custom URL schemes.
   */
  resolveFileUrl?: (url: string) => Promise<string>
  /**
   * Download behavior: 'download' forces download, 'open' opens in new tab, 'auto' tries download with fallback
   * @default 'auto'
   */
  downloadMethod?: "download" | "open" | "auto"
}

/**
 * Checks if image can be downloaded in the current editor state
 */
export function canDownloadImage(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false
  if (!isExtensionAvailable(editor, ["image"])) return false

  return isNodeTypeSelected(editor, ["image"])
}

/**
 * Gets the currently selected image data
 */
export function getSelectedImageData(editor: Editor | null): {
  src?: string
  alt?: string
  title?: string
} | null {
  if (!editor || !canDownloadImage(editor)) return null

  const { selection } = editor.state

  if (selection instanceof NodeSelection) {
    const node = selection.node

    if (node.type.name === "image") {
      return {
        src: node.attrs.src,
        alt: node.attrs.alt,
        title: node.attrs.title,
      }
    }
  }

  return null
}

/**
 * Attempts to download image via fetch (handles CORS)
 */
async function tryFetchDownload(
  url: string,
  filename: string
): Promise<boolean> {
  try {
    const response = await fetch(url)
    if (!response.ok) return false

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const hasExtension = /\.[a-zA-Z0-9]+$/.test(filename)
    const finalFilename = hasExtension
      ? filename
      : filename +
        getFileExtension(url, response.headers.get("content-type") || undefined)

    const link = document.createElement("a")
    link.href = blobUrl
    link.download = finalFilename
    link.style.display = "none"

    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(blobUrl)
    return true
  } catch (error) {
    console.warn("Fetch download failed:", error)
    return false
  }
}

/**
 * Downloads image via direct link (for same-origin or data URLs)
 */
function tryDirectDownload(url: string, filename: string): boolean {
  try {
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(filename)
    const finalFilename = hasExtension
      ? filename
      : filename + getFileExtension(url)

    const link = document.createElement("a")
    link.href = url
    link.download = finalFilename
    link.style.display = "none"

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    return true
  } catch (error) {
    console.warn("Direct download failed:", error)
    return false
  }
}

/**
 * Opens image in new tab
 */
function openInNewTab(url: string): boolean {
  try {
    window.open(url, "_blank")
    return true
  } catch (error) {
    console.error("Failed to open image:", error)
    return false
  }
}

/**
 * Downloads the currently selected image
 */
export async function downloadSelectedImage(
  editor: Editor | null,
  filename?: string,
  resolveFileUrl?: (url: string) => Promise<string>,
  downloadMethod: "download" | "open" | "auto" = "auto"
): Promise<boolean> {
  if (!editor || !canDownloadImage(editor)) return false

  const imageData = getSelectedImageData(editor)
  if (!imageData?.src) return false

  try {
    let resolvedUrl = imageData.src
    if (resolveFileUrl) {
      resolvedUrl = await resolveFileUrl(imageData.src)
    }

    const baseUrl = window.location.href
    const sanitizedUrl = sanitizeUrl(resolvedUrl, baseUrl)

    if (sanitizedUrl === "#") {
      console.error("Invalid or unsafe URL after sanitization")
      return false
    }

    const generatedFilename =
      filename || imageData.alt || imageData.title || `image-${Date.now()}`

    switch (downloadMethod) {
      case "open":
        return openInNewTab(sanitizedUrl)

      case "download":
        if (
          sanitizedUrl.startsWith(window.location.origin) ||
          sanitizedUrl.startsWith("data:")
        ) {
          return tryDirectDownload(sanitizedUrl, generatedFilename)
        } else {
          const success = await tryFetchDownload(
            sanitizedUrl,
            generatedFilename
          )
          return success || openInNewTab(sanitizedUrl)
        }

      case "auto":
      default:
        if (
          sanitizedUrl.startsWith("data:") ||
          sanitizedUrl.startsWith(window.location.origin)
        ) {
          return tryDirectDownload(sanitizedUrl, generatedFilename)
        } else {
          const fetchSuccess = await tryFetchDownload(
            sanitizedUrl,
            generatedFilename
          )
          if (fetchSuccess) return true

          return openInNewTab(sanitizedUrl)
        }
    }
  } catch (error) {
    console.error("Failed to download image:", error)

    try {
      const baseUrl = window.location.href
      const sanitizedUrl = sanitizeUrl(imageData.src, baseUrl)
      if (sanitizedUrl !== "#") {
        return openInNewTab(sanitizedUrl)
      }
    } catch {
      // Silent fail
    }

    return false
  }
}

/**
 * Determines if the download button should be shown
 */
export function shouldShowDownloadButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, hideWhenUnavailable } = props

  if (!editor || !editor.isEditable) return false
  if (!isExtensionAvailable(editor, ["image", "imageUpload"])) return false

  if (hideWhenUnavailable) {
    return canDownloadImage(editor)
  }

  return true
}

/**
 * Custom hook that provides image download functionality for Tiptap editor
 */
export function useImageDownload(config?: UseImageDownloadConfig) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onDownloaded,
    resolveFileUrl,
    downloadMethod = "auto",
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsMobile()
  const [isVisible, setIsVisible] = React.useState<boolean>(true)
  const canDownload = canDownloadImage(editor)

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(shouldShowDownloadButton({ editor, hideWhenUnavailable }))
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable])

  const handleDownload = React.useCallback(async () => {
    if (!editor) return false

    const imageData = getSelectedImageData(editor)
    const filename = imageData?.alt || imageData?.title

    const success = await downloadSelectedImage(
      editor,
      filename,
      resolveFileUrl,
      downloadMethod
    )
    if (success) {
      onDownloaded?.(filename)
    }
    return success
  }, [editor, onDownloaded, resolveFileUrl, downloadMethod])

  useHotkeys(
    IMAGE_DOWNLOAD_SHORTCUT_KEY,
    (event) => {
      event.preventDefault()
      handleDownload()
    },
    {
      enabled: isVisible && canDownload,
      enableOnContentEditable: !isMobile,
      enableOnFormTags: true,
    }
  )

  return {
    isVisible,
    canDownload,
    handleDownload,
    label: "Download image",
    shortcutKeys: IMAGE_DOWNLOAD_SHORTCUT_KEY,
    Icon: ArrowDownToLineIcon,
  }
}
