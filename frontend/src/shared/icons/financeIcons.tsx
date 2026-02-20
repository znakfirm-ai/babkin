import React from "react"

export type FinanceIconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl"

const SIZE_MAP: Record<FinanceIconSize, number> = {
  xs: 16,
  sm: 18,
  md: 20,
  lg: 22,
  xl: 24,
  "2xl": 28,
}

export type FinanceIconKey =
  | "salary"
  | "business"
  | "freelance"
  | "bonus"
  | "investment_income"
  | "dividends"
  | "cashback"
  | "rent_income"
  | "gift_income"
  | "refund"
  | "groceries"
  | "cafe"
  | "restaurant"
  | "transport"
  | "taxi"
  | "car"
  | "fuel"
  | "home"
  | "rent"
  | "utilities"
  | "internet"
  | "phone"
  | "health"
  | "pharmacy"
  | "sport"
  | "education"
  | "kids"
  | "pets"
  | "entertainment"
  | "travel"
  | "clothes"
  | "beauty"
  | "subscriptions"
  | "taxes"
  | "bank_fees"
  | "cash"
  | "wallet"
  | "card"
  | "bank"
  | "savings"
  | "deposit"
  | "investment_account"
  | "crypto"
  | "vault"
  | "safe"
  | "debt"
  | "loan"
  | "mortgage"
  | "installment"
  | "credit_card_debt"
  | "borrow"
  | "lend"
  | "interest"
  | "contract"
  | "target"
  | "piggy"
  | "emergency_fund"
  | "vacation"
  | "car_goal"
  | "home_goal"
  | "education_goal"
  | "gadget_goal"
  | "wedding_goal"

type FinanceIconInnerProps = React.SVGProps<SVGSVGElement> & { title?: string }

