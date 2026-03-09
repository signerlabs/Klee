import * as React from "react"

export const AlignStartVerticalIcon = React.memo(
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
          d="M4 2C4 1.44772 3.55228 1 3 1C2.44772 1 2 1.44772 2 2V22C2 22.5523 2.44772 23 3 23C3.55228 23 4 22.5523 4 22V2Z"
          fill="currentColor"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10 4C8.34315 4 7 5.34315 7 7V17C7 18.6569 8.34315 20 10 20H19C20.6569 20 22 18.6569 22 17V7C22 5.34315 20.6569 4 19 4H10ZM9 7C9 6.44772 9.44772 6 10 6H19C19.5523 6 20 6.44772 20 7V17C20 17.5523 19.5523 18 19 18H10C9.44772 18 9 17.5523 9 17V7Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)

AlignStartVerticalIcon.displayName = "AlignStartVerticalIcon"
