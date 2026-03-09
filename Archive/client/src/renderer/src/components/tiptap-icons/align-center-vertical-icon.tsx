import * as React from "react"

export const AlignCenterVerticalIcon = React.memo(
  ({ className, ...props }: React.SVGProps<SVGSVGElement>) => {
    return (
      <svg
        width="24"
        height="24"
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path
          d="M12 1C12.5523 1 13 1.44772 13 2V22C13 22.5523 12.5523 23 12 23C11.4477 23 11 22.5523 11 22V2C11 1.44772 11.4477 1 12 1Z"
          fill="currentColor"
        />
        <path
          d="M2 7C2 5.34315 3.34315 4 5 4H7C7.55228 4 8 4.44772 8 5C8 5.55228 7.55228 6 7 6H5C4.44772 6 4 6.44772 4 7V17C4 17.5523 4.44772 18 5 18H7C7.55228 18 8 18.4477 8 19C8 19.5523 7.55228 20 7 20H5C3.34315 20 2 18.6569 2 17V7Z"
          fill="currentColor"
        />
        <path
          d="M19 4C20.6569 4 22 5.34315 22 7V17C22 18.6569 20.6569 20 19 20H17C16.4477 20 16 19.5523 16 19C16 18.4477 16.4477 18 17 18H19C19.5523 18 20 17.5523 20 17V7C20 6.44772 19.5523 6 19 6H17C16.4477 6 16 5.55228 16 5C16 4.44772 16.4477 4 17 4H19Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)

AlignCenterVerticalIcon.displayName = "AlignCenterVerticalIcon"
