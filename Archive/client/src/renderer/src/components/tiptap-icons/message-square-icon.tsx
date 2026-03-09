import * as React from "react"

export const MessageSquareIcon = React.memo(
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
          d="M5 5C4.73478 5 4.48043 5.10536 4.29289 5.29289C4.10536 5.48043 4 5.73478 4 6V19.5858L6.29289 17.2929C6.48043 17.1054 6.73478 17 7 17H19C19.2652 17 19.5196 16.8946 19.7071 16.7071C19.8946 16.5196 20 16.2652 20 16V6C20 5.73478 19.8946 5.48043 19.7071 5.29289C19.5196 5.10536 19.2652 5 19 5H5ZM2.87868 3.87868C3.44129 3.31607 4.20435 3 5 3H19C19.7957 3 20.5587 3.31607 21.1213 3.87868C21.6839 4.44129 22 5.20435 22 6V16C22 16.7957 21.6839 17.5587 21.1213 18.1213C20.5587 18.6839 19.7957 19 19 19H7.41421L3.70711 22.7071C3.42111 22.9931 2.99099 23.0787 2.61732 22.9239C2.24364 22.7691 2 22.4045 2 22V6C2 5.20435 2.31607 4.44129 2.87868 3.87868Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)

MessageSquareIcon.displayName = "MessageSquareIcon"
