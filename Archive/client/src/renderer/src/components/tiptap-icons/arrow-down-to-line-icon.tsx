import * as React from "react"

export const ArrowDownToLineIcon = React.memo(
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
          d="M12 2C12.5523 2 13 2.44772 13 3V14.5858L17.2929 10.2929C17.6834 9.90237 18.3166 9.90237 18.7071 10.2929C19.0976 10.6834 19.0976 11.3166 18.7071 11.7071L12.7071 17.7071C12.3166 18.0976 11.6834 18.0976 11.2929 17.7071L5.29289 11.7071C4.90237 11.3166 4.90237 10.6834 5.29289 10.2929C5.68342 9.90237 6.31658 9.90237 6.70711 10.2929L11 14.5858V3C11 2.44772 11.4477 2 12 2Z"
          fill="currentColor"
        />
        <path
          d="M5 20C4.44772 20 4 20.4477 4 21C4 21.5523 4.44772 22 5 22H19C19.5523 22 20 21.5523 20 21C20 20.4477 19.5523 20 19 20H5Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)

ArrowDownToLineIcon.displayName = "ArrowDownToLineIcon"
