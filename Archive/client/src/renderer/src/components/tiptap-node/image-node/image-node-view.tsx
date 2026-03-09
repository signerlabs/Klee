import type { Editor, NodeViewProps } from "@tiptap/react"
import { NodeViewWrapper } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import * as React from "react"
import "./image-node-view.scss"

export interface ResizeParams {
  handleUsed: "left" | "right"
  initialWidth: number
  initialClientX: number
}

export interface ResizableImageProps
  extends React.HTMLAttributes<HTMLDivElement> {
  src: string
  alt?: string
  editor?: Editor
  minWidth?: number
  maxWidth?: number
  align?: "left" | "center" | "right"
  initialWidth?: number
  onImageResize?: (width?: number) => void
}

export function ImageNodeView(props: NodeViewProps) {
  const { editor, node, updateAttributes } = props

  return (
    <ResizableImage
      src={node.attrs.src}
      alt={node.attrs.alt || ""}
      editor={editor}
      align={node.attrs["data-align"]}
      initialWidth={node.attrs.width}
      onImageResize={(width) => updateAttributes({ width })}
    />
  )
}

export const ResizableImage: React.FC<ResizableImageProps> = ({
  src,
  alt = "",
  editor,
  minWidth = 96,
  maxWidth = 800,
  align = "left",
  initialWidth,
  onImageResize,
}) => {
  const [resizeParams, setResizeParams] = useState<ResizeParams | undefined>(
    undefined
  )
  const [width, setWidth] = useState<number | undefined>(initialWidth)
  const [showHandles, setShowHandles] = useState<boolean>(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const leftResizeHandleRef = useRef<HTMLDivElement>(null)
  const rightResizeHandleRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const windowMouseMoveHandler = React.useCallback(
    (event: MouseEvent): void => {
      if (!resizeParams || !editor) {
        return
      }

      let newWidth: number

      if (align === "center") {
        if (resizeParams.handleUsed === "left") {
          newWidth =
            resizeParams.initialWidth +
            (resizeParams.initialClientX - event.clientX) * 2
        } else {
          newWidth =
            resizeParams.initialWidth +
            (event.clientX - resizeParams.initialClientX) * 2
        }
      } else {
        if (resizeParams.handleUsed === "left") {
          newWidth =
            resizeParams.initialWidth +
            resizeParams.initialClientX -
            event.clientX
        } else {
          newWidth =
            resizeParams.initialWidth +
            event.clientX -
            resizeParams.initialClientX
        }
      }

      const effectiveMinWidth = minWidth
      const effectiveMaxWidth =
        editor.view.dom?.firstElementChild?.clientWidth || maxWidth

      const newCalculatedWidth = Math.min(
        Math.max(newWidth, effectiveMinWidth),
        effectiveMaxWidth
      )

      setWidth(newCalculatedWidth)
      if (wrapperRef.current) {
        wrapperRef.current.style.width = `${newCalculatedWidth}px`
      }
    },
    [editor, align, maxWidth, minWidth, resizeParams]
  )

  const windowMouseUpHandler = React.useCallback(
    (event: MouseEvent): void => {
      if (!editor) {
        return
      }

      if (
        (!event.target ||
          !wrapperRef.current?.contains(event.target as Node) ||
          !editor.isEditable) &&
        showHandles
      ) {
        setShowHandles(false)
      }

      if (!resizeParams) {
        return
      }

      setResizeParams(undefined)

      if (onImageResize) {
        onImageResize(width)
      }
    },
    [editor, showHandles, resizeParams, onImageResize, width]
  )

  const leftResizeHandleMouseDownHandler = (
    event: React.MouseEvent<HTMLDivElement>
  ): void => {
    event.preventDefault()

    setResizeParams({
      handleUsed: "left",
      initialWidth: wrapperRef.current?.clientWidth || Number.MAX_VALUE,
      initialClientX: event.clientX,
    })
  }

  const rightResizeHandleMouseDownHandler = (
    event: React.MouseEvent<HTMLDivElement>
  ): void => {
    event.preventDefault()

    setResizeParams({
      handleUsed: "right",
      initialWidth: wrapperRef.current?.clientWidth || Number.MAX_VALUE,
      initialClientX: event.clientX,
    })
  }

  const wrapperMouseEnterHandler = (): void => {
    if (editor && editor.isEditable) {
      setShowHandles(true)
    }
  }

  const wrapperMouseLeaveHandler = (
    event: React.MouseEvent<HTMLDivElement>
  ): void => {
    if (
      event.relatedTarget === leftResizeHandleRef.current ||
      event.relatedTarget === rightResizeHandleRef.current
    ) {
      return
    }

    if (resizeParams) {
      return
    }

    if (editor && editor.isEditable) {
      setShowHandles(false)
    }
  }

  useEffect(() => {
    window.addEventListener("mousemove", windowMouseMoveHandler)
    window.addEventListener("mouseup", windowMouseUpHandler)

    return () => {
      window.removeEventListener("mousemove", windowMouseMoveHandler)
      window.removeEventListener("mouseup", windowMouseUpHandler)
    }
  }, [windowMouseMoveHandler, windowMouseUpHandler])

  return (
    <NodeViewWrapper
      onMouseEnter={wrapperMouseEnterHandler}
      onMouseLeave={wrapperMouseLeaveHandler}
      data-align={align}
      data-width={width}
      className="tiptap-image"
      contentEditable={false}
    >
      <div
        ref={wrapperRef}
        className="tiptap-image-container"
        style={{
          width: width ? `${width}px` : "fit-content",
        }}
      >
        <div className="tiptap-image-content">
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            className="tiptap-image-img"
            contentEditable={false}
            draggable={false}
            style={{ pointerEvents: "none" }}
          />

          {showHandles && editor && editor.isEditable && (
            <>
              <div
                ref={leftResizeHandleRef}
                className="tiptap-image-handle tiptap-image-handle-left"
                onMouseDown={leftResizeHandleMouseDownHandler}
              />
              <div
                ref={rightResizeHandleRef}
                className="tiptap-image-handle tiptap-image-handle-right"
                onMouseDown={rightResizeHandleMouseDownHandler}
              />
            </>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
