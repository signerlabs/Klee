import * as React from "react"
import "@/components/tiptap-ui-primitive/avatar/avatar.scss"

type ImageLoadingStatus = "idle" | "loading" | "loaded" | "error"
type Size = "default" | "sm" | "lg" | "xl"

interface AvatarContextValue {
  imageLoadingStatus: ImageLoadingStatus
  onImageLoadingStatusChange: (status: ImageLoadingStatus) => void
  size: Size
}

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: Size
  userColor?: string
}

interface AvatarImageProps
  extends Omit<
    React.ImgHTMLAttributes<HTMLImageElement>,
    "onLoadingStatusChange"
  > {
  onLoadingStatusChange?: (status: ImageLoadingStatus) => void
}

interface AvatarFallbackProps extends React.HTMLAttributes<HTMLSpanElement> {
  delayMs?: number
}

interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  maxVisible?: number
  children: React.ReactNode
}

const AvatarContext = React.createContext<AvatarContextValue | undefined>(
  undefined
)

const useAvatarContext = () => {
  const context = React.useContext(AvatarContext)
  if (!context) {
    throw new Error("Avatar components must be used within an Avatar.Root")
  }
  return context
}

const useImageLoadingStatus = (
  src?: string,
  referrerPolicy?: React.HTMLAttributeReferrerPolicy
): ImageLoadingStatus => {
  const [loadingStatus, setLoadingStatus] =
    React.useState<ImageLoadingStatus>("idle")

  React.useLayoutEffect(() => {
    if (!src) {
      setLoadingStatus("error")
      return
    }

    let isMounted = true
    const image = new window.Image()

    const updateStatus = (status: ImageLoadingStatus) => () => {
      if (!isMounted) return
      setLoadingStatus(status)
    }

    setLoadingStatus("loading")
    image.onload = updateStatus("loaded")
    image.onerror = updateStatus("error")
    image.src = src
    if (referrerPolicy) image.referrerPolicy = referrerPolicy

    return () => {
      isMounted = false
    }
  }, [src, referrerPolicy])

  return loadingStatus
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  (
    { children, className = "", size = "default", userColor, ...props },
    ref
  ) => {
    const [imageLoadingStatus, setImageLoadingStatus] =
      React.useState<ImageLoadingStatus>("idle")

    // Memoize the callback to prevent unnecessary re-renders
    const onImageLoadingStatusChange = React.useCallback(
      (status: ImageLoadingStatus) => {
        setImageLoadingStatus(status)
      },
      []
    )

    const contextValue = React.useMemo(
      () => ({
        imageLoadingStatus,
        onImageLoadingStatusChange,
        size,
      }),
      [imageLoadingStatus, onImageLoadingStatusChange, size]
    )

    const style = userColor
      ? ({ "--dynamic-user-color": userColor } as React.CSSProperties)
      : undefined

    return (
      <AvatarContext.Provider value={contextValue}>
        <span
          {...props}
          ref={ref}
          className={`tiptap-avatar ${className}`}
          style={style}
          data-size={size}
        >
          <span className="tiptap-avatar-item">{children}</span>
        </span>
      </AvatarContext.Provider>
    )
  }
)

Avatar.displayName = "Avatar"

export const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ onLoadingStatusChange, src, className = "", ...props }, ref) => {
    const { onImageLoadingStatusChange } = useAvatarContext()
    const imageLoadingStatus = useImageLoadingStatus(src, props.referrerPolicy)

    React.useLayoutEffect(() => {
      if (imageLoadingStatus !== "idle") {
        onLoadingStatusChange?.(imageLoadingStatus)
        onImageLoadingStatusChange(imageLoadingStatus)
      }
    }, [imageLoadingStatus, onLoadingStatusChange, onImageLoadingStatusChange])

    if (imageLoadingStatus !== "loaded") return null

    return (
      <img
        {...props}
        ref={ref}
        src={src}
        className={`tiptap-avatar-image ${className}`}
      />
    )
  }
)

AvatarImage.displayName = "AvatarImage"

export const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  AvatarFallbackProps
>(({ delayMs, className = "", children, ...props }, ref) => {
  const context = useAvatarContext()
  const [canRender, setCanRender] = React.useState(delayMs === undefined)

  React.useEffect(() => {
    if (delayMs !== undefined) {
      const timerId = window.setTimeout(() => setCanRender(true), delayMs)
      return () => window.clearTimeout(timerId)
    }
  }, [delayMs])

  if (!canRender || context.imageLoadingStatus === "loaded") return null

  return (
    <>
      <span className={`tiptap-avatar-bg ${className}`} />
      <span
        {...props}
        ref={ref}
        className={`tiptap-avatar-fallback ${className}`}
      >
        {children}
      </span>
    </>
  )
})

AvatarFallback.displayName = "AvatarFallback"

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  maxVisible,
  children,
  className = "",
  ...props
}) => {
  const childrenArray = React.Children.toArray(children)
  const visibleAvatars = maxVisible
    ? childrenArray.slice(0, maxVisible)
    : childrenArray
  const remainingCount = childrenArray.length - visibleAvatars.length

  let avatarProps: AvatarProps = {}

  React.Children.forEach(children, (child) => {
    if (
      React.isValidElement(child) &&
      child.type &&
      typeof child.type !== "string" &&
      (child.type as { displayName?: string }).displayName === "Avatar"
    ) {
      avatarProps = { ...avatarProps, ...(child.props as AvatarProps) }
      return
    }
  })

  return (
    <div
      {...props}
      className={`tiptap-avatar-group ${className}`}
      data-max-user-visible={maxVisible}
    >
      {visibleAvatars}
      {remainingCount > 0 && (
        <Avatar {...avatarProps}>
          <AvatarFallback>+{remainingCount}</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}

AvatarGroup.displayName = "AvatarGroup"
