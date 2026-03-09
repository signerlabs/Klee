import * as React from "react"

export const TextReduceIcon = React.memo(
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
          d="M3 5C2.44772 5 2 5.44772 2 6C2 6.55228 2.44772 7 3 7H21C21.5523 7 22 6.55228 22 6C22 5.44772 21.5523 5 21 5H3Z"
          fill="currentColor"
        />
        <path
          d="M7 9C6.44772 9 6 9.44772 6 10C6 10.5523 6.44772 11 7 11L17 11C17.5523 11 18 10.5523 18 10C18 9.44772 17.5523 9 17 9L7 9Z"
          fill="currentColor"
        />
        <path
          d="M11.8863 21C11.334 21 10.8863 20.5523 10.8863 20L10.8863 16.4142L9.5934 17.7071C9.20287 18.0976 8.56971 18.0976 8.17918 17.7071C7.78866 17.3166 7.78866 16.6834 8.17918 16.2929L11.1792 13.2929C11.5697 12.9024 12.2029 12.9024 12.5934 13.2929L15.5934 16.2929C15.9839 16.6834 15.9839 17.3166 15.5934 17.7071C15.2029 18.0976 14.5697 18.0976 14.1792 17.7071L12.8863 16.4142L12.8863 20C12.8863 20.5523 12.4386 21 11.8863 21Z"
          fill="currentColor"
        />
      </svg>
    )
  }
)

TextReduceIcon.displayName = "TextReduceIcon"
