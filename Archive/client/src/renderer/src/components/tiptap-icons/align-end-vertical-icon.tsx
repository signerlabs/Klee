import * as React from "react"

export const AlignEndVerticalIcon = React.memo(
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
          fillRule="evenodd"
          clipRule="evenodd"
          d="M21 1C21.5523 1 22 1.44772 22 2V22C22 22.5523 21.5523 23 21 23C20.4477 23 20 22.5523 20 22V2C20 1.44772 20.4477 1 21 1Z"
          fill="currentColor"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M2 7C2 5.34315 3.34315 4 5 4H14C15.6569 4 17 5.34315 17 7V17C17 18.6569 15.6569 20 14 20H5C3.34315 20 2 18.6569 2 17V7ZM5 6C4.44772 6 4 6.44772 4 7V17C4 17.5523 4.44772 18 5 18H14C14.5523 18 15 17.5523 15 17V7C15 6.44772 14.5523 6 14 6H5Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)

AlignEndVerticalIcon.displayName = "AlignEndVerticalIcon"
