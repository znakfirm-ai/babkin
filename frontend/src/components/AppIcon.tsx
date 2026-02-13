import React from "react"

export type IconName =
  | "wallet"
  | "card"
  | "cash"
  | "chart"
  | "pie"
  | "tag"
  | "bag"
  | "home"
  | "car"
  | "plane"
  | "food"
  | "drink"
  | "health"
  | "goal"
  | "bank"
  | "arrowDown"
  | "arrowUp"
  | "repeat"
  | "settings"
  | "plus"
  | "circle"

type AppIconProps = {
  name: IconName
  size?: number
  className?: string
}

const baseStroke = 1.8
const lineProps = {
  stroke: "currentColor",
  strokeWidth: baseStroke,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none" as const,
}

export const AppIcon: React.FC<AppIconProps> = ({ name, size = 18, className }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", className, role: "img", "aria-hidden": true }

  switch (name) {
    case "wallet":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="10" rx="2.5" {...lineProps} />
          <path d="M16 11h2.5" {...lineProps} />
          <circle cx="16.5" cy="12" r="0.8" fill="currentColor" />
          <path d="M4 9.5h12.5" {...lineProps} />
        </svg>
      )
    case "card":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="10" rx="2.5" {...lineProps} />
          <path d="M3 10h18" {...lineProps} />
          <path d="M7 14h4" {...lineProps} />
        </svg>
      )
    case "cash":
      return (
        <svg {...common}>
          <rect x="3.5" y="7" width="17" height="10" rx="2" {...lineProps} />
          <path d="M7 9.5c0 1-.8 1.8-1.8 1.8" {...lineProps} />
          <path d="M17 9.5c0 1 .8 1.8 1.8 1.8" {...lineProps} />
          <circle cx="12" cy="12" r="2" {...lineProps} />
        </svg>
      )
    case "chart":
      return (
        <svg {...common}>
          <path d="M5 6v12" {...lineProps} />
          <path d="M19 18H5" {...lineProps} />
          <rect x="7" y="11" width="2.8" height="5" rx="0.8" {...lineProps} />
          <rect x="11.1" y="9" width="2.8" height="7" rx="0.8" {...lineProps} />
          <rect x="15.2" y="7" width="2.8" height="9" rx="0.8" {...lineProps} />
        </svg>
      )
    case "pie":
      return (
        <svg {...common}>
          <path d="M12 4v8l6.5 3.75A8 8 0 1 1 12 4z" {...lineProps} />
          <path d="M12 4a8 8 0 0 1 8 8c0 .96-.17 1.87-.5 2.73L12 12V4z" {...lineProps} />
        </svg>
      )
    case "tag":
      return (
        <svg {...common}>
          <path d="M5 7.5V5h2.5l11 11-2.5 2.5-11-11z" {...lineProps} />
          <circle cx="7.8" cy="7.2" r="0.8" fill="currentColor" />
        </svg>
      )
    case "bag":
      return (
        <svg {...common}>
          <rect x="6" y="8" width="12" height="11" rx="2" {...lineProps} />
          <path d="M9 8a3 3 0 0 1 6 0" {...lineProps} />
        </svg>
      )
    case "home":
      return (
        <svg {...common}>
          <path d="M5 11.5 12 5l7 6.5" {...lineProps} />
          <path d="M7 10v8h10v-8" {...lineProps} />
          <path d="M10 18v-4h4v4" {...lineProps} />
        </svg>
      )
    case "car":
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="6" rx="2" {...lineProps} />
          <path d="M6 10l1.2-3h9.6L18 10" {...lineProps} />
          <circle cx="8" cy="16" r="1.1" fill="currentColor" />
          <circle cx="16" cy="16" r="1.1" fill="currentColor" />
        </svg>
      )
    case "plane":
      return (
        <svg {...common}>
          <path d="M4 12l16-7-5 7 5 7-16-7" {...lineProps} />
          <path d="M10 12l-1.5 5" {...lineProps} />
        </svg>
      )
    case "food":
      return (
        <svg {...common}>
          <path d="M7 4v8" {...lineProps} />
          <path d="M9.5 4v8" {...lineProps} />
          <path d="M7 9.5h2.5" {...lineProps} />
          <path d="M12.5 4.5c0 1.5.5 2.5.5 4V12" {...lineProps} />
          <path d="M15 4v8" {...lineProps} />
        </svg>
      )
    case "drink":
      return (
        <svg {...common}>
          <path d="M7 4h10l-1 3H8z" {...lineProps} />
          <path d="M8 7l1 11h6l1-11" {...lineProps} />
        </svg>
      )
    case "health":
      return (
        <svg {...common}>
          <path d="M12 19s-6.5-4.4-6.5-9a3.5 3.5 0 0 1 6-2.3A3.5 3.5 0 0 1 18.5 10c0 4.6-6.5 9-6.5 9z" {...lineProps} />
          <path d="M10.5 12h3" {...lineProps} />
          <path d="M12 10.5v3" {...lineProps} />
        </svg>
      )
    case "goal":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" {...lineProps} />
          <circle cx="12" cy="12" r="3.5" {...lineProps} />
          <path d="M12 5v2.5" {...lineProps} />
          <path d="M12 16.5V19" {...lineProps} />
          <path d="M7 12H5" {...lineProps} />
          <path d="M19 12h-2" {...lineProps} />
        </svg>
      )
    case "bank":
      return (
        <svg {...common}>
          <path d="M5 10h14" {...lineProps} />
          <path d="M7 10v6" {...lineProps} />
          <path d="M12 10v6" {...lineProps} />
          <path d="M17 10v6" {...lineProps} />
          <path d="M4 18h16" {...lineProps} />
          <path d="M4 9.5 12 5l8 4.5" {...lineProps} />
        </svg>
      )
    case "arrowDown":
      return (
        <svg {...common}>
          <path d="M12 5v14" {...lineProps} />
          <path d="M7 13l5 6 5-6" {...lineProps} />
        </svg>
      )
    case "arrowUp":
      return (
        <svg {...common}>
          <path d="M12 19V5" {...lineProps} />
          <path d="M17 11l-5-6-5 6" {...lineProps} />
        </svg>
      )
    case "repeat":
      return (
        <svg {...common}>
          <path d="M4 7h11l-2.5-2.5" {...lineProps} />
          <path d="M20 17H9l2.5 2.5" {...lineProps} />
          <path d="M4 11v-4" {...lineProps} />
          <path d="M20 13v4" {...lineProps} />
        </svg>
      )
    case "settings":
      return (
        <svg {...common}>
          <path d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" {...lineProps} />
          <path d="M4.8 12a7.2 7.2 0 0 1 .06-.9l-1.6-1.2 1.6-2.8 1.9.6a7.2 7.2 0 0 1 1.5-.9l.3-2h3.2l.3 2a7.2 7.2 0 0 1 1.5.9l1.9-.6 1.6 2.8-1.6 1.2a7.2 7.2 0 0 1 0 1.8l1.6 1.2-1.6 2.8-1.9-.6a7.2 7.2 0 0 1-1.5.9l-.3 2h-3.2l-.3-2a7.2 7.2 0 0 1-1.5-.9l-1.9.6-1.6-2.8 1.6-1.2a7.2 7.2 0 0 1-.06-.9z" {...lineProps} />
        </svg>
      )
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" {...lineProps} />
          <path d="M5 12h14" {...lineProps} />
        </svg>
      )
    case "circle":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" {...lineProps} />
        </svg>
      )
  }
}
