import * as React from "react"

export const TextExtendIcon = React.memo(
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
          d="M2 4C2 3.44772 2.44772 3 3 3H21C21.5523 3 22 3.44772 22 4C22 4.55228 21.5523 5 21 5H3C2.44772 5 2 4.55228 2 4Z"
          fill="currentColor"
        />
        <path
          d="M6 8C6 7.44772 6.44772 7 7 7L17 7C17.5523 7 18 7.44772 18 8C18 8.55229 17.5523 9 17 9L7 9C6.44772 9 6 8.55228 6 8Z"
          fill="currentColor"
        />
        <path
          d="M3 11C2.44772 11 2 11.4477 2 12C2 12.5523 2.44772 13 3 13H21C21.5523 13 22 12.5523 22 12C22 11.4477 21.5523 11 21 11H3Z"
          fill="currentColor"
        />
        <path
          d="M12 15C12.5523 15 13 15.4477 13 16V19.5858L14.2929 18.2929C14.6834 17.9024 15.3166 17.9024 15.7071 18.2929C16.0976 18.6834 16.0976 19.3166 15.7071 19.7071L12.7071 22.7071C12.3166 23.0976 11.6834 23.0976 11.2929 22.7071L8.29289 19.7071C7.90237 19.3166 7.90237 18.6834 8.29289 18.2929C8.68342 17.9024 9.31658 17.9024 9.70711 18.2929L11 19.5858V16C11 15.4477 11.4477 15 12 15Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)

TextExtendIcon.displayName = "TextExtendIcon"