const createIcon = (children: React.ReactNode): React.FC<FinanceIconInnerProps> => (props) => {
  const { className, ...rest } = props
  return (
    <svg
      {...rest}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function resolveFinanceIconSize(size: FinanceIconSize | number = "lg"): number {
  if (typeof size === "number") return size
  return SIZE_MAP[size] ?? SIZE_MAP.lg
}

const circle = (cx: number, cy: number, r: number) => <circle cx={cx} cy={cy} r={r} />

const FinanceIcons: Record<FinanceIconKey, React.FC<FinanceIconInnerProps>> = {
  salary: createIcon(
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M4 10h16M9 14h6" />
      <path d="M8.5 8.5h7" />
    </>,
  ),
  business: createIcon(
    <>
      <rect x="7" y="9" width="10" height="10" rx="2" />
      <path d="M9 9V6h6v3M9 13h6" />
    </>,
  ),
  freelance: createIcon(
    <>
      <path d="M5 18h14l-2-9H7z" />
      <path d="M9 18l-1 3M15 18l1 3" />
      <path d="M9 9l3-4 3 4" />
    </>,
  ),
  bonus: createIcon(
    <>
      <path d="M12 3v4" />
      <path d="M5 11h14" />
      <path d="M7 21h10" />
      <path d="M8 11l-2 10M16 11l2 10" />
      <path d="M10 7h4" />
    </>,
  ),
  investment_income: createIcon(
    <>
      <path d="M4 17l4-4 3 3 5-5 4 4" />
      <path d="M4 12V7h5" />
      <path d="M5 20h14" />
    </>,
  ),
  dividends: createIcon(
    <>
      <path d="M4 17a8 8 0 0 1 16 0" />
      <path d="M12 9v6" />
      <path d="M9.5 11.5h5" />
      <path d="M5 20h14" />
    </>,
  ),
  cashback: createIcon(
    <>
      <path d="M12 5h7v7" />
      <path d="M19 5l-6 6" />
      <rect x="4" y="11" width="10" height="8" rx="2" />
      <path d="M6.5 15.5h5" />
    </>,
  ),
  rent_income: createIcon(
    <>
      <path d="M4 11.5L12 5l8 6.5" />
      <path d="M6 10v9h4v-5h4v5h4v-9" />
      <path d="M9 21h6" />
    </>,
  ),
  gift_income: createIcon(
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8v12M4 14h16" />
      <path d="M12 8s-1.5-4-3.5-4S6 7 9 8c0 0-3 .2-3 2 0 1.2 1.2 2 2.5 2H12" />
      <path d="M12 8s1.5-4 3.5-4S18 7 15 8c0 0 3 .2 3 2 0 1.2-1.2 2-2.5 2H12" />
    </>,
  ),
  refund: createIcon(
    <>
      <path d="M7 10H4l3-3 3 3H7z" />
      <path d="M4 10v5a5 5 0 0 0 5 5h7" />
      <path d="M13 14h5l-2.5-3.5L13 14Z" />
      <path d="M18 14v-5a5 5 0 0 0-5-5h-4" />
    </>,
  ),
  groceries: createIcon(
    <>
      <path d="M5 7h14l-1 10H6z" />
      <path d="M9 11V7L8 4" />
      <path d="M15 11V7l1-3" />
      {circle(9, 18, 1)}{circle(15, 18, 1)}
    </>,
  ),
  cafe: createIcon(
    <>
      <path d="M6 9h9a3 3 0 1 0 0-6H6z" />
      <path d="M15 9v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V9" />
      <path d="M5 21h10" />
    </>,
  ),
  restaurant: createIcon(
    <>
      <path d="M6 3v9" />
      <path d="M10 3v9" />
      <path d="M6 7h4" />
      <path d="M14 3h4v5a4 4 0 0 1-4 4z" />
      <path d="M6 21v-6M14 21v-9" />
    </>,
  ),
  transport: createIcon(
    <>
      <rect x="3" y="9" width="18" height="7" rx="2" />
      <path d="M7 16v2M17 16v2M6 12h2M16 12h2" />
      {circle(7, 18.5, 1)}{circle(17, 18.5, 1)}
    </>,
  ),
  taxi: createIcon(
    <>
      <path d="M5 15h14l-1-5H6z" />
      <path d="M8 10l1-3h6l1 3" />
      {circle(8, 17, 1)}{circle(16, 17, 1)}
      <path d="M10 12h4" />
    </>,
  ),
  car: createIcon(
    <>
      <path d="M5 16V13l2-5h10l2 5v3" />
      <path d="M7 16h10" />
      {circle(8, 18, 1.2)}{circle(16, 18, 1.2)}
    </>,
  ),
  fuel: createIcon(
    <>
      <rect x="5" y="5" width="8" height="14" rx="2" />
      <path d="M9 9v4" />
      <path d="M13 7l4 4v6a2 2 0 0 1-2 2h-1" />
      <path d="M15 11h3" />
    </>,
  ),
  home: createIcon(
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </>,
  ),
  rent: createIcon(
    <>
      <path d="M5 11.5 12 6l7 5.5" />
      <path d="M7 10v8h10v-8" />
      <path d="M9 14h6" />
    </>,
  ),
  utilities: createIcon(
    <>
      <path d="M6 13c0-4 3-7 6-9 0 0 3 3 3 7a6 6 0 0 1-9 5" />
      <path d="M10 16h5" />
    </>,
  ),
  internet: createIcon(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4a13 13 0 0 0 0 16M12 4a13 13 0 0 1 0 16" />
    </>,
  ),
  phone: createIcon(
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M9.5 6h5M10 18h4" />
    </>,
  ),
  health: createIcon(
    <>
      <path d="M12 6v12" />
      <path d="M6 12h12" />
      <path d="M7.5 7.5 12 3l4.5 4.5" />
    </>,
  ),
  pharmacy: createIcon(
    <>
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>,
  ),
  sport: createIcon(
    <>
      <circle cx="9" cy="9" r="2.5" />
      <path d="M11 11l5 5" />
      <path d="M8 13l-3 6" />
      <path d="M14 7l3-3" />
    </>,
  ),
  education: createIcon(
    <>
      <path d="M4 9 12 5l8 4-8 4-8-4Z" />
      <path d="M12 13v6" />
      <path d="M7 11v3c0 1.1 2.2 2 5 2s5-.9 5-2v-3" />
    </>,
  ),
  kids: createIcon(
    <>
      <circle cx="9" cy="9" r="2" />
      <circle cx="15" cy="9" r="2" />
      <path d="M6 16c2-2 10-2 12 0" />
      <path d="M12 11v2" />
    </>,
  ),
  pets: createIcon(
    <>
      <circle cx="8" cy="10" r="1.6" />
      <circle cx="12" cy="8" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
      <path d="M7 14c2 1 8 1 10 0" />
      <path d="M10.5 12.5h3" />
    </>,
  ),
  entertainment: createIcon(
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M10 6v12M14 6v12" />
      <path d="M4 12h16" />
    </>,
  ),
  travel: createIcon(
    <>
      <path d="M4 12h16" />
      <path d="M8 12 5 6h2l4 6" />
      <path d="M16 12 19 6h-2l-4 6" />
      <path d="M10 12v6l2-1 2 1v-6" />
    </>,
  ),
  clothes: createIcon(
    <>
      <path d="M9 4h6l3 3-3 2v9H9V9L6 7z" />
      <path d="M12 4v3" />
    </>,
  ),
  beauty: createIcon(
    <>
      <path d="M7 4h10" />
      <path d="M12 4v6" />
      <path d="M9 10h6" />
      <path d="M10 10v10M14 10v10" />
    </>,
  ),
  subscriptions: createIcon(
    <>
      <rect x="4" y="6" width="16" height="12" rx="3" />
      <path d="M9 12h6" />
      <path d="M7.5 9.5 9 12l-1.5 2.5" />
      <path d="M16.5 9.5 15 12l1.5 2.5" />
    </>,
  ),
  taxes: createIcon(
    <>
      <path d="M5 8h14" />
      <path d="M9 4h6" />
      <path d="M7 8v10h10V8" />
      <path d="M10 12h4" />
    </>,
  ),
  bank_fees: createIcon(
    <>
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M8 9h8M8 12h4M8 15h6" />
    </>,
  ),
  cash: createIcon(
    <>
      <rect x="4" y="7" width="16" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M4 10h2M4 14h2M18 10h2M18 14h2" />
    </>,
  ),
  wallet: createIcon(
    <>
      <rect x="4" y="7" width="16" height="10" rx="3" />
      <path d="M16 12h4M16 10.5v3" />
    </>,
  ),
  card: createIcon(
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 14h4" />
    </>,
  ),
  bank: createIcon(
    <>
      <path d="M4 9h16" />
      <path d="M5 9v9M9 9v9M15 9v9M19 9v9" />
      <path d="M3 18h18" />
      <path d="M4 6 12 3l8 3" />
    </>,
  ),
  savings: createIcon(
    <>
      <path d="M5 10a7 7 0 0 1 14 0v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M9 14h6" />
      <path d="M9 11h1" />
    </>,
  ),
  deposit: createIcon(
    <>
      <rect x="5" y="8" width="14" height="10" rx="2" />
      <path d="M9 12h6" />
      <path d="M12 8V5" />
      <path d="M10.5 5h3" />
    </>,
  ),
  investment_account: createIcon(
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M7 15l3-4 2 2 3-3 2 3" />
      <path d="M7 9h4" />
    </>,
  ),
  crypto: createIcon(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M10 8h3.5a2.5 2.5 0 1 1 0 5H10" />
      <path d="M10 8v8" />
      <path d="M10 12h3" />
    </>,
  ),
  vault: createIcon(
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 7v2M12 15v2M9 12H7M17 12h-2" />
    </>,
  ),
  safe: createIcon(
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7 12h2M15 12h2M12 7v2M12 15v2" />
    </>,
  ),
  debt: createIcon(
    <>
      <path d="M6 6h9a3 3 0 0 1 3 3v9H6z" />
      <path d="M6 12h12" />
      <path d="M10 9h4" />
    </>,
  ),
  loan: createIcon(
    <>
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M9 10h6" />
      <path d="M9 14h4" />
      <path d="M7 6V4h4" />
    </>,
  ),
  mortgage: createIcon(
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6 10v10h12V10" />
      <path d="M10 15h4" />
      <path d="M12 10v2" />
    </>,
  ),
  installment: createIcon(
    <>
      <rect x="4" y="7" width="16" height="10" rx="2" />
      <path d="M8 7v10M12 7v10M16 7v10" />
    </>,
  ),
  credit_card_debt: createIcon(
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 14h4M14.5 14h2" />
      <path d="M8 6V4h3" />
    </>,
  ),
  borrow: createIcon(
    <>
      <path d="M7 12h10" />
      <path d="M12 7v10" />
      <path d="M9 9l3-3 3 3" />
      <path d="M9 15l3 3 3-3" />
    </>,
  ),
  lend: createIcon(
    <>
      <path d="M17 12H7" />
      <path d="M12 7v10" />
      <path d="M15 9 12 6 9 9" />
      <path d="M15 15 12 18 9 15" />
    </>,
  ),
  interest: createIcon(
    <>
      <circle cx="8" cy="8" r="2" />
      <circle cx="16" cy="16" r="2" />
      <path d="M9.5 14.5 14.5 9.5" />
    </>,
  ),
  contract: createIcon(
    <>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>,
  ),
  target: createIcon(
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
    </>,
  ),
  piggy: createIcon(
    <>
      <path d="M5 12a6 6 0 0 1 6-6h2a5 5 0 0 1 5 5v3h-2l-1 3" />
      <path d="M5 12H3v3h2" />
      <path d="M9 19h6" />
      {circle(15.5, 10, 0.8)}
    </>,
  ),
  emergency_fund: createIcon(
    <>
      <rect x="5" y="6" width="14" height="12" rx="3" />
      <path d="M12 9v6M9 12h6" />
      <path d="M8 6V4h3" />
    </>,
  ),
  vacation: createIcon(
    <>
      <path d="M4 15h16" />
      <path d="M8 15c0-3 2-6 4-6s4 3 4 6" />
      <path d="M4 11 6 9l2 2 2-2 2 2 2-2 2 2 2-2" />
    </>,
  ),
  car_goal: createIcon(
    <>
      <path d="M5 16V13l2-5h10l2 5v3" />
      <path d="M7 16h10" />
      {circle(8, 18, 1.2)}{circle(16, 18, 1.2)}
      <path d="M12 9v2" />
    </>,
  ),
  home_goal: createIcon(
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 15h4" />
      <path d="M12 8v2" />
    </>,
  ),
  education_goal: createIcon(
    <>
      <path d="M4 9 12 5l8 4-8 4-8-4Z" />
      <path d="M12 13v6" />
      <path d="M7 11v2c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-2" />
    </>,
  ),
  gadget_goal: createIcon(
    <>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M10 8h4M9.5 16h5" />
      <path d="M10.5 4.5v1" />
    </>,
  ),
  wedding_goal: createIcon(
    <>
      <circle cx="9" cy="10" r="3" />
      <circle cx="15" cy="10" r="3" />
      <path d="M6 16c2-1.5 10-1.5 12 0" />
      <path d="M12 4l1.5 2L12 8l-1.5-2z" />
    </>,
  ),
}

export const FINANCE_ICONS = FinanceIcons

export function isFinanceIconKey(value: string): value is FinanceIconKey {
  return value in FINANCE_ICONS
}

export const FINANCE_ICON_SECTIONS: { id: string; title: string; keys: FinanceIconKey[] }[] = [
  {
    id: "income",
    title: "Доходы",
    keys: [
      "salary",
      "business",
      "freelance",
      "bonus",
      "investment_income",
      "dividends",
      "cashback",
      "rent_income",
      "gift_income",
      "refund",
    ],
  },
  {
    id: "expense",
    title: "Расходы",
    keys: [
      "groceries",
      "cafe",
      "restaurant",
      "transport",
      "taxi",
      "car",
      "fuel",
      "home",
      "rent",
      "utilities",
      "internet",
      "phone",
      "health",
      "pharmacy",
      "sport",
      "education",
      "kids",
      "pets",
      "entertainment",
      "travel",
      "clothes",
      "beauty",
      "subscriptions",
      "taxes",
      "bank_fees",
    ],
  },
  {
    id: "accounts",
    title: "Счета",
    keys: ["cash", "wallet", "card", "bank", "savings", "deposit", "investment_account", "crypto", "vault", "safe"],
  },
  {
    id: "debts",
    title: "Долги / Кредиты",
    keys: ["debt", "loan", "mortgage", "installment", "credit_card_debt", "borrow", "lend", "interest", "contract"],
  },
  {
    id: "goals",
    title: "Цели",
    keys: ["target", "piggy", "emergency_fund", "vacation", "car_goal", "home_goal", "education_goal", "gadget_goal", "wedding_goal"],
  },
]

export const FINANCE_ICON_KEYS = Object.keys(FINANCE_ICONS) as FinanceIconKey[]

export function getFinanceIconComponent(key: string | null | undefined): React.FC<FinanceIconInnerProps> | null {
  if (!key || !isFinanceIconKey(key)) return null
  return FINANCE_ICONS[key]
}

type FinanceIconProps = {
  iconKey?: string | null
  size?: FinanceIconSize | number
  className?: string
  title?: string
}

export const FinanceIcon: React.FC<FinanceIconProps> = ({ iconKey, size = "lg", className, title }) => {
  if (!iconKey || !isFinanceIconKey(iconKey)) return null
  const IconComponent = FINANCE_ICONS[iconKey]
  const resolved = resolveFinanceIconSize(size)
  return (
    <IconComponent
      width={resolved}
      height={resolved}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : "presentation"}
      title={title ?? undefined}
    />
  )
}
