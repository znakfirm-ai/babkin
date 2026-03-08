import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useAppStore } from "../store/useAppStore"
import type { Debtor, Goal, Transaction } from "../types/finance"
import "./OverviewScreen.css"
import { AppIcon, type IconName } from "../components/AppIcon"
import { FinanceIcon, FINANCE_ICON_SECTIONS, isFinanceIconKey } from "../shared/icons/financeIcons"
import { GoalList } from "../components/GoalList"
import { DebtorList } from "../components/DebtorList"
import { createAccount, getAccounts, updateAccount, deleteAccount, adjustAccountBalance } from "../api/accounts"
import { createCategory, deleteCategory, getCategories, renameCategory } from "../api/categories"
import { createIncomeSource, deleteIncomeSource, getIncomeSources, renameIncomeSource } from "../api/incomeSources"
import { completeGoal, createGoal, getGoals, updateGoal } from "../api/goals"
import { createDebtor, getDebtors, updateDebtor } from "../api/debtors"
import { createTransaction, deleteTransaction, getTransactions, type CreateTransactionBody } from "../api/transactions"
import { useSingleFlight } from "../hooks/useSingleFlight"
import { formatMoney, normalizeCurrency } from "../utils/formatMoney"
import { getReadableTextColor } from "../utils/getReadableTextColor"
import { buildMonthlyTransactionMetrics, getLocalMonthPoint, isDateInMonthPoint } from "../utils/monthlyTransactionMetrics"
import { getTransactionErrorMessage } from "../utils/transactionErrorMessage"
import { buildTransactionDaySections, sortTransactionsDesc } from "../utils/sortTransactions"
import { registerDebugTimingsTap } from "../utils/debugTimings"

type TileType = "account" | "category" | "income-source" | "goal"
type TileSize = "sm" | "md" | "lg"
type CardItem = {
  id: string
  title: string
  amount: number
  secondaryAmount?: number
  secondaryText?: string
  goalCurrent?: number
  icon?: string | null
  financeIconKey?: string | null
  color: string
  textColor?: string
  textShadow?: string
  isAdd?: boolean
  type?: TileType
  size?: TileSize
  budget?: number | null
  budgetTone?: "normal" | "warn" | "alert"
  amountTarget?: number
  progress?: number
}

const cardColors = ["#111827", "#166534", "#92400e", "#2563eb", "#b91c1c", "#0f172a"]
const DEFAULT_ACCOUNT_COLOR = "#EEF2F7"
const accountColorOptions = [
  "#2563eb", // blue
  "#38bdf8", // sky
  "#22c55e", // green
  "#14b8a6", // teal
  "#facc15", // yellow
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#4338ca", // indigo
  "#0f172a", // graphite
  "#94a3b8", // gray
  "#0ea5e9", // light blue
  "#9ca3af", // muted gray
]

const MONTH_NAMES = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
]
const daysInMonth = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
const pad2 = (n: number) => String(n).padStart(2, "0")
const getTodayLocalDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}
const GOALS_LIST_STALE_MS = 60_000
const ACCOUNT_NAME_MAX_LENGTH = 12
const INCOME_SOURCE_NAME_MAX_LENGTH = 12
const EXPENSE_CATEGORY_NAME_MAX_LENGTH = 12
const GOAL_NAME_MAX_LENGTH = 20
const DEBTOR_NAME_MAX_LENGTH = 20

const normalizeEntityName = (value: string) => value.trim().toLowerCase()
const isEntityNameTooLong = (value: string, maxLength: number) => Array.from(value.trim()).length > maxLength
const isDuplicateNameError = (error: string | null | undefined) => Boolean(error && error.includes("Такое название уже используется"))
const isAmountRequiredError = (error: string | null | undefined) => Boolean(error && error.includes("Введите сумму"))
const ARCHIVED_TX_EDIT_HELP_TEXT =
  "Операция недоступна для редактирования, потому что связанный счет, источник или категория уже удалены из активного списка."

const isMissingOrArchivedEntity = (id: string | undefined, archivedById: Map<string, boolean>) => {
  if (!id) return false
  const archived = archivedById.get(id)
  return archived === undefined ? true : archived
}

const isTransactionLinkedToArchivedEntity = (
  tx: Transaction,
  activeAccountIds: Set<string>,
  categoryArchivedById: Map<string, boolean>,
  incomeSourceArchivedById: Map<string, boolean>,
) => {
  const linkedAccountIds = [tx.accountId, tx.fromAccountId, tx.toAccountId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  )
  if (linkedAccountIds.some((accountId) => !activeAccountIds.has(accountId))) return true
  if (isMissingOrArchivedEntity(tx.categoryId, categoryArchivedById)) return true
  if (isMissingOrArchivedEntity(tx.incomeSourceId, incomeSourceArchivedById)) return true
  return false
}

type OpenPicker =
  | {
      side: "from" | "to"
      part: "day" | "month" | "year"
    }
  | null

type AccountPeriodType = "day" | "week" | "month" | "quarter" | "year" | "custom"

const ACCOUNT_PERIOD_OPTIONS: Array<{ key: AccountPeriodType; label: string }> = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Год" },
  { key: "custom", label: "Свой" },
]

type PopoverListProps = {
  items: string[]
  selectedIndex: number
  alignRight?: boolean
  onSelect: (val: string) => void
  onClose: () => void
}

const PopoverList: React.FC<PopoverListProps> = ({ items, selectedIndex, alignRight, onSelect, onClose }) => {
  const listRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const itemH = 32
    const target = Math.max(0, selectedIndex * itemH - 2 * itemH)
    el.scrollTop = target
  }, [selectedIndex])

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
      }}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: alignRight ? undefined : 0,
        right: alignRight ? 0 : undefined,
        zIndex: 90,
      }}
    >
      <div
        ref={listRef}
        style={{
          maxHeight: 220,
          minWidth: 110,
          overflowY: "auto",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "none",
          border: "1px solid #e5e7eb",
        }}
      >
        {items.map((item, idx) => {
          const active = idx === selectedIndex
          return (
            <button
              key={item + idx}
              type="button"
              onClick={() => {
                onSelect(item)
                onClose()
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: active ? "#0f172a" : "#fff",
                color: active ? "#fff" : "#0f172a",
                border: "none",
                textAlign: "left",
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {item}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type PeriodPickerTriggerProps = {
  buttonLabel: string
  isOpen: boolean
  selectedPeriod: AccountPeriodType
  buttonRef: { current: HTMLButtonElement | null }
  popoverWidth: number | null
  onToggle: () => void
  onClose: () => void
  onSelect: (period: AccountPeriodType) => void
}

const PeriodPickerTrigger: React.FC<PeriodPickerTriggerProps> = ({
  buttonLabel,
  isOpen,
  selectedPeriod,
  buttonRef,
  popoverWidth,
  onToggle,
  onClose,
  onSelect,
}) => {
  return (
    <div style={{ position: "relative", flex: "0 0 auto" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #0f172a",
          background: "#0f172a",
          fontWeight: 600,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          minWidth: 96,
          flex: "0 0 auto",
        }}
      >
        {buttonLabel}
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>▾</span>
      </button>
      {isOpen ? (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 63 }} onClick={onClose} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
              zIndex: 64,
              width: popoverWidth ?? "100%",
              display: "grid",
              gap: 4,
              padding: 8,
            }}
          >
            {ACCOUNT_PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelect(option.key)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: selectedPeriod === option.key ? "#f1f5f9" : "#fff",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

const isGoalContributionTx = (tx: Transaction) => tx.type === "transfer" && Boolean(tx.goalId) && Boolean(tx.fromAccountId ?? tx.accountId) && !tx.toAccountId
const isPayableDebtRepaymentTx = (tx: Transaction) => {
  if (tx.type !== "expense" || Boolean(tx.goalId)) return false
  if (tx.debtorId) return true
  return !tx.categoryId && !tx.incomeSourceId && !tx.fromAccountId && !tx.toAccountId
}
const toPositiveNumberOrZero = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
const pickPayableDebtTotal = (debtor: Debtor) => {
  const raw = debtor as Record<string, unknown>
  const candidates = [
    debtor.payoffAmount,
    debtor.amountToReturn,
    debtor.returnAmount,
    raw.payoff,
    raw.toReturnAmount,
    raw.payoff_amount,
    raw.amount_to_return,
  ]
  for (const candidate of candidates) {
    const value = toPositiveNumberOrZero(candidate)
    if (value > 0) return value
  }
  return 0
}
const pickReceivableDebtTotal = (debtor: Debtor) => {
  const raw = debtor as Record<string, unknown>
  const candidates = [
    debtor.payoffAmount,
    debtor.amountToReturn,
    debtor.returnAmount,
    raw.payoff,
    raw.toReturnAmount,
    raw.payoff_amount,
    raw.amount_to_return,
  ]
  for (const candidate of candidates) {
    const value = toPositiveNumberOrZero(candidate)
    if (value > 0) return value
  }
  return 0
}
const shouldIncludeActiveDebtTotal = (debtor: Debtor, total: number) => {
  if (total <= 0) return false
  const paid = Number(debtor.paidAmount ?? 0)
  if (!Number.isFinite(paid) || paid <= 0) return true
  return total - paid > 0
}

const Section: React.FC<{
  title: string
  items: CardItem[]
  helpTooltip?: {
    ariaLabel: string
    topText: string
    bottomText: string
  }
  rowScroll?: boolean
  rowClass?: string
  onAddAccounts?: () => void
  onAddCategory?: () => void
  onAddIncomeSource?: () => void
  onCategoryClick?: (id: string, title: string) => void
  onAccountClick?: (id: string, title: string) => void
  onIncomeSourceClick?: (id: string, title: string) => void
  onGoalClick?: (id: string, title: string) => void
  onDebtReceivableClick?: () => void
  onDebtPayableClick?: () => void
  baseCurrency: string
}> = ({
  title,
  items,
  helpTooltip,
  rowScroll,
  rowClass,
  onAddAccounts,
  onAddCategory,
  onAddIncomeSource,
  onCategoryClick,
  onAccountClick,
  onIncomeSourceClick,
  onGoalClick,
  onDebtReceivableClick,
  onDebtPayableClick,
  baseCurrency,
}) => {
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const helpButtonRef = useRef<HTMLButtonElement | null>(null)
  const helpTooltipRef = useRef<HTMLDivElement | null>(null)
  const [helpTooltipPosition, setHelpTooltipPosition] = useState<{ left: number; top: number } | null>(null)
  const updateHelpTooltipPosition = useCallback(() => {
    if (!isHelpOpen) return
    const buttonEl = helpButtonRef.current
    const tooltipEl = helpTooltipRef.current
    if (!buttonEl || !tooltipEl || typeof window === "undefined") return

    const buttonRect = buttonEl.getBoundingClientRect()
    const tooltipRect = tooltipEl.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const gap = 8
    const edgePadding = 8

    let left = buttonRect.right + gap
    const maxLeft = viewportWidth - tooltipRect.width - edgePadding
    if (left > maxLeft) left = maxLeft
    if (left < edgePadding) left = edgePadding

    let top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2
    const maxTop = viewportHeight - tooltipRect.height - edgePadding
    if (top > maxTop) top = maxTop
    if (top < edgePadding) top = edgePadding

    setHelpTooltipPosition({ left: Math.round(left), top: Math.round(top) })
  }, [isHelpOpen])

  useEffect(() => {
    if (!isHelpOpen) {
      setHelpTooltipPosition(null)
      return
    }

    updateHelpTooltipPosition()
    window.addEventListener("resize", updateHelpTooltipPosition)
    window.addEventListener("scroll", updateHelpTooltipPosition, true)
    return () => {
      window.removeEventListener("resize", updateHelpTooltipPosition)
      window.removeEventListener("scroll", updateHelpTooltipPosition, true)
    }
  }, [isHelpOpen, updateHelpTooltipPosition])

  const listClass = rowScroll
    ? `overview-section__list overview-section__list--row ${rowClass ?? ""}`.trim()
    : "overview-section__list tile-grid"
  return (
    <section className="overview-section">
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, position: "relative", zIndex: isHelpOpen ? 4 : 1 }}>
        <div className="overview-section__title overview-section__title--muted">{title}</div>
        {helpTooltip ? (
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <button
              ref={helpButtonRef}
              type="button"
              onClick={() => setIsHelpOpen((prev) => !prev)}
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                border: "1px solid #94a3b8",
                background: "#fff",
                color: "#475569",
                fontSize: 10,
                lineHeight: 1,
                fontWeight: 600,
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              aria-label={helpTooltip.ariaLabel}
            >
              ?
            </button>
            {isHelpOpen ? (
              <div
                ref={helpTooltipRef}
                style={{
                  position: "fixed",
                  left: helpTooltipPosition?.left ?? 8,
                  top: helpTooltipPosition?.top ?? 8,
                  width: "max-content",
                  maxWidth: "min(320px, calc(100vw - 48px))",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
                  color: "#334155",
                  fontSize: 11,
                  lineHeight: 1.35,
                  textAlign: "left",
                  zIndex: 5,
                  display: "grid",
                  gap: 7,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>Сумма сверху</span>
                  <span> — {helpTooltip.topText}</span>
                </div>
                <div style={{ width: "100%", height: 1, background: "#e2e8f0" }} />
                <div>{helpTooltip.bottomText}</div>
              </div>
            ) : null}
          </span>
        ) : null}
      </div>
      {isHelpOpen ? (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 3 }}
          onClick={() => setIsHelpOpen(false)}
          onPointerDown={() => setIsHelpOpen(false)}
        />
      ) : null}
      <div className={listClass}>
        {items.map((item) => {
          const categoryHighlight =
            item.type === "category" && item.budgetTone
              ? item.budgetTone === "alert"
                ? { background: "#fef2f2", border: "1px solid #ef4444" }
                : item.budgetTone === "warn"
                ? { background: "#fffbeb", border: "1px solid #f59e0b" }
                : null
              : null
          const bg = item.type === "account" && !item.isAdd ? item.color ?? DEFAULT_ACCOUNT_COLOR : undefined
          const contentColor = item.type === "account" && !item.isAdd ? item.textColor ?? "#0f172a" : undefined
          const shadow = contentColor === "#FFFFFF" ? "0 1px 2px rgba(0,0,0,0.25)" : "none"
          const secondaryColor =
            item.type === "account" && !item.isAdd
              ? contentColor === "#FFFFFF"
                ? "rgba(255,255,255,0.85)"
                : "rgba(17,17,17,0.75)"
              : undefined

          const tileStyle =
            item.type === "account" && !item.isAdd
              ? {
                  background: bg,
                  color: contentColor ?? "#0f172a",
                  border: "1px solid rgba(0,0,0,0.08)",
                }
              : item.type === "category" && categoryHighlight
              ? categoryHighlight
              : item.type === "goal" && !item.isAdd
              ? { padding: "16px 14px", minHeight: 120 }
              : undefined

          return (
            <div
              key={item.id}
              className={`tile-card ${item.isAdd ? "tile-card--add overview-add-tile" : ""} ${
                item.type ? `tile-card--${item.type}` : ""
              }${item.id === "goals-entry" ? " overview-goals-entry-tile" : ""} tile--${item.size ?? "md"}`}
              role={item.isAdd ? "button" : "button"}
              tabIndex={0}
              style={tileStyle}
              onClick={() => {
                if (item.isAdd && item.id === "add-accounts") onAddAccounts?.()
                if (item.isAdd && item.id === "add-category") onAddCategory?.()
                if (item.isAdd && item.id === "add-income-source") onAddIncomeSource?.()
                if (!item.isAdd && item.type === "category") onCategoryClick?.(item.id, item.title)
                if (!item.isAdd && item.type === "account") onAccountClick?.(item.id, item.title)
                if (!item.isAdd && item.type === "income-source") onIncomeSourceClick?.(item.id, item.title)
                if (!item.isAdd && item.type === "goal") onGoalClick?.(item.id, item.title)
                if (!item.isAdd && (item.id === "debt-bank" || item.title === "Мне должны")) onDebtReceivableClick?.()
                if (!item.isAdd && (item.id === "debt-friend" || item.title === "Я должен")) onDebtPayableClick?.()
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return
                if (item.isAdd && item.id === "add-accounts") onAddAccounts?.()
                if (item.isAdd && item.id === "add-category") onAddCategory?.()
                if (item.isAdd && item.id === "add-income-source") onAddIncomeSource?.()
                if (!item.isAdd && item.type === "category") onCategoryClick?.(item.id, item.title)
                if (!item.isAdd && item.type === "account") onAccountClick?.(item.id, item.title)
                if (!item.isAdd && item.type === "income-source") onIncomeSourceClick?.(item.id, item.title)
                if (!item.isAdd && item.type === "goal") onGoalClick?.(item.id, item.title)
                if (!item.isAdd && (item.id === "debt-bank" || item.title === "Мне должны")) onDebtReceivableClick?.()
                if (!item.isAdd && (item.id === "debt-friend" || item.title === "Я должен")) onDebtPayableClick?.()
              }}
            >
              <div
                className="tile-card__icon"
                style={
                  item.isAdd
                    ? undefined
                    : {
                        background: item.type === "account" && !item.isAdd ? "transparent" : "rgba(15, 23, 42, 0.05)",
                        color: item.type === "account" && !item.isAdd ? contentColor ?? "rgba(15, 23, 42, 0.85)" : "rgba(15, 23, 42, 0.85)",
                        opacity: 1,
                        filter: item.type === "account" && !item.isAdd && contentColor === "#FFFFFF" ? "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" : "none",
                      }
                }
              >
                {item.financeIconKey && isFinanceIconKey(item.financeIconKey) ? (
                  <FinanceIcon iconKey={item.financeIconKey} size={16} />
                ) : item.icon ? (
                  <AppIcon name={item.icon as IconName} size={16} />
                ) : null}
              </div>
              <div
                className="tile-card__title"
                style={
                  item.type === "account" && !item.isAdd
                    ? { color: secondaryColor, textShadow: contentColor === "#FFFFFF" ? "0 1px 2px rgba(0,0,0,0.25)" : "none" }
                    : undefined
                }
              >
                {item.title}
              </div>
              {!item.isAdd && (
                <div
                  className="tile-card__amount"
                  style={
                    item.type === "account"
                      ? { color: contentColor ?? "#0f172a", textShadow: shadow }
                      : undefined
                  }
                >
                  {formatMoney(item.amount, baseCurrency)}
                  {item.type === "category" && item.budget != null ? (
                    <div style={{ marginTop: 2, fontSize: 9, color: "#6b7280" }}>{formatMoney(item.budget, baseCurrency)}</div>
                  ) : null}
                  {item.type === "account" && item.secondaryAmount != null ? (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 11,
                        lineHeight: "14px",
                        color: secondaryColor ?? "#475569",
                        textShadow: contentColor === "#FFFFFF" ? "0 1px 2px rgba(0,0,0,0.25)" : "none",
                        fontWeight: 600,
                      }}
                    >
                      {formatMoney(item.secondaryAmount, baseCurrency)}
                    </div>
                  ) : null}
                  {item.secondaryText ? (
                    <div style={{ marginTop: 4, fontSize: 9, color: "#475569", fontWeight: 600 }}>{item.secondaryText}</div>
                  ) : null}
                  {item.type === "goal" ? (
                    <>
                      <div style={{ marginTop: 4, fontSize: 9, color: "#475569", fontWeight: 600 }}>
                        {formatMoney(item.goalCurrent ?? item.amount, baseCurrency)} / {formatMoney(item.amountTarget ?? 0, baseCurrency)}
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          height: 6,
                          borderRadius: 999,
                          background: "#e5e7eb",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, (item.progress ?? 0) * 100))}%`,
                            height: "100%",
                            background: "#0f172a",
                          }}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

type OverviewScreenProps = {
  overviewError?: string | null
  onRetryOverview?: () => Promise<void> | void
  externalCategoryId?: string | null
  onConsumeExternalCategory?: () => void
  returnToReport?: boolean
  onReturnToReport?: () => void
  externalIncomeSourceId?: string | null
  onConsumeExternalIncomeSource?: () => void
  returnToIncomeReport?: boolean
  onReturnToIncomeReport?: () => void
  onOpenGoalsList?: () => void
  onOpenReceivables?: () => void
  onOpenPayables?: () => void
  onOpenQuickAddTransfer?: () => void
  onOpenQuickAddIncome?: (incomeSourceId: string | null) => void
  onOpenQuickAddExpense?: (categoryId: string | null) => void
  onOpenQuickAddGoal?: () => void
  onOpenQuickAddDebtReceivable?: () => void
  onOpenQuickAddDebtPayable?: () => void
  autoOpenGoalsList?: boolean
  onConsumeAutoOpenGoalsList?: () => void
  autoOpenGoalCreate?: boolean
  onConsumeAutoOpenGoalCreate?: () => void
  goalsListMode?: "goals" | "debtsReceivable" | "debtsPayable"
  skipGoalsListRefetch?: boolean
  workspaceAccountLabel?: string
  workspaceAccountIcon?: string
  activeSpaceKey?: "personal" | "family"
  canOpenWorkspaceSwitcher?: boolean
  onOpenWorkspaceSwitcher?: () => void
  isOverviewLoading?: boolean
}

function OverviewScreen({
  overviewError = null,
  onRetryOverview,
  externalCategoryId,
  onConsumeExternalCategory,
  returnToReport,
  onReturnToReport,
  externalIncomeSourceId,
  onConsumeExternalIncomeSource,
  returnToIncomeReport,
  onReturnToIncomeReport,
  onOpenGoalsList,
  onOpenReceivables,
  onOpenPayables,
  onOpenQuickAddTransfer,
  onOpenQuickAddIncome,
  onOpenQuickAddExpense,
  onOpenQuickAddGoal,
  onOpenQuickAddDebtReceivable,
  onOpenQuickAddDebtPayable,
  autoOpenGoalsList = false,
  onConsumeAutoOpenGoalsList,
  autoOpenGoalCreate = false,
  onConsumeAutoOpenGoalCreate,
  goalsListMode = "goals",
  skipGoalsListRefetch = false,
  workspaceAccountLabel = "Личный",
  workspaceAccountIcon = "Л",
  activeSpaceKey = "personal",
  canOpenWorkspaceSwitcher = false,
  onOpenWorkspaceSwitcher,
  isOverviewLoading = false,
}: OverviewScreenProps) {
  const {
    accounts,
    categories,
    incomeSources,
    goals,
    debtors,
    transactions,
    setAccounts,
    setCategories,
    setIncomeSources,
    setGoals,
    setDebtors,
    setTransactions,
    currency,
  } = useAppStore()
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [type, setType] = useState("cash")
  const [balance, setBalance] = useState("0")
  const [accountColor, setAccountColor] = useState(accountColorOptions[0])
  const [accountIcon, setAccountIcon] = useState<string | null>(null)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [accountActionError, setAccountActionError] = useState<string | null>(null)
  const [isAccountIconPickerOpen, setIsAccountIconPickerOpen] = useState(false)
  const [accountSheetIntent, setAccountSheetIntent] = useState<null | "openAccountIconPicker" | "returnToAccountSheet">(null)
  const [categorySheetMode, setCategorySheetMode] = useState<"create" | "edit" | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState("")
  const [categoryBudget, setCategoryBudget] = useState("")
  const [categoryIcon, setCategoryIcon] = useState<string | null>(null)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [categorySaveError, setCategorySaveError] = useState<string | null>(null)
  const [pendingCategoryEdit, setPendingCategoryEdit] = useState<{ id: string; title: string } | null>(null)
  const [isCategoryIconPickerOpen, setIsCategoryIconPickerOpen] = useState(false)
  const lastCategorySheetModeRef = useRef<"create" | "edit" | null>(null)
  const [incomeSourceSheetMode, setIncomeSourceSheetMode] = useState<"create" | "edit" | null>(null)
  const [editingIncomeSourceId, setEditingIncomeSourceId] = useState<string | null>(null)
  const [incomeSourceName, setIncomeSourceName] = useState("")
  const [incomeSourceIcon, setIncomeSourceIcon] = useState<string | null>(null)
  const [incomeSourceError, setIncomeSourceError] = useState<string | null>(null)
  const [isSavingIncomeSource, setIsSavingIncomeSource] = useState(false)
  const [deletingIncomeSourceId, setDeletingIncomeSourceId] = useState<string | null>(null)
  const [pendingIncomeSourceEdit, setPendingIncomeSourceEdit] = useState<{ id: string; title: string } | null>(null)
  const [isIncomeIconPickerOpen, setIsIncomeIconPickerOpen] = useState(false)
  const lastIncomeSourceModeRef = useRef<"create" | "edit" | null>(null)
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null)
  const [detailCategoryId, setDetailCategoryId] = useState<string | null>(null)
  const [detailIncomeSourceId, setDetailIncomeSourceId] = useState<string | null>(null)
  const [isGoalsListOpen, setIsGoalsListOpen] = useState(false)
  const [isGoalsListLoading, setIsGoalsListLoading] = useState(false)
  const [isDebtorsListLoading, setIsDebtorsListLoading] = useState(false)
  const [goalTab] = useState<"active" | "completed">("active")
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null)
  const [detailDebtorId, setDetailDebtorId] = useState<string | null>(null)
  const [goalSearch, setGoalSearch] = useState("")
  const [isGoalCompleteSheetOpen, setIsGoalCompleteSheetOpen] = useState(false)
  const [debtorSearch, setDebtorSearch] = useState("")
  const [isGoalSheetOpen, setIsGoalSheetOpen] = useState(false)
  const [goalName, setGoalName] = useState("")
  const [goalTarget, setGoalTarget] = useState("")
  const [goalIcon, setGoalIcon] = useState<string | null>(null)
  const [isDebtorSheetOpen, setIsDebtorSheetOpen] = useState(false)
  const [debtorSheetMode, setDebtorSheetMode] = useState<"create" | "edit">("create")
  const [editingDebtorId, setEditingDebtorId] = useState<string | null>(null)
  const [debtorName, setDebtorName] = useState("")
  const [debtorIcon, setDebtorIcon] = useState<string | null>(null)
  const [debtorIssuedDate, setDebtorIssuedDate] = useState(() => getTodayLocalDate())
  const [debtorReturnDate, setDebtorReturnDate] = useState(() => getTodayLocalDate())
  const [debtorReturnAmount, setDebtorReturnAmount] = useState("")
  const [debtorError, setDebtorError] = useState<string | null>(null)
  const [isConfirmingDebtorClose, setIsConfirmingDebtorClose] = useState(false)
  const [isDebtorIconPickerOpen, setIsDebtorIconPickerOpen] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [isSavingGoal, setIsSavingGoal] = useState(false)
  const [goalSheetMode, setGoalSheetMode] = useState<"create" | "edit">("create")
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [pendingGoalCreate, setPendingGoalCreate] = useState(false)
  const [pendingOpenGoalsList, setPendingOpenGoalsList] = useState(false)
  const [pendingGoalEdit, setPendingGoalEdit] = useState<{ id: string; title: string } | null>(null)
  const [isGoalIconPickerOpen, setIsGoalIconPickerOpen] = useState(false)
  const [goalSheetIntent, setGoalSheetIntent] = useState<null | "openGoalIconPicker" | "returnToGoalSheet">(null)
  const [detailTitle, setDetailTitle] = useState<string>("")
  const [accountSearch, setAccountSearch] = useState("")
  const [categorySearch, setCategorySearch] = useState("")
  const [incomeSourceSearch, setIncomeSourceSearch] = useState("")
  const [accountPeriodType, setAccountPeriodType] = useState<AccountPeriodType>("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [customFromDraft, setCustomFromDraft] = useState("")
  const [customToDraft, setCustomToDraft] = useState("")
  const [isCustomSheetOpen, setIsCustomSheetOpen] = useState(false)
  const [isAccountPeriodMenuOpen, setIsAccountPeriodMenuOpen] = useState(false)
  const [hasAccountPeriodSelection, setHasAccountPeriodSelection] = useState(false)
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null)
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false)
  const accountCustomFromInputRef = useRef<HTMLInputElement | null>(null)
  const accountCustomToInputRef = useRef<HTMLInputElement | null>(null)
  const accountPeriodButtonRef = useRef<HTMLButtonElement | null>(null)
  const [accountPeriodPopoverWidth, setAccountPeriodPopoverWidth] = useState<number | null>(null)
  const [txActionId, setTxActionId] = useState<string | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [txMode, setTxMode] = useState<"none" | "actions" | "delete" | "edit">("none")
  const [txError, setTxError] = useState<string | null>(null)
  const [txLoading, setTxLoading] = useState(false)
  const [disabledTxHintId, setDisabledTxHintId] = useState<string | null>(null)
  const [disabledTxHintPosition, setDisabledTxHintPosition] = useState<{ top: number; left: number; maxWidth: number } | null>(null)
  const disabledTxHintRef = useRef<HTMLDivElement | null>(null)
  const goalsListLoadingRef = useRef(false)
  const goalsListLoadedOnceRef = useRef(false)
  const goalsListLastLoadedAtRef = useRef(0)
  const debtorsListLoadingRef = useRef(false)
  const debtorsListLoadedOnceRef = useRef<{ receivable: boolean; payable: boolean }>({ receivable: false, payable: false })
  const debtorsListLastLoadedAtRef = useRef<{ receivable: number; payable: number }>({ receivable: 0, payable: 0 })
  const [editAmount, setEditAmount] = useState("")
  const [editDate, setEditDate] = useState("")
  const isDebtsReceivableMode = goalsListMode === "debtsReceivable"
  const isDebtsPayableMode = goalsListMode === "debtsPayable"
  const isDebtsMode = isDebtsReceivableMode || isDebtsPayableMode
  const isGoalsMode = goalsListMode === "goals"
  const currentDebtorDirection: "receivable" | "payable" = isDebtsPayableMode ? "payable" : "receivable"
  const goalsListTitle = isDebtsReceivableMode ? "Мне должны" : isDebtsPayableMode ? "Я должен" : "Список целей"
  const hasAccountDuplicateNameError = isDuplicateNameError(accountActionError)
  const hasCategoryDuplicateNameError = isDuplicateNameError(categorySaveError)
  const hasIncomeSourceDuplicateNameError = isDuplicateNameError(incomeSourceError)
  const hasGoalDuplicateNameError = isDuplicateNameError(goalError)
  const hasDebtorDuplicateNameError = isDuplicateNameError(debtorError)
  const hasGoalAmountRequiredError = isAmountRequiredError(goalError)
  const hasDebtorAmountRequiredError = isAmountRequiredError(debtorError)
  const debtFormTitle = currentDebtorDirection === "payable" ? "Добавить кредитора" : "Добавить должника"
  const accountPreviewColor = accountColor || accountColorOptions[0]
  const currentMonthPoint = getLocalMonthPoint()
  const { run: runAccountFlight, isRunning: isAccountFlight } = useSingleFlight()
  const { run: runCategorySave, isRunning: isCategorySaveRunning } = useSingleFlight()
  const { run: runCategoryDelete, isRunning: isCategoryDeleteRunning } = useSingleFlight()
  const { run: runIncomeSave, isRunning: isIncomeSaveRunning } = useSingleFlight()
  const { run: runIncomeDelete, isRunning: isIncomeDeleteRunning } = useSingleFlight()
  const { run: runDeleteTx, isRunning: isDeleteTxRunning } = useSingleFlight()
  const { run: runEditTx, isRunning: isEditTxRunning } = useSingleFlight()
  const { run: runDebtorSave, isRunning: isDebtorSaveRunning } = useSingleFlight()
  const { run: runDebtorDelete, isRunning: isDebtorDeleteRunning } = useSingleFlight()
  const { run: runGoalComplete, isRunning: isGoalCompleteRunning } = useSingleFlight()

  const applyCustomRange = useCallback(() => {
    if (!customFromDraft || !customToDraft) return
    let from = customFromDraft
    let to = customToDraft
    if (new Date(from) > new Date(to)) {
      ;[from, to] = [to, from]
    }
    setCustomFrom(from)
    setCustomTo(to)
    setAccountPeriodType("custom")
    setIsCustomSheetOpen(false)
  }, [customFromDraft, customToDraft])

  const openEditAccountSheet = useCallback(
    (accountId: string) => {
      const acc = accounts.find((a) => a.id === accountId)
      setEditingAccountId(accountId)
      setName(acc?.name ?? "")
      setBalance(acc ? String(acc.balance.amount) : "0")
      const accType = acc?.type ?? "cash"
      setType(accType)
      const accClr = (acc as { color?: string } | undefined)?.color ?? accountColorOptions[0]
      setAccountColor(accClr)
      setAccountIcon((acc as { icon?: string | null } | undefined)?.icon ?? null)
      setIsConfirmingDelete(false)
      setAccountActionError(null)
      setIsAccountSheetOpen(true)
    },
    [accounts],
  )


  const closeAccountSheet = useCallback(() => {
    setIsAccountSheetOpen(false)
    setEditingAccountId(null)
    setIsConfirmingDelete(false)
    setAccountActionError(null)
    setName("")
    setBalance("0")
    setType("cash")
    setAccountColor(accountColorOptions[0])
    setAccountIcon(null)
  }, [])

  const monthlyMetrics = useMemo(
    () => buildMonthlyTransactionMetrics(transactions, currentMonthPoint),
    [currentMonthPoint.monthIndex, currentMonthPoint.year, transactions],
  )
  const incomeBySource = monthlyMetrics.incomeBySource
  const expenseByCategory = monthlyMetrics.expenseByCategory
  const monthlyIncomeSum = monthlyMetrics.incomeTotal
  const monthlyExpenseSum = monthlyMetrics.expenseTotal

  const monthlyGoalInflow = useMemo(
    () =>
      transactions.reduce((sum, tx) => {
        if (!isDateInMonthPoint(tx.date, currentMonthPoint)) return sum
        if (!isGoalContributionTx(tx)) return sum
        const amount = Number(tx.amount.amount ?? 0)
        return Number.isFinite(amount) ? sum + Math.abs(amount) : sum
      }, 0),
    [currentMonthPoint.monthIndex, currentMonthPoint.year, transactions],
  )
  const currentMonthRange = useMemo(() => {
    const start = new Date(currentMonthPoint.year, currentMonthPoint.monthIndex, 1)
    const next = new Date(currentMonthPoint.year, currentMonthPoint.monthIndex + 1, 1)
    return { startMs: start.getTime(), nextMs: next.getTime() }
  }, [currentMonthPoint.monthIndex, currentMonthPoint.year])
  const monthlyReceivableRepayment = useMemo(
    () =>
      transactions.reduce((sum, tx) => {
        const isReceivableRepayment =
          tx.type === "transfer" && Boolean(tx.toAccountId) && !tx.fromAccountId && !tx.goalId
        if (!isReceivableRepayment) return sum
        if (!tx.date) return sum
        const timestamp = new Date(tx.date).getTime()
        if (!Number.isFinite(timestamp) || timestamp < currentMonthRange.startMs || timestamp >= currentMonthRange.nextMs) {
          return sum
        }
        const amount = Number(tx.amount.amount ?? 0)
        return Number.isFinite(amount) ? sum + Math.abs(amount) : sum
      }, 0),
    [currentMonthRange.nextMs, currentMonthRange.startMs, transactions],
  )
  const monthlyPayableRepayment = useMemo(
    () =>
      transactions.reduce((sum, tx) => {
        const isPayableRepayment = isPayableDebtRepaymentTx(tx)
        if (!isPayableRepayment) return sum
        if (!tx.date) return sum
        const timestamp = new Date(tx.date).getTime()
        if (!Number.isFinite(timestamp) || timestamp < currentMonthRange.startMs || timestamp >= currentMonthRange.nextMs) {
          return sum
        }
        const amount = Number(tx.amount.amount ?? 0)
        return Number.isFinite(amount) ? sum + Math.abs(amount) : sum
      }, 0),
    [currentMonthRange.nextMs, currentMonthRange.startMs, transactions],
  )

  const monthLabel = useMemo(() => {
    const now = new Date()
    return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(now).replace(/\s*г\.$/u, "")
  }, [])
  const overviewRenderKey = useMemo(() => `${activeSpaceKey}:${monthLabel}`, [activeSpaceKey, monthLabel])
  const [latchedReadyKey, setLatchedReadyKey] = useState<string | null>(null)
  const lastOverviewRenderKeyRef = useRef(overviewRenderKey)
  useEffect(() => {
    if (lastOverviewRenderKeyRef.current === overviewRenderKey) return
    lastOverviewRenderKeyRef.current = overviewRenderKey
    setLatchedReadyKey(null)
  }, [overviewRenderKey])
  useEffect(() => {
    if (isOverviewLoading) return
    if (latchedReadyKey === overviewRenderKey) return
    setLatchedReadyKey(overviewRenderKey)
  }, [isOverviewLoading, latchedReadyKey, overviewRenderKey])
  const showOverviewSkeleton = latchedReadyKey !== overviewRenderKey

  const baseCurrency = normalizeCurrency(currency || "RUB")

  const activeGoals = useMemo(() => goals.filter((g) => g.status === "active"), [goals])
  const activeExpenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense" && !category.isArchived),
    [categories],
  )
  const activeIncomeSources = useMemo(
    () => incomeSources.filter((incomeSource) => !incomeSource.isArchived),
    [incomeSources],
  )
  const filteredGoals = useMemo(() => {
    if (isDebtsMode) return []
    return activeGoals
  }, [activeGoals, isDebtsMode])
  const activeGoalIds = useMemo(() => new Set(activeGoals.map((goal) => goal.id)), [activeGoals])
  const reservedInActiveGoalsByAccountId = useMemo(() => {
    const reservedByAccountId = new Map<string, number>()
    transactions.forEach((tx) => {
      if (tx.type !== "transfer" || !tx.goalId || !activeGoalIds.has(tx.goalId)) return
      const amount = Number(tx.amount.amount ?? 0)
      if (!Number.isFinite(amount)) return
      const normalizedAmount = Math.abs(amount)
      const sourceAccountId = tx.fromAccountId ?? tx.accountId
      if (sourceAccountId && !tx.toAccountId) {
        reservedByAccountId.set(sourceAccountId, (reservedByAccountId.get(sourceAccountId) ?? 0) + normalizedAmount)
        return
      }
      if (!tx.fromAccountId && tx.toAccountId) {
        reservedByAccountId.set(tx.toAccountId, (reservedByAccountId.get(tx.toAccountId) ?? 0) - normalizedAmount)
      }
    })
    reservedByAccountId.forEach((value, accountId) => {
      if (value <= 0) {
        reservedByAccountId.delete(accountId)
      }
    })
    return reservedByAccountId
  }, [activeGoalIds, transactions])
  const receivablePaidByDebtorId = useMemo(() => {
    const paidById: Record<string, number> = {}
    transactions.forEach((tx) => {
      if (!tx.debtorId) return
      const isReceivableReturn = tx.type === "transfer" && Boolean(tx.toAccountId) && !tx.fromAccountId
      if (!isReceivableReturn) return
      const amount = Number(tx.amount.amount ?? 0)
      if (!Number.isFinite(amount)) return
      paidById[tx.debtorId] = (paidById[tx.debtorId] ?? 0) + Math.abs(amount)
    })
    return paidById
  }, [transactions])
  const payablePaidByDebtorId = useMemo(() => {
    const paidById: Record<string, number> = {}
    transactions.forEach((tx) => {
      if (!tx.debtorId) return
      const isPayableRepayment = tx.type === "expense" && !tx.goalId
      if (!isPayableRepayment) return
      const amount = Number(tx.amount.amount ?? 0)
      if (!Number.isFinite(amount)) return
      paidById[tx.debtorId] = (paidById[tx.debtorId] ?? 0) + Math.abs(amount)
    })
    return paidById
  }, [transactions])
  const totalActivePayableDebt = useMemo(
    () =>
      debtors.reduce((sum, debtor) => {
        if (debtor.direction !== "payable" || debtor.status !== "active") return sum
        const total = pickPayableDebtTotal(debtor)
        return shouldIncludeActiveDebtTotal(debtor, total) ? sum + total : sum
      }, 0),
    [debtors],
  )
  const totalActiveReceivableDebt = useMemo(
    () =>
      debtors.reduce((sum, debtor) => {
        if (debtor.direction !== "receivable" || debtor.status !== "active") return sum
        const total = pickReceivableDebtTotal(debtor)
        return shouldIncludeActiveDebtTotal(debtor, total) ? sum + total : sum
      }, 0),
    [debtors],
  )
  const filteredDebtors = useMemo(() => {
    if (!isDebtsMode || !isGoalsListOpen) return []
    return debtors
      .filter((d) => d.direction === currentDebtorDirection && d.status === goalTab)
      .map((debtor) =>
        currentDebtorDirection === "receivable"
          ? {
              ...debtor,
              paidAmount: receivablePaidByDebtorId[debtor.id] ?? debtor.paidAmount ?? 0,
            }
          : {
              ...debtor,
              paidAmount: payablePaidByDebtorId[debtor.id] ?? debtor.paidAmount ?? 0,
            },
      )
  }, [currentDebtorDirection, debtors, goalTab, isDebtsMode, isGoalsListOpen, payablePaidByDebtorId, receivablePaidByDebtorId])
  const detailGoal = useMemo(() => goals.find((g) => g.id === detailGoalId) ?? null, [detailGoalId, goals])
  const detailDebtor = useMemo(() => debtors.find((d) => d.id === detailDebtorId) ?? null, [debtors, detailDebtorId])
  const incomeIconKeys = useMemo(() => {
    const section = FINANCE_ICON_SECTIONS.find((s) => s.id === "income")
    return section ? section.keys : []
  }, [])
  const categoryIconKeys = useMemo(() => {
    const section = FINANCE_ICON_SECTIONS.find((s) => s.id === "expense")
    return section ? section.keys : []
  }, [])
  const accountIconKeys = useMemo(() => {
    const section = FINANCE_ICON_SECTIONS.find((s) => s.id === "accounts")
    return section ? section.keys : []
  }, [])
  const goalIconKeys = useMemo(() => {
    const section = FINANCE_ICON_SECTIONS.find((s) => s.id === (isDebtsMode ? "debts" : "goals"))
    return section ? section.keys : []
  }, [isDebtsMode])
  const debtorIconKeys = useMemo(() => {
    const section = FINANCE_ICON_SECTIONS.find((s) => s.id === "debts")
    return section ? section.keys : []
  }, [])
  const formatDebtorDate = useCallback((iso: string) => {
    const [year, month, day] = iso.split("-").map((value) => Number(value))
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return iso
    const parsed = new Date(year, month - 1, day)
    if (Number.isNaN(parsed.getTime())) return iso
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      .format(parsed)
      .replace(/\s*г\.$/u, "")
      .trim()
  }, [])
  const debtorIssuedDateLabel = useMemo(() => formatDebtorDate(debtorIssuedDate), [debtorIssuedDate, formatDebtorDate])
  const debtorReturnDateLabel = useMemo(() => formatDebtorDate(debtorReturnDate), [debtorReturnDate, formatDebtorDate])

  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null), [])

  const refetchCategories = useCallback(async () => {
    if (!token) return
    const data = await getCategories(token)
    const mapped = data.categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.kind,
      icon: c.icon,
      budget: c.budget ?? null,
      isArchived: c.isArchived ?? false,
    }))
    setCategories(mapped)
  }, [setCategories, token])

  const refetchIncomeSources = useCallback(async () => {
    if (!token) return
    const data = await getIncomeSources(token)
    const mapped = data.incomeSources.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon ?? null,
      isArchived: s.isArchived ?? false,
    }))
    setIncomeSources(mapped)
  }, [setIncomeSources, token])

  const refetchGoals = useCallback(async () => {
    if (!token) return
    const data = await getGoals(token)
    const mapped: Goal[] = data.goals.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
      status: g.status,
    }))
    setGoals(mapped)
    goalsListLoadedOnceRef.current = true
    goalsListLastLoadedAtRef.current = Date.now()
  }, [setGoals, token])

  const refetchDebtors = useCallback(async () => {
    if (!token) return
    const data = await getDebtors(token, { direction: currentDebtorDirection })
    const mapped: Debtor[] = data.debtors.map((d) => ({
      id: d.id,
      name: d.name,
      icon: d.icon,
      issuedDate: d.issuedAt.slice(0, 10),
      loanAmount: Number(d.principalAmount),
      dueDate: d.dueAt ? d.dueAt.slice(0, 10) : "",
      returnAmount: d.payoffAmount === null ? Number(d.principalAmount) : Number(d.payoffAmount),
      payoffAmount: d.payoffAmount === null ? null : Number(d.payoffAmount),
      status: d.status,
      direction: d.direction ?? currentDebtorDirection,
    }))
    const preserved = debtors.filter((debtor) => debtor.direction !== currentDebtorDirection)
    setDebtors([...preserved, ...mapped])
    debtorsListLoadedOnceRef.current[currentDebtorDirection] = true
    debtorsListLastLoadedAtRef.current[currentDebtorDirection] = Date.now()
  }, [currentDebtorDirection, debtors, setDebtors, token])

  const refetchAccountsSeq = useCallback(async () => {
    if (!token) return
    const data = await getAccounts(token)
    const mapped = data.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: { amount: a.balance, currency: a.currency },
      color: a.color ?? undefined,
      icon: a.icon ?? null,
    }))
    setAccounts(mapped)
  }, [setAccounts, token])

  const refetchTransactions = useCallback(async () => {
    if (!token) return
    const data = await getTransactions(token)
    const mapped = data.transactions.map((t) => ({
      id: t.id,
      type: t.kind,
      amount: {
        amount: typeof t.amount === "string" ? Number(t.amount) : t.amount,
        currency: "RUB",
      },
      date: t.happenedAt,
      accountId: t.accountId ?? t.fromAccountId ?? "",
      accountName: t.accountName ?? null,
      fromAccountId: t.fromAccountId ?? undefined,
      fromAccountName: t.fromAccountName ?? null,
      categoryId: t.categoryId ?? undefined,
      incomeSourceId: t.incomeSourceId ?? undefined,
      toAccountId: t.toAccountId ?? undefined,
      toAccountName: t.toAccountName ?? null,
      goalId: t.goalId ?? undefined,
      goalName: t.goalName ?? null,
      debtorId: t.debtorId ?? undefined,
      debtorName: t.debtorName ?? null,
      createdByUserId: t.createdByUserId ?? null,
      createdByName: t.createdByName ?? null,
    }))
    setTransactions(mapped)
  }, [setTransactions, token])

  useEffect(() => {
    if (goalsListLoadedOnceRef.current || goals.length === 0) return
    goalsListLoadedOnceRef.current = true
    goalsListLastLoadedAtRef.current = Date.now()
  }, [goals.length])

  useEffect(() => {
    if (debtors.length === 0) return
    const now = Date.now()
    if (!debtorsListLoadedOnceRef.current.receivable && debtors.some((debtor) => debtor.direction === "receivable")) {
      debtorsListLoadedOnceRef.current.receivable = true
      debtorsListLastLoadedAtRef.current.receivable = now
    }
    if (!debtorsListLoadedOnceRef.current.payable && debtors.some((debtor) => debtor.direction === "payable")) {
      debtorsListLoadedOnceRef.current.payable = true
      debtorsListLastLoadedAtRef.current.payable = now
    }
  }, [debtors])

  const openCreateCategory = useCallback(() => {
    setCategorySheetMode("create")
    lastCategorySheetModeRef.current = "create"
    setEditingCategoryId(null)
    setCategoryName("")
    setCategoryBudget("")
    setCategoryIcon(null)
    setCategorySaveError(null)
  }, [])

  const openGoalsList = useCallback(async () => {
    setIsGoalsListOpen(true)
    setDetailGoalId(null)
    setDetailDebtorId(null)
    setGoalError(null)
  }, [])

  useEffect(() => {
    if (!isGoalsListOpen || !isGoalsMode) return
    if (goalsListLoadingRef.current) return
    const now = Date.now()
    const isStale = now - goalsListLastLoadedAtRef.current >= GOALS_LIST_STALE_MS
    if (goalsListLoadedOnceRef.current && !isStale) return
    goalsListLoadingRef.current = true
    setIsGoalsListLoading(true)
    setGoalError(null)
    void refetchGoals()
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Не удалось загрузить цели"
        setGoalError(msg)
      })
      .finally(() => {
        goalsListLoadingRef.current = false
        setIsGoalsListLoading(false)
      })
  }, [isGoalsListOpen, isGoalsMode, refetchGoals])

  useEffect(() => {
    if (!isGoalsListOpen || !isDebtsMode || skipGoalsListRefetch) return
    if (debtorsListLoadingRef.current) return
    const lastLoadedAt = debtorsListLastLoadedAtRef.current[currentDebtorDirection]
    const loadedOnce = debtorsListLoadedOnceRef.current[currentDebtorDirection]
    const isStale = Date.now() - lastLoadedAt >= GOALS_LIST_STALE_MS
    if (loadedOnce && !isStale) return
    debtorsListLoadingRef.current = true
    setIsDebtorsListLoading(true)
    setGoalError(null)
    void refetchDebtors()
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Не удалось загрузить должников"
        setGoalError(msg)
      })
      .finally(() => {
        debtorsListLoadingRef.current = false
        setIsDebtorsListLoading(false)
      })
  }, [currentDebtorDirection, isDebtsMode, isGoalsListOpen, refetchDebtors, skipGoalsListRefetch])

  useEffect(() => {
    if (!isGoalsListOpen && pendingGoalCreate) {
      setPendingGoalCreate(false)
      setIsGoalSheetOpen(true)
    }
  }, [isGoalsListOpen, pendingGoalCreate])

  useEffect(() => {
    if (!isGoalSheetOpen && pendingOpenGoalsList) {
      setPendingOpenGoalsList(false)
      void openGoalsList()
    }
  }, [isGoalSheetOpen, openGoalsList, pendingOpenGoalsList])

  useEffect(() => {
    if (!isGoalSheetOpen && goalSheetIntent === "openGoalIconPicker") {
      setIsGoalIconPickerOpen(true)
      setGoalSheetIntent(null)
    }
  }, [goalSheetIntent, isGoalSheetOpen])

  useEffect(() => {
    if (!isGoalIconPickerOpen && goalSheetIntent === "returnToGoalSheet") {
      setIsGoalSheetOpen(true)
      setGoalSheetIntent(null)
    }
  }, [goalSheetIntent, isGoalIconPickerOpen])

  const autoOpenGoalsListInFlightRef = useRef(false)

  useEffect(() => {
    if (!autoOpenGoalsList || autoOpenGoalsListInFlightRef.current) return
    autoOpenGoalsListInFlightRef.current = true
    void openGoalsList().finally(() => {
      autoOpenGoalsListInFlightRef.current = false
      onConsumeAutoOpenGoalsList?.()
    })
  }, [autoOpenGoalsList, onConsumeAutoOpenGoalsList, openGoalsList])

  const autoOpenGoalCreateInFlightRef = useRef(false)
  useEffect(() => {
    if (!autoOpenGoalCreate || autoOpenGoalCreateInFlightRef.current) return
    autoOpenGoalCreateInFlightRef.current = true
    if (!isDebtsMode) {
      setGoalError(null)
      setGoalName("")
      setGoalTarget("")
      setGoalIcon(null)
      setEditingGoalId(null)
      setGoalSheetMode("create")
      setPendingGoalCreate(true)
      setIsGoalsListOpen(false)
    }
    onConsumeAutoOpenGoalCreate?.()
    autoOpenGoalCreateInFlightRef.current = false
  }, [autoOpenGoalCreate, isDebtsMode, onConsumeAutoOpenGoalCreate])

  useEffect(() => {
    if (externalCategoryId) {
      const cat = categories.find((c) => c.id === externalCategoryId)
      setDetailCategoryId(externalCategoryId)
      setDetailTitle(cat?.name ?? "Категория")
      onConsumeExternalCategory?.()
    }
  }, [categories, externalCategoryId, onConsumeExternalCategory])

  useEffect(() => {
    if (externalIncomeSourceId) {
      const src = incomeSources.find((s) => s.id === externalIncomeSourceId)
      setDetailIncomeSourceId(externalIncomeSourceId)
      setDetailTitle(src?.name ?? "Источник дохода")
      onConsumeExternalIncomeSource?.()
    }
  }, [externalIncomeSourceId, incomeSources, onConsumeExternalIncomeSource])

  useEffect(() => {
    if (!isDebtsPayableMode || !isDebtorSheetOpen) return
    const activeElement = typeof document !== "undefined" ? document.activeElement : null
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      activeElement.blur()
    }
  }, [isDebtorSheetOpen, isDebtsPayableMode])

  useEffect(() => {
    if (!isAccountSheetOpen && accountSheetIntent === "openAccountIconPicker") {
      setIsAccountIconPickerOpen(true)
      setAccountSheetIntent(null)
    }
  }, [accountSheetIntent, isAccountSheetOpen])

  useEffect(() => {
    if (!isAccountIconPickerOpen && accountSheetIntent === "returnToAccountSheet") {
      setIsAccountSheetOpen(true)
      setAccountSheetIntent(null)
    }
  }, [accountSheetIntent, isAccountIconPickerOpen])

  useEffect(() => {
    if (!detailGoalId && pendingGoalEdit) {
      setGoalError(null)
      const goal = goals.find((g) => g.id === pendingGoalEdit.id)
      setGoalName(goal?.name ?? pendingGoalEdit.title)
      setGoalTarget(goal ? String(goal.targetAmount) : "")
      setGoalIcon(goal?.icon ?? null)
      setGoalSheetMode("edit")
      setEditingGoalId(pendingGoalEdit.id)
      setPendingGoalEdit(null)
      setIsGoalSheetOpen(true)
    }
  }, [detailGoalId, goals, pendingGoalEdit])

  const openEditCategory = useCallback((id: string, title: string) => {
    setDetailCategoryId(id)
    setDetailIncomeSourceId(null)
    setDetailAccountId(null)
    setDetailTitle(title)
  }, [])

  const openCreateIncomeSource = useCallback(() => {
    setIncomeSourceSheetMode("create")
    lastIncomeSourceModeRef.current = "create"
    setEditingIncomeSourceId(null)
    setIncomeSourceName("")
    setIncomeSourceIcon(null)
    setIncomeSourceError(null)
  }, [])

  const openIncomeSourceDetails = useCallback((id: string, title: string) => {
    if (!id) return
    setDetailIncomeSourceId(id)
    setDetailTitle(title)
    setDetailAccountId(null)
    setDetailCategoryId(null)
  }, [])

  const closeCategorySheet = useCallback(
    (opts?: { preserveForm?: boolean }) => {
      setCategorySheetMode(null)
      setCategorySaveError(null)
      if (!opts?.preserveForm) {
        setEditingCategoryId(null)
        setCategoryName("")
        setCategoryBudget("")
        setCategoryIcon(null)
        setIsSavingCategory(false)
        setDeletingCategoryId(null)
      }
    },
    [],
  )

  const resetIncomeSourceForm = useCallback(() => {
    setEditingIncomeSourceId(null)
    setIncomeSourceName("")
    setIncomeSourceIcon(null)
    setIncomeSourceError(null)
    setIsSavingIncomeSource(false)
    setDeletingIncomeSourceId(null)
    setPendingIncomeSourceEdit(null)
  }, [])

  const closeIncomeSourceSheet = useCallback(
    (opts?: { preserveForm?: boolean }) => {
      setIncomeSourceSheetMode(null)
      if (!opts?.preserveForm) {
        resetIncomeSourceForm()
      }
    },
    [resetIncomeSourceForm],
  )

  const openEditCategorySheet = useCallback(
    (id: string, title: string) => {
      setCategorySheetMode("edit")
      lastCategorySheetModeRef.current = "edit"
      setEditingCategoryId(id)
      setCategoryName(title)
      setCategorySaveError(null)
      const cat = categories.find((c) => c.id === id)
      setCategoryBudget(cat && (cat as { budget?: number | string }).budget ? String((cat as any).budget) : "")
      setCategoryIcon((cat as { icon?: string | null } | undefined)?.icon ?? null)
    },
    [categories],
  )

  const openEditIncomeSourceSheet = useCallback(
    (id: string, title: string) => {
      setIncomeSourceSheetMode("edit")
      lastIncomeSourceModeRef.current = "edit"
      setEditingIncomeSourceId(id)
      setIncomeSourceName(title)
      setIncomeSourceError(null)
      const src = incomeSources.find((s) => s.id === id)
      setIncomeSourceIcon(src?.icon ?? null)
    },
    [incomeSources],
  )

  useEffect(() => {
    if (!detailCategoryId && pendingCategoryEdit) {
      openEditCategorySheet(pendingCategoryEdit.id, pendingCategoryEdit.title)
      setPendingCategoryEdit(null)
    }
  }, [detailCategoryId, openEditCategorySheet, pendingCategoryEdit])

  useEffect(() => {
    // no-op
  }, [])

  useEffect(() => {
    if (!detailIncomeSourceId && pendingIncomeSourceEdit) {
      openEditIncomeSourceSheet(pendingIncomeSourceEdit.id, pendingIncomeSourceEdit.title)
      setPendingIncomeSourceEdit(null)
    }
  }, [detailIncomeSourceId, openEditIncomeSourceSheet, pendingIncomeSourceEdit])

  const activeAccountIds = useMemo(() => new Set(accounts.map((account) => account.id)), [accounts])
  const categoryArchivedById = useMemo(() => {
    const archivedById = new Map<string, boolean>()
    categories.forEach((category) => {
      archivedById.set(category.id, Boolean(category.isArchived))
    })
    return archivedById
  }, [categories])
  const incomeSourceArchivedById = useMemo(() => {
    const archivedById = new Map<string, boolean>()
    incomeSources.forEach((incomeSource) => {
      archivedById.set(incomeSource.id, Boolean(incomeSource.isArchived))
    })
    return archivedById
  }, [incomeSources])
  const isTxEditDisabled = useCallback(
    (tx: Transaction) =>
      isTransactionLinkedToArchivedEntity(tx, activeAccountIds, categoryArchivedById, incomeSourceArchivedById),
    [activeAccountIds, categoryArchivedById, incomeSourceArchivedById],
  )

  const openTxActions = useCallback(
    (id: string) => {
      const tx = transactions.find((t) => t.id === id)
      if (!tx) return
      if (isTxEditDisabled(tx)) {
        setDisabledTxHintId((current) => (current === id ? null : id))
        return
      }
      setTxError(null)
      setTxLoading(false)
      setDisabledTxHintId(null)
      setTxActionId(id)
      setTxMode("actions")
      setEditAmount(String(tx.amount.amount))
      setEditDate(tx.date.slice(0, 10) || getTodayLocalDate())
    },
    [isTxEditDisabled, transactions],
  )

  const closeTxSheet = useCallback(() => {
    setTxMode("none")
    setTxActionId(null)
    setTxError(null)
    setTxLoading(false)
    setDisabledTxHintId(null)
  }, [])

  const closeDetails = useCallback(() => {
    setIsGoalCompleteSheetOpen(false)
    setDetailAccountId(null)
    setDetailCategoryId(null)
    setDetailIncomeSourceId(null)
    setDetailGoalId(null)
    setDetailDebtorId(null)
    setDetailTitle("")
    setAccountSearch("")
    setCategorySearch("")
    setIncomeSourceSearch("")
    setGoalSearch("")
    setDebtorSearch("")
    setIsConfirmingDebtorClose(false)
    setAccountPeriodType("month")
    setCustomFrom("")
    setCustomTo("")
    setIsAccountPeriodMenuOpen(false)
    setHasAccountPeriodSelection(false)
    setSearchFocused(false)
    closeTxSheet()
    if (returnToReport) {
      onReturnToReport?.()
    }
    if (returnToIncomeReport) {
      onReturnToIncomeReport?.()
    }
  }, [closeTxSheet, onReturnToIncomeReport, onReturnToReport, returnToIncomeReport, returnToReport])

  const openEditAccountFromDetails = useCallback(
    (accountId: string) => {
      closeDetails()
      queueMicrotask(() => openEditAccountSheet(accountId))
    },
    [closeDetails, openEditAccountSheet],
  )

  const openTransferFromAccountDetails = useCallback(() => {
    closeDetails()
    onOpenQuickAddTransfer?.()
  }, [closeDetails, onOpenQuickAddTransfer])

  const openIncomeFromSourceDetails = useCallback(() => {
    const incomeSourceId = detailIncomeSourceId
    closeDetails()
    onOpenQuickAddIncome?.(incomeSourceId)
  }, [closeDetails, detailIncomeSourceId, onOpenQuickAddIncome])

  const openExpenseFromCategoryDetails = useCallback(() => {
    const categoryId = detailCategoryId
    closeDetails()
    onOpenQuickAddExpense?.(categoryId)
  }, [closeDetails, detailCategoryId, onOpenQuickAddExpense])

  const openEditDebtorFromDetails = useCallback(
    (debtor: Debtor) => {
      closeDetails()
      queueMicrotask(() => {
        setIsGoalsListOpen(false)
        setDebtorSheetMode("edit")
        setEditingDebtorId(debtor.id)
        setDebtorError(null)
        setDebtorName(debtor.name)
        setDebtorIcon(debtor.icon ?? null)
        setDebtorIssuedDate(debtor.issuedDate || getTodayLocalDate())
        setDebtorReturnDate(debtor.dueDate || "")
        setDebtorReturnAmount(debtor.returnAmount > 0 ? String(debtor.returnAmount) : String(debtor.loanAmount || ""))
        setIsDebtorSheetOpen(true)
      })
    },
    [closeDetails],
  )

  const handleDeleteDebtorFromDetails = useCallback(() => {
    return runDebtorDelete(async () => {
      if (!token || !detailDebtorId) return
      setIsConfirmingDebtorClose(false)
      await updateDebtor(token, detailDebtorId, { status: "completed" })
      await refetchDebtors()
      closeDetails()
      setPendingOpenGoalsList(true)
    })
  }, [closeDetails, detailDebtorId, refetchDebtors, runDebtorDelete, token, updateDebtor])

  const handleArchiveGoalFromDetails = useCallback(() => {
    return runGoalComplete(async () => {
      if (!token || !detailGoalId) return
      try {
        setGoalError(null)
        await completeGoal(token, detailGoalId)
        await refetchAccountsSeq()
        await refetchTransactions()
        await refetchGoals()
        setIsGoalCompleteSheetOpen(false)
        closeDetails()
        setPendingOpenGoalsList(true)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return
        }
        const msg = err instanceof Error ? err.message : "Не удалось завершить цель"
        setGoalError(msg)
      }
    })
  }, [
    closeDetails,
    completeGoal,
    detailGoalId,
    refetchAccountsSeq,
    refetchGoals,
    refetchTransactions,
    runGoalComplete,
    token,
  ])

  const handleDeleteTx = useCallback(() => {
    if (txLoading || isDeleteTxRunning) return
    return runDeleteTx(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    if (!token) {
      setTxError("Нет токена")
      return
    }
    if (!txActionId) return
    const txAction = transactions.find((t) => t.id === txActionId)
    const needsGoalsRefresh = Boolean(txAction?.goalId)
    const needsDebtorsRefresh = Boolean(txAction?.debtorId)
    setTxError(null)
    try {
      setTxLoading(true)
      await deleteTransaction(token, txActionId)
      await refetchAccountsSeq()
      await refetchTransactions()
      if (needsGoalsRefresh) {
        await refetchGoals()
      }
      if (needsDebtorsRefresh) {
        await refetchDebtors()
      }
      closeTxSheet()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return
      }
      setTxError(getTransactionErrorMessage(err, "Не удалось удалить операцию"))
    } finally {
      setTxLoading(false)
    }
    })
  }, [closeTxSheet, isDeleteTxRunning, refetchAccountsSeq, refetchDebtors, refetchGoals, refetchTransactions, runDeleteTx, transactions, txActionId, txLoading])

  const buildEditTransactionPayload = useCallback(
    (original: Transaction, amount: number, date: string): { payload?: CreateTransactionBody; error?: string } => {
      const happenedAt = date ? `${date}T00:00:00.000Z` : original.date
      const note = original.comment ?? null

      if (original.type === "transfer") {
        if (original.goalId) {
          const fromAccountId = original.fromAccountId ?? original.accountId
          if (!fromAccountId) {
            return { error: "Не удалось определить счёт источника" }
          }
          return {
            payload: {
              kind: "transfer",
              amount,
              fromAccountId,
              goalId: original.goalId ?? null,
              happenedAt,
              note,
            },
          }
        }

        if (original.debtorId) {
          const toAccountId = original.toAccountId ?? original.accountId
          if (!toAccountId) {
            return { error: "Не удалось определить счёт зачисления" }
          }
          return {
            payload: {
              kind: "transfer",
              amount,
              toAccountId,
              debtorId: original.debtorId ?? null,
              happenedAt,
              note,
            },
          }
        }

        const fromAccountId = original.fromAccountId ?? original.accountId
        if (!fromAccountId || !original.toAccountId || fromAccountId === original.toAccountId) {
          return { error: "Не удалось определить счета перевода" }
        }
        return {
          payload: {
            kind: "transfer",
            amount,
            fromAccountId,
            toAccountId: original.toAccountId,
            happenedAt,
            note,
          },
        }
      }

      if (original.type === "income") {
        if (!original.accountId) {
          return { error: "Не удалось определить счёт" }
        }
        return {
          payload: {
            kind: "income",
            amount,
            accountId: original.accountId,
            incomeSourceId: original.incomeSourceId ?? null,
            happenedAt,
            note,
          },
        }
      }

      if (!original.accountId) {
        return { error: "Не удалось определить счёт" }
      }
      return {
        payload: {
          kind: "expense",
          amount,
          accountId: original.accountId,
          categoryId: original.categoryId ?? null,
          debtorId: original.debtorId ?? null,
          happenedAt,
          note,
        },
      }
    },
    [],
  )

  const handleSaveEdit = useCallback(() => {
    if (txLoading || isEditTxRunning) return
    return runEditTx(async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
      if (!token) {
        setTxError("Нет токена")
        return
      }
      if (!txActionId) return
      const original = transactions.find((t) => t.id === txActionId)
      if (!original) {
        setTxError("Операция не найдена")
        return
      }
      const num = Number(editAmount.replace(",", "."))
      if (!Number.isFinite(num) || num <= 0) {
        setTxError("Некорректная сумма")
        return
      }
      const normalizedAmount = Math.round(num * 100) / 100
      const { payload, error } = buildEditTransactionPayload(original, normalizedAmount, editDate)
      if (!payload) {
        setTxError(error ?? "Не удалось подготовить операцию")
        return
      }

      setTxLoading(true)
      setTxError(null)
      try {
        await deleteTransaction(token, txActionId)
        await createTransaction(token, payload)
        await refetchAccountsSeq()
        await refetchTransactions()
        if (original.goalId) {
          await refetchGoals()
        }
        if (original.debtorId) {
          await refetchDebtors()
        }
        closeTxSheet()
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return
        }
        setTxError(getTransactionErrorMessage(err, "Не удалось сохранить"))
      } finally {
        setTxLoading(false)
      }
    })
  }, [
    buildEditTransactionPayload,
    closeTxSheet,
    editAmount,
    editDate,
    isEditTxRunning,
    refetchAccountsSeq,
    refetchDebtors,
    refetchGoals,
    refetchTransactions,
    runEditTx,
    transactions,
    txActionId,
    txLoading,
  ])

  const handleSaveCategory = useCallback(() => {
    return runCategorySave(async () => {
    if (!token) {
      return
    }
    const trimmed = categoryName.trim()
    if (!trimmed) {
      setCategorySaveError("Введите название категории")
      return
    }
    if (isEntityNameTooLong(trimmed, EXPENSE_CATEGORY_NAME_MAX_LENGTH)) {
      setCategorySaveError("Максимум 12 символов")
      return
    }
    const duplicateCategory = categories.some(
      (category) =>
        category.type === "expense" &&
        !category.isArchived &&
        category.id !== editingCategoryId &&
        normalizeEntityName(category.name) === normalizeEntityName(trimmed),
    )
    if (duplicateCategory) {
      setCategorySaveError("Такое название уже используется")
      return
    }
    const budgetNumber = (() => {
      const raw = categoryBudget.trim()
      if (!raw) return null
      const normalized = raw.replace(",", ".")
      const num = Number(normalized)
      if (!Number.isFinite(num) || num < 0) return null
      return Math.round(num * 100) / 100
    })()
    setCategorySaveError(null)
    setIsSavingCategory(true)
    try {
      if (categorySheetMode === "create") {
        await createCategory(token, { name: trimmed, kind: "expense", icon: categoryIcon ?? null, budget: budgetNumber })
      } else if (categorySheetMode === "edit" && editingCategoryId) {
        const updated = await renameCategory(token, editingCategoryId, trimmed, { icon: categoryIcon ?? null, budget: budgetNumber })
        const mappedCategories = categories.map((c) =>
          c.id === updated.id
            ? {
                id: updated.id,
                name: updated.name,
                type: updated.kind,
                icon: updated.icon,
                budget: updated.budget ?? null,
              }
            : c,
        )
        setCategories(mappedCategories)
      }
      await refetchCategories()
      closeCategorySheet()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return
      }
      const msg = err instanceof Error ? err.message : "Не удалось сохранить. Попробуйте ещё раз."
      console.error("updateCategory failed", err)
      if (msg.includes("CATEGORY_NAME_EXISTS")) {
        setCategorySaveError("Такое название уже используется")
      } else if (msg.includes("CATEGORY_NAME_TOO_LONG")) {
        setCategorySaveError("Максимум 12 символов")
      } else {
        setCategorySaveError(msg)
      }
    } finally {
      setIsSavingCategory(false)
    }
    })
  }, [
    categories,
    categoryBudget,
    categoryIcon,
    categoryName,
    categorySheetMode,
    closeCategorySheet,
    editingCategoryId,
    refetchCategories,
    runCategorySave,
    token,
  ])

  const handleSaveIncomeSource = useCallback(() => {
    return runIncomeSave(async () => {
      if (!token) {
        setIncomeSourceError("Нет токена")
        return
      }
      const trimmed = incomeSourceName.trim()
      if (!trimmed) {
        setIncomeSourceError("Введите название источника")
        return
      }
      if (isEntityNameTooLong(trimmed, INCOME_SOURCE_NAME_MAX_LENGTH)) {
        setIncomeSourceError("Максимум 12 символов")
        return
      }
      const duplicateIncomeSource = incomeSources.some(
        (source) =>
          !source.isArchived &&
          source.id !== editingIncomeSourceId &&
          normalizeEntityName(source.name) === normalizeEntityName(trimmed),
      )
      if (duplicateIncomeSource) {
        setIncomeSourceError("Такое название уже используется")
        return
      }
      setIsSavingIncomeSource(true)
      setIncomeSourceError(null)
      try {
        if (incomeSourceSheetMode === "create") {
          await createIncomeSource(token, trimmed, incomeSourceIcon ?? undefined)
        } else if (incomeSourceSheetMode === "edit" && editingIncomeSourceId) {
          await renameIncomeSource(token, editingIncomeSourceId, trimmed, incomeSourceIcon ?? undefined)
        }
        await refetchIncomeSources()
        closeIncomeSourceSheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка"
        if (msg.includes("INCOME_SOURCE_NAME_EXISTS")) {
          setIncomeSourceError("Такое название уже используется")
        } else if (msg.includes("INCOME_SOURCE_NAME_TOO_LONG")) {
          setIncomeSourceError("Максимум 12 символов")
        } else {
          setIncomeSourceError(msg)
        }
      } finally {
        setIsSavingIncomeSource(false)
      }
    })
  }, [
    closeIncomeSourceSheet,
    incomeSources,
    editingIncomeSourceId,
    incomeSourceName,
    incomeSourceSheetMode,
    incomeSourceIcon,
    refetchIncomeSources,
    runIncomeSave,
    token,
  ])

  const closeGoalsList = useCallback(() => {
    setIsGoalsListOpen(false)
    if (returnToReport) {
      onReturnToReport?.()
    }
    if (returnToIncomeReport) {
      onReturnToIncomeReport?.()
    }
  }, [onReturnToIncomeReport, onReturnToReport, returnToIncomeReport, returnToReport])

  const openGoalOperationFromGoalsList = useCallback(() => {
    closeGoalsList()
    onOpenQuickAddGoal?.()
  }, [closeGoalsList, onOpenQuickAddGoal])

  const openReceivableDebtOperationFromGoalsList = useCallback(() => {
    closeGoalsList()
    onOpenQuickAddDebtReceivable?.()
  }, [closeGoalsList, onOpenQuickAddDebtReceivable])

  const openPayableDebtOperationFromGoalsList = useCallback(() => {
    closeGoalsList()
    onOpenQuickAddDebtPayable?.()
  }, [closeGoalsList, onOpenQuickAddDebtPayable])

  const closeDebtorSheet = useCallback(() => {
    setIsDebtorSheetOpen(false)
    setDebtorSheetMode("create")
    setEditingDebtorId(null)
    setIsDebtorIconPickerOpen(false)
    setDebtorError(null)
    setDebtorName("")
    setDebtorIcon(null)
    setDebtorIssuedDate(getTodayLocalDate())
    setDebtorReturnDate(getTodayLocalDate())
    setDebtorReturnAmount("")
  }, [])

  const openCreateDebtor = useCallback(() => {
    setIsGoalsListOpen(false)
    setDebtorSheetMode("create")
    setEditingDebtorId(null)
    setIsDebtorIconPickerOpen(false)
    setDebtorError(null)
    setDebtorName("")
    setDebtorIcon(null)
    setDebtorIssuedDate(getTodayLocalDate())
    setDebtorReturnDate(getTodayLocalDate())
    setDebtorReturnAmount("")
    setIsDebtorSheetOpen(true)
  }, [])

  const handleSaveDebtor = useCallback(() => {
    return runDebtorSave(async () => {
      if (!token) {
        setDebtorError("Нет токена")
        return
      }
      const trimmedName = debtorName.trim()
      if (!trimmedName) {
        setDebtorError("Введите имя должника")
        return
      }
      if (isEntityNameTooLong(trimmedName, DEBTOR_NAME_MAX_LENGTH)) {
        setDebtorError("Максимум 20 символов")
        return
      }
      const duplicateDebtor = debtors.some(
        (debtor) =>
          debtor.direction === currentDebtorDirection &&
          debtor.status === "active" &&
          debtor.id !== editingDebtorId &&
          normalizeEntityName(debtor.name) === normalizeEntityName(trimmedName),
      )
      if (duplicateDebtor) {
        setDebtorError("Такое название уже используется")
        return
      }
      const returnAmount = Number(debtorReturnAmount.trim().replace(",", "."))
      if (!Number.isFinite(returnAmount) || returnAmount <= 0) {
        setDebtorError("Введите сумму")
        return
      }
      const normalizedReturnAmount = Math.round(returnAmount * 100) / 100
      setDebtorError(null)
      if (debtorSheetMode === "edit" && editingDebtorId) {
        await updateDebtor(token, editingDebtorId, {
          name: trimmedName,
          icon: debtorIcon ?? null,
          issuedAt: debtorIssuedDate || getTodayLocalDate(),
          principalAmount: normalizedReturnAmount,
          dueAt: debtorReturnDate || null,
          payoffAmount: normalizedReturnAmount,
          status: "active",
          direction: currentDebtorDirection,
        })
        setDebtors(
          debtors.map((debtor) =>
            debtor.id === editingDebtorId
              ? {
                  ...debtor,
                  name: trimmedName,
                  icon: debtorIcon ?? null,
                  issuedDate: debtorIssuedDate || getTodayLocalDate(),
                  loanAmount: normalizedReturnAmount,
                  dueDate: debtorReturnDate || "",
                  returnAmount: normalizedReturnAmount,
                  payoffAmount: normalizedReturnAmount,
                  status: "active",
                  direction: currentDebtorDirection,
                }
              : debtor,
          ),
        )
      } else {
        await createDebtor(token, {
          name: trimmedName,
          icon: debtorIcon ?? null,
          issuedAt: debtorIssuedDate || getTodayLocalDate(),
          principalAmount: normalizedReturnAmount,
          dueAt: debtorReturnDate || null,
          payoffAmount: normalizedReturnAmount,
          status: "active",
          direction: currentDebtorDirection,
        })
      }
      await refetchDebtors()
      closeDebtorSheet()
      setIsGoalsListOpen(true)
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : "Не удалось сохранить"
      if (msg.includes("DEBTOR_NAME_EXISTS")) {
        setDebtorError("Такое название уже используется")
      } else if (msg.includes("DEBTOR_NAME_TOO_LONG")) {
        setDebtorError("Максимум 20 символов")
      } else {
        setDebtorError(msg)
      }
    })
  }, [
    closeDebtorSheet,
    debtorIcon,
    debtorIssuedDate,
    debtorName,
    debtorReturnAmount,
    debtorReturnDate,
    debtorSheetMode,
    editingDebtorId,
    currentDebtorDirection,
    debtors,
    refetchDebtors,
    runDebtorSave,
    setDebtors,
    token,
  ])

  const openCreateGoal = useCallback(() => {
    setGoalError(null)
    setGoalName("")
    setGoalTarget("")
    setGoalIcon(null)
    setEditingGoalId(null)
    setGoalSheetMode("create")
    setPendingGoalCreate(true)
    setIsGoalsListOpen(false)
  }, [])

  const handleCreateGoal = useCallback(async () => {
    if (!token) return
    const trimmed = goalName.trim()
    if (!trimmed) {
      setGoalError("Введите название")
      return
    }
    if (isEntityNameTooLong(trimmed, GOAL_NAME_MAX_LENGTH)) {
      setGoalError("Максимум 20 символов")
      return
    }
    const duplicateGoal = goals.some(
      (goal) =>
        goal.status === "active" &&
        goal.id !== editingGoalId &&
        normalizeEntityName(goal.name) === normalizeEntityName(trimmed),
    )
    if (duplicateGoal) {
      setGoalError("Такое название уже используется")
      return
    }
    const targetRaw = goalTarget.trim().replace(",", ".")
    const target = Number(targetRaw)
    if (!Number.isFinite(target) || target <= 0) {
      setGoalError("Введите сумму")
      return
    }
    setIsSavingGoal(true)
    try {
      const currentGoalIcon =
        goalIcon?.trim() ??
        (goalSheetMode === "edit" && editingGoalId ? goals.find((g) => g.id === editingGoalId)?.icon ?? null : null)
      if (goalSheetMode === "create") {
        await createGoal(token, { name: trimmed, icon: currentGoalIcon ?? null, targetAmount: Math.round(target * 100) / 100 })
      } else if (goalSheetMode === "edit" && editingGoalId) {
        await updateGoal(token, editingGoalId, {
          name: trimmed,
          icon: currentGoalIcon ?? null,
          targetAmount: Math.round(target * 100) / 100,
        })
      }
      await refetchGoals()
      setPendingOpenGoalsList(true)
      setIsGoalSheetOpen(false)
      setEditingGoalId(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось создать цель"
      if (msg.includes("GOAL_NAME_EXISTS")) {
        setGoalError("Такое название уже используется")
      } else if (msg.includes("GOAL_NAME_TOO_LONG")) {
        setGoalError("Максимум 20 символов")
      } else {
        setGoalError(msg)
      }
    } finally {
      setIsSavingGoal(false)
    }
  }, [editingGoalId, goalIcon, goalName, goalTarget, goals, refetchGoals, token])

  const handleDeleteCategory = useCallback(
    (id: string) =>
      runCategoryDelete(async () => {
      if (!token) return
      const confirmed = window.confirm("Удалить категорию?")
      if (!confirmed) return
      setDeletingCategoryId(id)
      try {
        await deleteCategory(token, id)
        await refetchCategories()
        closeCategorySheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Не удалось архивировать категорию"
        setCategorySaveError(msg)
      } finally {
        setDeletingCategoryId(null)
      }
      }),
    [closeCategorySheet, refetchCategories, runCategoryDelete, token]
  )

  const handleDeleteIncomeSource = useCallback(
    (id: string) =>
      runIncomeDelete(async () => {
      if (!token) return
      const confirmed = window.confirm("Удалить источник дохода?")
      if (!confirmed) return
      setDeletingIncomeSourceId(id)
      try {
        await deleteIncomeSource(token, id)
        await refetchIncomeSources()
        closeIncomeSourceSheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Не удалось архивировать источник дохода"
        setIncomeSourceError(msg)
      } finally {
        setDeletingIncomeSourceId(null)
      }
      }),
    [closeIncomeSourceSheet, refetchIncomeSources, runIncomeDelete, token]
  )

  const accountItems: CardItem[] = accounts.map((account, idx) => {
    const bg = account.color ?? DEFAULT_ACCOUNT_COLOR
    const txt = getReadableTextColor(bg)
    const reservedInGoals = reservedInActiveGoalsByAccountId.get(account.id) ?? 0
    const factualBalance = account.balance.amount + reservedInGoals
    return {
      id: account.id,
      title: account.name,
      amount: account.balance.amount,
      secondaryAmount: reservedInGoals > 0 ? factualBalance : undefined,
      financeIconKey: isFinanceIconKey(account.icon ?? "") ? (account.icon as string) : null,
      icon: idx % 2 === 0 ? "wallet" : "card",
      color: bg,
      textColor: txt,
      type: "account" as const,
      size: "lg",
    }
  })

  const accountsToRender = accountItems

  const expenseCategories = activeExpenseCategories

const incomeItems: CardItem[] = activeIncomeSources.map((src, idx) => ({
  id: src.id,
  title: src.name,
  amount: incomeBySource.get(src.id) ?? 0,
  financeIconKey: isFinanceIconKey(src.icon ?? "") ? src.icon : null,
  icon: isFinanceIconKey(src.icon ?? "") ? undefined : "arrowDown",
  color: cardColors[(idx + 1) % cardColors.length],
  type: "income-source" as const,
}))
  const incomeToRender = [...incomeItems]

  const expenseItems: CardItem[] = expenseCategories
    .map((cat, idx) => {
      const spent = expenseByCategory.get(cat.id) ?? 0
      const budget = (cat as { budget?: number | null }).budget ?? null
      let tone: CardItem["budgetTone"] = "normal"
      if (budget && budget > 0) {
        const ratio = spent / budget
        if (ratio > 1) tone = "alert"
        else if (ratio > 0.7) tone = "warn"
      }
      return {
        id: cat.id,
        title: cat.name,
        amount: spent,
        financeIconKey: isFinanceIconKey((cat as { icon?: string | null }).icon ?? "")
          ? ((cat as { icon?: string | null }).icon as string)
          : null,
        color: cardColors[(idx + 2) % cardColors.length],
        type: "category" as const,
        size: "md" as const,
        budget,
        budgetTone: tone,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  const uncategorizedExpense = expenseByCategory.get("uncategorized")
  if (uncategorizedExpense) {
    expenseItems.push({
      id: "expense-uncategorized",
      title: "Без категории",
      amount: uncategorizedExpense,
      icon: "⬇️",
      color: "#111827",
      type: "category" as const,
    })
  }

  const computeSize = (amount: number, max: number) => {
    if (max <= 0) return "md" as const
    const ratio = amount / max
    if (ratio >= 0.66) return "lg" as const
    if (ratio >= 0.33) return "md" as const
    return "sm" as const
  }

  const handleSaveAccount = useCallback(() => {
    return runAccountFlight(async () => {
      const tokenLocal = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
      if (!tokenLocal) return
      const trimmedName = name.trim()
      if (!trimmedName) {
        setAccountActionError("Введите название счёта")
        return
      }
      if (isEntityNameTooLong(trimmedName, ACCOUNT_NAME_MAX_LENGTH)) {
        setAccountActionError("Максимум 12 символов")
        return
      }
      const duplicateAccount = accounts.some(
        (account) =>
          account.id !== editingAccountId && normalizeEntityName(account.name) === normalizeEntityName(trimmedName),
      )
      if (duplicateAccount) {
        setAccountActionError("Такое название уже используется")
        return
      }
      const parsed = Number(balance.trim().replace(",", "."))
      if (!Number.isFinite(parsed)) {
        setAccountActionError("Некорректный баланс")
        return
      }
      const balanceNumber = Math.round(parsed * 100) / 100
      try {
        setAccountActionError(null)
        const currentAccount = accounts.find((a) => a.id === editingAccountId)
        const currentBalance = currentAccount?.balance.amount
        const balanceChanged =
          typeof currentBalance === "number" ? Math.round(currentBalance * 100) / 100 !== balanceNumber : false
        const needUpdateAccount =
          editingAccountId &&
          (trimmedName !== currentAccount?.name ||
            accountColor !== (currentAccount as { color?: string })?.color ||
            accountIcon !== (currentAccount as { icon?: string | null })?.icon)

        if (editingAccountId) {
          if (needUpdateAccount) {
            await updateAccount(tokenLocal, editingAccountId, {
              name: trimmedName,
              type: type || "cash",
              currency: baseCurrency,
              color: accountColor,
              icon: accountIcon ?? null,
            })
          }
          if (balanceChanged) {
            await adjustAccountBalance(tokenLocal, editingAccountId, balanceNumber)
          }
        } else {
          await createAccount(tokenLocal, {
            name: trimmedName,
            type: type || "cash",
            currency: baseCurrency,
            balance: balanceNumber,
            color: accountColor,
            icon: accountIcon ?? null,
          })
        }
        await refetchAccountsSeq()
        closeAccountSheet()
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        const msg = err instanceof Error ? err.message : "Не удалось сохранить счёт"
        if (msg.includes("ACCOUNT_NAME_EXISTS")) {
          setAccountActionError("Такое название уже используется")
        } else if (msg.includes("ACCOUNT_NAME_TOO_LONG")) {
          setAccountActionError("Максимум 12 символов")
        } else {
          setAccountActionError(msg)
        }
      }
    })
  }, [
    accounts,
    accountColor,
    accountIcon,
    baseCurrency,
    balance,
    closeAccountSheet,
    editingAccountId,
    name,
    refetchAccountsSeq,
    runAccountFlight,
    type,
  ])

  const maxExpenseAmount = Math.max(0, ...expenseItems.map((i) => i.amount))
  const sizedExpenseItems = expenseItems.map((i) => ({ ...i, size: i.size ?? computeSize(i.amount, maxExpenseAmount) }))

  const expenseToRender = [...sizedExpenseItems]

  const goalsTotals = useMemo(() => {
    const current = activeGoals.reduce((sum, g) => {
      const val = Number(g.currentAmount ?? 0)
      return Number.isFinite(val) ? sum + val : sum
    }, 0)
    const target = activeGoals.reduce((sum, g) => {
      const val = Number(g.targetAmount ?? 0)
      return Number.isFinite(val) ? sum + val : sum
    }, 0)
    const progress = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0
    return { current, target, progress }
  }, [activeGoals])

  const goalsItems: CardItem[] = [
    {
      id: "goals-entry",
      title: "Мои цели",
      amount: monthlyGoalInflow,
      goalCurrent: goalsTotals.current,
      amountTarget: goalsTotals.target,
      progress: goalsTotals.progress,
      icon: "goal",
      color: "#0f172a",
      type: "goal",
      size: "lg",
    },
  ]

  const debtsItems: CardItem[] = [
    {
      id: "debt-bank",
      title: "Мне должны",
      amount: monthlyReceivableRepayment,
      secondaryText: formatMoney(totalActiveReceivableDebt, baseCurrency),
      icon: "bank",
      color: "#ea580c",
    },
    {
      id: "debt-friend",
      title: "Я должен",
      amount: monthlyPayableRepayment,
      secondaryText: formatMoney(totalActivePayableDebt, baseCurrency),
      icon: "repeat",
      color: "#1e293b",
    },
  ]

  const addCard = (suffix: string): CardItem => ({
    id: `add-${suffix}`,
    title: "Добавить",
    amount: 0,
    icon: "plus",
    color: "transparent",
    isAdd: true,
  })

  const summaryBalance = useMemo(
    () =>
      accounts.reduce((sum, acc) => sum + acc.balance.amount, 0) +
      goals.reduce((sum, goal) => sum + (goal.status === "active" ? goal.currentAmount : 0), 0),
    [accounts, goals],
  )
const accountNameById = useMemo(() => {
  const map = new Map<string, string>()
    accounts.forEach((a) => map.set(a.id, a.name))
    transactions.forEach((t) => {
      if (t.accountId && t.accountName && !map.has(t.accountId)) map.set(t.accountId, t.accountName)
      if (t.fromAccountId && t.fromAccountName && !map.has(t.fromAccountId)) map.set(t.fromAccountId, t.fromAccountName)
      if (t.toAccountId && t.toAccountName && !map.has(t.toAccountId)) map.set(t.toAccountId, t.toAccountName)
    })
    return map
}, [accounts, transactions])

const txListContainerStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#fff",
  padding: 12,
  boxShadow: "none",
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
  overflow: "hidden",
  flex: 1,
  minHeight: 0,
}

const txScrollableStyle = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto" as const,
  WebkitOverflowScrolling: "touch" as const,
  paddingRight: 2,
}

const txDateHeaderStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
} as const

const txRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 10px",
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid rgba(226,232,240,0.7)",
  cursor: "pointer",
} as const

const txRowDisabledStyle = {
  opacity: 0.72,
  background: "#f1f5f9",
  border: "1px solid #dbe4ee",
  cursor: "not-allowed",
} as const

const txDisabledHintStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
  boxShadow: "0 4px 10px rgba(15, 23, 42, 0.08)",
  color: "#334155",
  padding: "8px 10px",
  fontSize: 12,
  lineHeight: 1.35,
  position: "fixed",
  zIndex: 80,
} as const
const txDisabledHintViewportPadding = 12
const txDisabledHintGap = 8
const txDisabledHintFallbackHeight = 56

type TxGroup = { dateLabel: string; items: Transaction[] }

function TransactionsPanel({
  groups,
  renderDayTotal,
  renderRow,
  emptyText,
}: {
  groups: TxGroup[]
  renderDayTotal: (items: Transaction[]) => ReactNode
  renderRow: (tx: Transaction, idx: number) => ReactNode
  emptyText: string
}) {
  return (
    <div style={txListContainerStyle}>
      <div style={txScrollableStyle}>
        {groups.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14, padding: "8px 0" }}>{emptyText}</div>
        ) : (
          groups.map((group) => (
            <div key={group.dateLabel} style={{ display: "grid", gap: 6, marginBottom: 6 }}>
              <div style={txDateHeaderStyle}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>{group.dateLabel}</div>
                {renderDayTotal(group.items)}
              </div>
              {group.items.map((tx, idx) => renderRow(tx, idx))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
  const getTxAccountName = useCallback(
    (tx: Transaction) => tx.accountName ?? (tx.accountId ? accountNameById.get(tx.accountId) ?? "Счёт" : "Счёт"),
    [accountNameById],
  )
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])
  const incomeSourceNameById = useMemo(() => {
    const map = new Map<string, string>()
    incomeSources.forEach((s) => map.set(s.id, s.name))
    return map
  }, [incomeSources])
  const goalNameById = useMemo(() => {
    const map = new Map<string, string>()
    goals.forEach((goal) => map.set(goal.id, goal.name))
    return map
  }, [goals])

  const isGoalReturnTx = useCallback(
    (tx: Transaction) => tx.type === "transfer" && Boolean(tx.goalId) && !tx.fromAccountId && Boolean(tx.toAccountId),
    [],
  )

  const getGoalTransferTitle = useCallback(
    (tx: Transaction) => {
      const goalName = tx.goalName ?? (tx.goalId ? goalNameById.get(tx.goalId) : null)
      if (isGoalReturnTx(tx)) {
        return goalName ? `Из цели: ${goalName}` : "Из цели"
      }
      return goalName ? `Цель: ${goalName}` : "Цель"
    },
    [goalNameById, isGoalReturnTx],
  )
  const getGoalTransferSourceLabel = useCallback(
    (tx: Transaction) => {
      const sourceAccountId = tx.fromAccountId ?? tx.accountId
      const sourceAccountName =
        tx.fromAccountName ??
        tx.accountName ??
        (sourceAccountId ? accountNameById.get(sourceAccountId) ?? null : null)
      return sourceAccountName ? `Со счёта ${sourceAccountName}` : "Со счёта"
    },
    [accountNameById],
  )
  const getAccountTransferCounterpartyName = useCallback(
    (tx: Transaction) => {
      if (!detailAccountId || tx.type !== "transfer" || tx.goalId || tx.debtorId) return "Перевод"

      const fromAccountId = tx.fromAccountId ?? tx.accountId
      if (fromAccountId && fromAccountId === detailAccountId) {
        const toName = tx.toAccountName ?? (tx.toAccountId ? accountNameById.get(tx.toAccountId) ?? null : null)
        return toName ?? "Счёт"
      }

      if (tx.toAccountId && tx.toAccountId === detailAccountId) {
        const fromName =
          tx.fromAccountName ??
          tx.accountName ??
          (fromAccountId ? accountNameById.get(fromAccountId) ?? null : null)
        return fromName ?? "Счёт"
      }

      const fallbackName =
        tx.toAccountName ??
        tx.fromAccountName ??
        tx.accountName ??
        (tx.toAccountId ? accountNameById.get(tx.toAccountId) ?? null : null) ??
        (fromAccountId ? accountNameById.get(fromAccountId) ?? null : null)
      return fallbackName ?? "Счёт"
    },
    [accountNameById, detailAccountId],
  )
  const getDebtTxDebtorName = useCallback((tx: Transaction) => tx.debtorName ?? "Должник", [])
  const getDebtTxAccountTitle = useCallback(
    (tx: Transaction) => {
      const debtorName = getDebtTxDebtorName(tx)
      if (tx.type === "transfer" && tx.debtorId) {
        return `Возврат от: ${debtorName}`
      }
      if (isPayableDebtRepaymentTx(tx)) {
        return `Долг: ${debtorName}`
      }
      return null
    },
    [getDebtTxDebtorName],
  )
  const getAccountTxTitle = useCallback(
    (tx: Transaction) => {
      if (tx.type === "income") return incomeSourceNameById.get(tx.incomeSourceId ?? "") ?? "Доход"
      if (tx.debtorId) return getDebtTxAccountTitle(tx) ?? "Долг"
      if (tx.type === "expense") return categoryNameById.get(tx.categoryId ?? "") ?? "Расход"
      if (tx.goalId) return getGoalTransferTitle(tx)
      return getAccountTransferCounterpartyName(tx)
    },
    [categoryNameById, getAccountTransferCounterpartyName, getDebtTxAccountTitle, getGoalTransferTitle, incomeSourceNameById],
  )
  const getDebtTxDebtorLabel = useCallback(
    (tx: Transaction) => {
      if (!tx.debtorId) return null
      if (tx.type === "transfer") {
        const accountName =
          tx.toAccountName ??
          (tx.toAccountId ? accountNameById.get(tx.toAccountId) ?? null : null) ??
          tx.accountName
        return accountName ?? "Счёт"
      }
      const sourceAccountId = tx.accountId || tx.fromAccountId
      const sourceAccountName =
        tx.accountName ??
        tx.fromAccountName ??
        (sourceAccountId ? accountNameById.get(sourceAccountId) ?? null : null)
      if (isPayableDebtRepaymentTx(tx)) {
        return sourceAccountName ?? "Счёт"
      }
      return sourceAccountName ? `Со счёта: ${sourceAccountName}` : "Со счёта"
    },
    [accountNameById, isPayableDebtRepaymentTx],
  )
  const goalStatusById = useMemo(() => {
    const statusById = new Map<string, Goal["status"]>()
    goals.forEach((goal) => {
      statusById.set(goal.id, goal.status)
    })
    return statusById
  }, [goals])
  const debtorStatusById = useMemo(() => {
    const statusById = new Map<string, Debtor["status"]>()
    debtors.forEach((debtor) => {
      statusById.set(debtor.id, debtor.status)
    })
    return statusById
  }, [debtors])
  const isAccountTxDisabledByArchivedGoalOrDebt = useCallback(
    (tx: Transaction) => {
      if (tx.goalId && goalStatusById.get(tx.goalId) === "completed") return true
      if (tx.debtorId && debtorStatusById.get(tx.debtorId) === "completed") return true
      return false
    },
    [debtorStatusById, goalStatusById],
  )
  const isAccountTxEditDisabled = useCallback(
    (tx: Transaction) => isTxEditDisabled(tx) || isAccountTxDisabledByArchivedGoalOrDebt(tx),
    [isAccountTxDisabledByArchivedGoalOrDebt, isTxEditDisabled],
  )
  const openAccountTxActions = useCallback(
    (tx: Transaction) => {
      if (isAccountTxEditDisabled(tx)) {
        setDisabledTxHintId((current) => (current === tx.id ? null : tx.id))
        return
      }
      openTxActions(tx.id)
    },
    [isAccountTxEditDisabled, openTxActions],
  )
  const getTxCreatorLabel = useCallback(
    (tx: Transaction) => {
      if (activeSpaceKey !== "family") return null
      if (!tx.createdByUserId) return null
      const authorName = tx.createdByName?.trim() || "Пользователь"
      const normalized = authorName
        .trim()
        .replace(/\s+/g, " ")
      const parts = normalized.split(" ").filter(Boolean)
      const initials =
        parts.length === 0
          ? "?"
          : parts.length === 1
          ? parts[0].slice(0, 1).toUpperCase()
          : `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase()
      return { initials, name: normalized || "Пользователь" }
    },
    [activeSpaceKey],
  )
  const renderTxArchivedHint = useCallback(
    (tx: Transaction, isDisabled: boolean = isTxEditDisabled(tx)) => {
      if (disabledTxHintId !== tx.id || !isDisabled) return null
      if (!disabledTxHintPosition) return null
      const hint = (
        <div
          ref={disabledTxHintRef}
          data-disabled-tx-hint="true"
          style={{
            ...txDisabledHintStyle,
            top: disabledTxHintPosition.top,
            left: disabledTxHintPosition.left,
            maxWidth: disabledTxHintPosition.maxWidth,
          }}
        >
          {ARCHIVED_TX_EDIT_HELP_TEXT}
        </div>
      )
      if (typeof document === "undefined") return hint
      return createPortal(hint, document.body)
    },
    [disabledTxHintId, disabledTxHintPosition, isTxEditDisabled],
  )

  const updateDisabledTxHintPosition = useCallback(() => {
    if (!disabledTxHintId || typeof document === "undefined" || typeof window === "undefined") return
    const anchor = Array.from(document.querySelectorAll<HTMLElement>("[data-disabled-tx-row-id]")).find(
      (node) => node.dataset.disabledTxRowId === disabledTxHintId,
    )
    if (!anchor) {
      setDisabledTxHintPosition(null)
      return
    }
    const anchorRect = anchor.getBoundingClientRect()
    const sheetViewport = anchor.closest<HTMLElement>("[data-detail-sheet-viewport='true']")
    const sheetRect = sheetViewport?.getBoundingClientRect()
    const boundsLeft = sheetRect?.left ?? 0
    const boundsRight = sheetRect?.right ?? window.innerWidth
    const boundsTop = sheetRect?.top ?? 0
    const boundsBottom = sheetRect?.bottom ?? window.innerHeight
    const hintHeight = disabledTxHintRef.current?.getBoundingClientRect().height ?? txDisabledHintFallbackHeight
    const maxWidth = Math.min(340, boundsRight - boundsLeft - txDisabledHintViewportPadding * 2)
    if (maxWidth <= 0) {
      setDisabledTxHintPosition(null)
      return
    }
    const minLeft = boundsLeft + txDisabledHintViewportPadding
    const maxLeft = Math.max(minLeft, boundsRight - txDisabledHintViewportPadding - maxWidth)
    const left = Math.min(Math.max(anchorRect.left, minLeft), maxLeft)

    let top = anchorRect.top - hintHeight - txDisabledHintGap
    const minTop = boundsTop + txDisabledHintViewportPadding
    const maxTop = Math.max(minTop, boundsBottom - txDisabledHintViewportPadding - hintHeight)
    top = Math.min(Math.max(top, minTop), maxTop)

    setDisabledTxHintPosition((prev) => {
      if (prev && prev.top === top && prev.left === left && prev.maxWidth === maxWidth) {
        return prev
      }
      return { top, left, maxWidth }
    })
  }, [disabledTxHintId])

  useEffect(() => {
    if (!disabledTxHintId) return
    if (!transactions.some((transaction) => transaction.id === disabledTxHintId)) {
      setDisabledTxHintId(null)
      setDisabledTxHintPosition(null)
    }
  }, [disabledTxHintId, transactions])

  useEffect(() => {
    if (!disabledTxHintId) {
      setDisabledTxHintPosition(null)
      return
    }
    updateDisabledTxHintPosition()
  }, [disabledTxHintId, updateDisabledTxHintPosition])

  useEffect(() => {
    if (!disabledTxHintId || typeof window === "undefined") return
    const frameId = window.requestAnimationFrame(updateDisabledTxHintPosition)
    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [disabledTxHintId, updateDisabledTxHintPosition])

  useEffect(() => {
    if (!disabledTxHintId || typeof window === "undefined") return
    const handleViewportChange = () => {
      updateDisabledTxHintPosition()
    }
    window.addEventListener("resize", handleViewportChange)
    window.addEventListener("scroll", handleViewportChange, true)
    return () => {
      window.removeEventListener("resize", handleViewportChange)
      window.removeEventListener("scroll", handleViewportChange, true)
    }
  }, [disabledTxHintId, updateDisabledTxHintPosition])

  useEffect(() => {
    if (!disabledTxHintId || typeof document === "undefined") return

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("[data-disabled-tx-hint='true']")) return
      setDisabledTxHintId(null)
      setDisabledTxHintPosition(null)
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true)
    }
  }, [disabledTxHintId])

  const displayTransactions = useMemo(() => transactions.filter((t) => t.type !== "adjustment"), [transactions])

  const accountTx = useMemo(() => {
    if (!detailAccountId) return []
    return sortTransactionsDesc(
      displayTransactions
      .filter(
        (t) =>
          t.accountId === detailAccountId ||
          t.toAccountId === detailAccountId ||
          (t.type === "transfer" && t.accountId === detailAccountId)
      ),
    )
  }, [detailAccountId, displayTransactions])

  const categoryTx = useMemo(() => {
    if (!detailCategoryId) return []
    return sortTransactionsDesc(displayTransactions.filter((t) => t.type === "expense" && t.categoryId === detailCategoryId))
  }, [detailCategoryId, displayTransactions])

  const incomeSourceTx = useMemo(() => {
    if (!detailIncomeSourceId) return []
    return sortTransactionsDesc(displayTransactions.filter((t) => t.type === "income" && t.incomeSourceId === detailIncomeSourceId))
  }, [detailIncomeSourceId, displayTransactions])

  const accountPeriod = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    if (accountPeriodType === "week") {
      const day = start.getDay()
      const diff = day === 0 ? 6 : day - 1
      start.setDate(start.getDate() - diff)
    } else if (accountPeriodType === "month") {
      start.setDate(1)
    } else if (accountPeriodType === "quarter") {
      start.setDate(1)
      start.setMonth(Math.floor(start.getMonth() / 3) * 3)
    } else if (accountPeriodType === "year") {
      start.setMonth(0, 1)
    } else if (accountPeriodType === "custom") {
      const from = customFrom ? new Date(`${customFrom}T00:00:00.000Z`) : start
      const to = customTo ? new Date(`${customTo}T00:00:00.000Z`) : start
      return {
        start: from,
        end: new Date(to.getTime() + 24 * 60 * 60 * 1000),
        label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(from) +
          " - " +
          new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(to),
      }
    }
    const end = new Date(start)
    if (accountPeriodType === "day") end.setDate(end.getDate() + 1)
    else if (accountPeriodType === "week") end.setDate(end.getDate() + 7)
    else if (accountPeriodType === "month") end.setMonth(end.getMonth() + 1)
    else if (accountPeriodType === "quarter") end.setMonth(end.getMonth() + 3)
    else if (accountPeriodType === "year") end.setFullYear(end.getFullYear() + 1)
    else end.setDate(end.getDate() + 1)
    const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    const endPrev = new Date(end.getTime() - 1)
    return { start, end, label: `${fmt.format(start)} - ${fmt.format(endPrev)}` }
  }, [accountPeriodType, customFrom, customTo])
  const formatAccountCustomDate = useCallback((iso: string) => {
    const [year, month, day] = iso.split("-").map((value) => Number(value))
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return iso
    const parsed = new Date(year, month - 1, day)
    if (Number.isNaN(parsed.getTime())) return iso
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      .format(parsed)
      .replace(/\s*г\.$/u, "")
      .trim()
  }, [])
  const accountCustomFromValue = customFrom || getTodayLocalDate()
  const accountCustomToValue = customTo || getTodayLocalDate()
  const accountCustomFromLabel = useMemo(
    () => formatAccountCustomDate(accountCustomFromValue),
    [accountCustomFromValue, formatAccountCustomDate],
  )
  const accountCustomToLabel = useMemo(
    () => formatAccountCustomDate(accountCustomToValue),
    [accountCustomToValue, formatAccountCustomDate],
  )
  const openAccountCustomDatePicker = useCallback((side: "from" | "to") => {
    const input = side === "from" ? accountCustomFromInputRef.current : accountCustomToInputRef.current
    if (!input) return
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void }
    if (typeof pickerInput.showPicker === "function") {
      try {
        pickerInput.showPicker()
        return
      } catch {
        // Fallback for webviews without showPicker.
      }
    }
    pickerInput.focus()
    pickerInput.click()
  }, [])
  const handleAccountCustomDateChange = useCallback(
    (side: "from" | "to", nextIso: string) => {
      if (!nextIso) return
      if (side === "from") {
        const nextTo = customTo && new Date(`${customTo}T00:00:00`) < new Date(`${nextIso}T00:00:00`) ? nextIso : customTo || nextIso
        setCustomFrom(nextIso)
        setCustomTo(nextTo)
      } else {
        const nextFrom =
          customFrom && new Date(`${customFrom}T00:00:00`) > new Date(`${nextIso}T00:00:00`) ? nextIso : customFrom || nextIso
        setCustomFrom(nextFrom)
        setCustomTo(nextIso)
      }
      setAccountPeriodType("custom")
      setHasAccountPeriodSelection(true)
    },
    [customFrom, customTo],
  )
  const accountPeriodButtonLabel = useMemo(() => {
    if (!hasAccountPeriodSelection) return "Период"
    if (accountPeriodType === "day") return "День"
    if (accountPeriodType === "week") return "Неделя"
    if (accountPeriodType === "month") return "Месяц"
    if (accountPeriodType === "quarter") return "Квартал"
    if (accountPeriodType === "year") return "Год"
    return "Свой"
  }, [accountPeriodType, hasAccountPeriodSelection])
  const closeAccountPeriodMenu = useCallback(() => setIsAccountPeriodMenuOpen(false), [])
  const toggleAccountPeriodMenu = useCallback(() => {
    if (!isAccountPeriodMenuOpen) {
      const buttonWidth = accountPeriodButtonRef.current?.getBoundingClientRect().width
      if (buttonWidth) {
        setAccountPeriodPopoverWidth(buttonWidth)
      }
    }
    setIsAccountPeriodMenuOpen((prev) => !prev)
  }, [isAccountPeriodMenuOpen])
  const selectAccountPeriod = useCallback(
    (period: AccountPeriodType) => {
      if (period === "custom") {
        const today = getTodayLocalDate()
        if (!customFrom) setCustomFrom(today)
        if (!customTo) setCustomTo(today)
      }
      setHasAccountPeriodSelection(true)
      setAccountPeriodType(period)
      setIsAccountPeriodMenuOpen(false)
    },
    [customFrom, customTo],
  )

  const filteredAccountTx = useMemo(() => {
    if (!detailAccountId) return []
    const { start, end } = accountPeriod
    const periodFiltered = accountTx.filter((tx) => {
      const d = new Date(tx.date)
      return d >= start && d < end
    })
    const query = accountSearch.trim().toLowerCase()
    if (!query) return periodFiltered
    return periodFiltered.filter((tx) => {
      const absAmount = Math.abs(tx.amount.amount)
      const amountText = String(absAmount)
      const title = getAccountTxTitle(tx)
      return title.toLowerCase().includes(query) || amountText.includes(query)
    })
  }, [accountPeriod, accountSearch, accountTx, detailAccountId, getAccountTxTitle])

  const filteredCategoryTx = useMemo(() => {
    if (!detailCategoryId) return []
    const { start, end } = accountPeriod
    const periodFiltered = categoryTx.filter((tx) => {
      const d = new Date(tx.date)
      return d >= start && d < end
    })
    const query = categorySearch.trim().toLowerCase()
    if (!query) return periodFiltered
    return periodFiltered.filter((tx) => {
      const absAmount = Math.abs(tx.amount.amount)
      const amountText = String(absAmount)
      const name = getTxAccountName(tx).toLowerCase()
      return name.includes(query) || amountText.includes(query)
    })
  }, [accountPeriod, categorySearch, categoryTx, detailCategoryId, getTxAccountName])

  const groupedAccountTx = useMemo(() => {
    return buildTransactionDaySections(filteredAccountTx).map((section) => ({
      dateLabel: section.dayLabel,
      items: section.items,
    }))
  }, [filteredAccountTx])

  const groupedCategoryTx = useMemo(() => {
    return buildTransactionDaySections(filteredCategoryTx).map((section) => ({
      dateLabel: section.dayLabel,
      items: section.items,
    }))
  }, [filteredCategoryTx])

  const filteredIncomeSourceTx = useMemo(() => {
    if (!detailIncomeSourceId) return []
    const { start, end } = accountPeriod
    const periodFiltered = incomeSourceTx.filter((tx) => {
      const d = new Date(tx.date)
      return d >= start && d < end
    })
    const query = incomeSourceSearch.trim().toLowerCase()
    if (!query) return periodFiltered
    return periodFiltered.filter((tx) => {
      const absAmount = Math.abs(tx.amount.amount)
      const amountText = String(absAmount)
      const name = getTxAccountName(tx).toLowerCase()
      return name.includes(query) || amountText.includes(query)
    })
  }, [accountPeriod, getTxAccountName, incomeSourceSearch, incomeSourceTx, detailIncomeSourceId])

  const groupedIncomeSourceTx = useMemo(() => {
    return buildTransactionDaySections(filteredIncomeSourceTx).map((section) => ({
      dateLabel: section.dayLabel,
      items: section.items,
    }))
  }, [filteredIncomeSourceTx])

  const goalTx = useMemo(() => {
    if (!detailGoalId) return []
    return sortTransactionsDesc(displayTransactions.filter((t) => t.type !== "adjustment" && t.goalId === detailGoalId))
  }, [detailGoalId, displayTransactions])

  const debtorTx = useMemo(() => {
    if (!detailDebtorId) return []
    return sortTransactionsDesc(displayTransactions.filter((tx) => {
      if (tx.type === "adjustment") return false
      return tx.debtorId === detailDebtorId
    }))
  }, [detailDebtorId, displayTransactions])

  const filteredGoalTx = useMemo(() => {
    if (!detailGoalId) return []
    const { start, end } = accountPeriod
    const filtered = goalTx.filter((tx) => {
      const d = new Date(tx.date)
      return d >= start && d < end
    })
    const query = goalSearch.trim().toLowerCase()
    if (!query) return filtered
    return filtered.filter((tx) => {
      const name = getGoalTransferSourceLabel(tx)
      const amountText = String(Math.abs(tx.amount.amount))
      return name.toLowerCase().includes(query) || amountText.includes(query)
    })
  }, [accountPeriod, detailGoalId, getGoalTransferSourceLabel, goalSearch, goalTx])

  const groupedGoalTx = useMemo(() => {
    return buildTransactionDaySections(filteredGoalTx).map((section) => ({
      dateLabel: section.dayLabel,
      items: section.items,
    }))
  }, [filteredGoalTx])

  const filteredDebtorTx = useMemo(() => {
    if (!detailDebtorId) return []
    const { start, end } = accountPeriod
    const filtered = debtorTx.filter((tx) => {
      const d = new Date(tx.date)
      return d >= start && d < end
    })
    const query = debtorSearch.trim().toLowerCase()
    if (!query) return filtered
    return filtered.filter((tx) => {
      const name = getDebtTxDebtorLabel(tx) ?? "Операция"
      const amountText = String(Math.abs(tx.amount.amount))
      return name.toLowerCase().includes(query) || amountText.includes(query)
    })
  }, [accountPeriod, debtorSearch, debtorTx, detailDebtorId, getDebtTxDebtorLabel])

  const groupedDebtorTx = useMemo(() => {
    return buildTransactionDaySections(filteredDebtorTx).map((section) => ({
      dateLabel: section.dayLabel,
      items: section.items,
    }))
  }, [filteredDebtorTx])

  if (overviewError) {
    return (
      <div className="app-shell" style={{ padding: 24, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Ошибка загрузки данных</h1>
        <div style={{ color: "#b91c1c", fontSize: 14 }}>{overviewError}</div>
        {onRetryOverview ? (
          <button
            type="button"
            onClick={() => void onRetryOverview()}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 700,
              width: "fit-content",
            }}
          >
            Повторить
          </button>
        ) : null}
      </div>
    )
  }

  if (showOverviewSkeleton) {
    return (
      <div className="overview">
        <div
          className="overview__header"
          onPointerDownCapture={() => {
            registerDebugTimingsTap()
          }}
        >
          <button
            type="button"
            className="home-header__name-btn"
            onClick={onOpenWorkspaceSwitcher}
            aria-label={`Переключить аккаунт. Текущий: ${workspaceAccountLabel}`}
            disabled={!canOpenWorkspaceSwitcher}
          >
            <span className="home-header__name-icon" aria-hidden="true">
              {workspaceAccountIcon}
            </span>
            <span className="home-header__name-text">{workspaceAccountLabel}</span>
            <span className="home-header__name-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          <div className="overview__month">{monthLabel}</div>
        </div>
        <section className="summary">
          <div className="summary__pill overview-loading__summary" aria-live="polite" aria-busy="true">
            <div className="overview-loading__cell">
              <div className="overview-loading__line overview-loading__line--label" />
              <div className="overview-loading__line overview-loading__line--value" />
            </div>
            <div className="overview-loading__cell">
              <div className="overview-loading__line overview-loading__line--label" />
              <div className="overview-loading__line overview-loading__line--value" />
            </div>
            <div className="overview-loading__cell">
              <div className="overview-loading__line overview-loading__line--label" />
              <div className="overview-loading__line overview-loading__line--value" />
            </div>
          </div>
        </section>
        <section className="overview-loading__sections" aria-hidden="true">
          <div className="overview-loading__section-block" />
          <div className="overview-loading__section-block" />
          <div className="overview-loading__section-block" />
          <div className="overview-loading__section-block" />
        </section>
      </div>
    )
  }

  return (
    <div className="overview">
      <div
        className="overview__header"
        onPointerDownCapture={() => {
          registerDebugTimingsTap()
        }}
      >
        <button
          type="button"
          className="home-header__name-btn"
          onClick={onOpenWorkspaceSwitcher}
          aria-label={`Переключить аккаунт. Текущий: ${workspaceAccountLabel}`}
          disabled={!canOpenWorkspaceSwitcher}
        >
          <span className="home-header__name-icon" aria-hidden="true">
            {workspaceAccountIcon}
          </span>
          <span className="home-header__name-text">{workspaceAccountLabel}</span>
          <span className="home-header__name-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        <div className="overview__month">{monthLabel}</div>
      </div>

      <section className="summary">
        <div className="summary__pill">
          <div className="summary__col">
            <div className="summary__label">РАСХОДЫ</div>
            <div className="summary__value summary__value--negative">{formatMoney(monthlyExpenseSum, baseCurrency)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">БАЛАНС</div>
            <div className="summary__value">{formatMoney(summaryBalance, baseCurrency)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">ДОХОДЫ</div>
            <div className="summary__value summary__value--positive">{formatMoney(monthlyIncomeSum, baseCurrency)}</div>
          </div>
        </div>
      </section>

      <Section
        title="Счета"
        items={[...accountsToRender, addCard("accounts")]}
        rowScroll
        rowClass="overview-accounts-row"
        onAddAccounts={() => {
          setEditingAccountId(null)
          setName("")
          setBalance("0")
          setType("cash")
          setAccountColor(accountColorOptions[0])
          setAccountIcon(null)
          setAccountActionError(null)
          setIsConfirmingDelete(false)
          setIsAccountSheetOpen(true)
        }}
        onAccountClick={(id, title) => {
          setDetailAccountId(id)
          setDetailTitle(title || "Счёт")
        }}
        baseCurrency={baseCurrency}
      />

      <Section
        title="Источники дохода"
        items={[...incomeToRender, addCard("income-source")]}
        rowScroll
        onAddIncomeSource={openCreateIncomeSource}
        onIncomeSourceClick={openIncomeSourceDetails}
        baseCurrency={baseCurrency}
      />

      <Section
        title="Расходы"
        items={[...expenseToRender, addCard("category")]}
        rowScroll
        rowClass="overview-expenses-row"
        onAddCategory={openCreateCategory}
        onCategoryClick={(id, title) => openEditCategory(id, title)}
        baseCurrency={baseCurrency}
      />

      <Section
        title="Цели"
        helpTooltip={{
          ariaLabel: "Подсказка по целям",
          topText: "отложено на цели в этом месяце (включая завершённые).",
          bottomText: "Сумма снизу — накоплено в активных целях сейчас.",
        }}
        items={goalsItems}
        rowScroll
        rowClass="overview-goals-row"
        baseCurrency={baseCurrency}
        onGoalClick={() => {
          if (onOpenGoalsList) {
            onOpenGoalsList()
            return
          }
          setDetailGoalId(null)
          void openGoalsList()
        }}
      />
      <Section
        title="Долги / Кредиты"
        helpTooltip={{
          ariaLabel: "Подсказка по долгам и кредитам",
          topText: "сколько вам вернули или вы погасили в этом месяце.",
          bottomText: "Сумма снизу — сколько сейчас осталось по активным долгам.",
        }}
        items={debtsItems}
        rowScroll
        baseCurrency={baseCurrency}
        onDebtReceivableClick={() => {
          onOpenReceivables?.()
        }}
        onDebtPayableClick={() => {
          onOpenPayables?.()
        }}
      />

      {(detailAccountId || detailCategoryId || detailIncomeSourceId || detailGoalId || detailDebtorId) && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeDetails}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 58,
            padding: "12px",
          }}
        >
          <div
            data-detail-sheet-viewport="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              margin: "0 auto",
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              position: "absolute",
              left: 16,
              right: 16,
              top: 24,
              bottom:
                "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 24px)",
              maxHeight:
                "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
              boxShadow: "none",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                {detailTitle || detailGoal?.name || detailDebtor?.name || "Детали"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {detailAccountId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (detailAccountId) {
                        openEditAccountFromDetails(detailAccountId)
                      }
                    }}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#0f172a",
                      fontWeight: 600,
                    }}
                  >
                    + Редактировать
                  </button>
                ) : detailIncomeSourceId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (detailIncomeSourceId) {
                        setPendingIncomeSourceEdit({ id: detailIncomeSourceId, title: detailTitle || "Источник" })
                        closeDetails()
                      }
                    }}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#0f172a",
                      fontWeight: 600,
                    }}
                  >
                    + Редактировать
                  </button>
                ) : detailCategoryId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (detailCategoryId) {
                        setPendingCategoryEdit({ id: detailCategoryId, title: detailTitle || "Категория" })
                        closeDetails()
                      }
                    }}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#0f172a",
                      fontWeight: 600,
                    }}
                  >
                    + Редактировать
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeDetails}
                  style={{
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    borderRadius: 10,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Закрыть
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {detailAccountId ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <input
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => {
                      if (!accountSearch) setSearchFocused(false)
                    }}
                    placeholder="Поиск по названию или сумме"
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 15,
                      outline: "none",
                      boxShadow: "none",
                      WebkitAppearance: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  />
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative", flexWrap: "nowrap", minWidth: 0 }}>
                  <PeriodPickerTrigger
                    buttonLabel={accountPeriodButtonLabel}
                    isOpen={isAccountPeriodMenuOpen}
                    selectedPeriod={accountPeriodType}
                    buttonRef={accountPeriodButtonRef}
                    popoverWidth={accountPeriodPopoverWidth}
                    onToggle={toggleAccountPeriodMenu}
                    onClose={closeAccountPeriodMenu}
                    onSelect={selectAccountPeriod}
                  />

                  {accountPeriodType === "custom" ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", minWidth: 0, flex: 1, justifyContent: "flex-end" }}>
                      <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("from")}>
                        <button
                          type="button"
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            color: "#0f172a",
                            fontSize: 13,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          {accountCustomFromLabel}
                        </button>
                        <input
                          ref={accountCustomFromInputRef}
                          type="date"
                          value={accountCustomFromValue}
                          onChange={(e) => handleAccountCustomDateChange("from", e.target.value)}
                          style={{
                            position: "absolute",
                            inset: 0,
                            opacity: 0,
                            width: "100%",
                            height: "100%",
                            border: 0,
                            background: "transparent",
                            appearance: "none",
                            WebkitAppearance: "none",
                            zIndex: 1,
                            cursor: "pointer",
                          }}
                        />
                      </div>
                      <span style={{ color: "#64748b", fontSize: 12 }}>—</span>
                      <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("to")}>
                        <button
                          type="button"
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            color: "#0f172a",
                            fontSize: 13,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          {accountCustomToLabel}
                        </button>
                        <input
                          ref={accountCustomToInputRef}
                          type="date"
                          value={accountCustomToValue}
                          onChange={(e) => handleAccountCustomDateChange("to", e.target.value)}
                          style={{
                            position: "absolute",
                            inset: 0,
                            opacity: 0,
                            width: "100%",
                            height: "100%",
                            border: 0,
                            background: "transparent",
                            appearance: "none",
                            WebkitAppearance: "none",
                            zIndex: 1,
                            cursor: "pointer",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "#6b7280",
                        minWidth: 0,
                        flex: 1,
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "clip",
                      }}
                    >
                      {accountPeriod.label}
                    </div>
                  )}
                </div>

                <TransactionsPanel
                  groups={groupedAccountTx}
                  emptyText="Нет операций за период"
                  renderDayTotal={(items) => {
                    const dayExpense = items
                      .filter((tx) => tx.type === "expense")
                      .reduce((sum, tx) => sum + tx.amount.amount, 0)
                    return dayExpense > 0 ? (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{formatMoney(dayExpense, baseCurrency)}</div>
                    ) : null
                  }}
                  renderRow={(tx, idx) => {
                    const isDebtIncome = Boolean(tx.debtorId && tx.type === "transfer")
                    const isIncome = tx.type === "income" || isDebtIncome
                    const isExpense = tx.type === "expense"
                    const sign = isIncome ? "+" : isExpense ? "-" : ""
                    const color = isIncome ? "#16a34a" : isExpense ? "#b91c1c" : "#0f172a"
                    const amountText = `${sign}${formatMoney(tx.amount.amount, baseCurrency)}`
                    const creatorLabel = getTxCreatorLabel(tx)
                    const isTxDisabled = isAccountTxEditDisabled(tx)
                    const txTitle = getAccountTxTitle(tx)
                    return (
                      <div key={tx.id} style={{ display: "grid", gap: 6, marginTop: idx === 0 ? 0 : 6 }}>
                        <div
                          data-disabled-tx-row-id={tx.id}
                          style={{ ...txRowStyle, ...(isTxDisabled ? txRowDisabledStyle : null) }}
                          onClick={() => openAccountTxActions(tx)}
                        >
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontWeight: 500, color: "#0f172a", fontSize: 14.5 }}>{txTitle}</div>
                            {creatorLabel ? (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#64748b" }}>
                                <span
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: "50%",
                                    background: "#e2e8f0",
                                    color: "#475569",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    flex: "0 0 auto",
                                  }}
                                >
                                  {creatorLabel.initials}
                                </span>
                                <span>{creatorLabel.name}</span>
                              </div>
                            ) : null}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontWeight: 600, color, textAlign: "right", fontSize: 13.5 }}>{amountText}</div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openAccountTxActions(tx)
                              }}
                              style={{
                                padding: "4px 6px",
                                border: "none",
                                background: "transparent",
                                cursor: isTxDisabled ? "not-allowed" : "pointer",
                                fontSize: 16,
                                lineHeight: 1,
                              }}
                            >
                              ✎
                            </button>
                          </div>
                        </div>
                        {renderTxArchivedHint(tx, isTxDisabled)}
                      </div>
                    )
                  }}
                />
              </div>
              ) : detailCategoryId ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
                  <input
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Поиск по операциям"
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 15,
                      outline: "none",
                      boxShadow: "none",
                      WebkitAppearance: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "nowrap", minWidth: 0 }}>
                    <PeriodPickerTrigger
                      buttonLabel={accountPeriodButtonLabel}
                      isOpen={isAccountPeriodMenuOpen}
                      selectedPeriod={accountPeriodType}
                      buttonRef={accountPeriodButtonRef}
                      popoverWidth={accountPeriodPopoverWidth}
                      onToggle={toggleAccountPeriodMenu}
                      onClose={closeAccountPeriodMenu}
                      onSelect={selectAccountPeriod}
                    />

                    {accountPeriodType === "custom" ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", minWidth: 0, flex: 1, justifyContent: "flex-end" }}>
                        <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("from")}>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            {accountCustomFromLabel}
                          </button>
                          <input
                            ref={accountCustomFromInputRef}
                            type="date"
                            value={accountCustomFromValue}
                            onChange={(e) => handleAccountCustomDateChange("from", e.target.value)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              border: 0,
                              background: "transparent",
                              appearance: "none",
                              WebkitAppearance: "none",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                        <span style={{ color: "#6b7280", fontWeight: 600, flex: "0 0 auto" }}>—</span>
                        <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("to")}>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            {accountCustomToLabel}
                          </button>
                          <input
                            ref={accountCustomToInputRef}
                            type="date"
                            value={accountCustomToValue}
                            onChange={(e) => handleAccountCustomDateChange("to", e.target.value)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              border: 0,
                              background: "transparent",
                              appearance: "none",
                              WebkitAppearance: "none",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "#6b7280",
                          maxWidth: "100%",
                          flex: 1,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "clip",
                        }}
                      >
                        {accountPeriod.label}
                      </div>
                    )}
                  </div>

                  <TransactionsPanel
                    groups={groupedCategoryTx}
                    emptyText="Нет операций"
                    renderDayTotal={(items) => (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        {formatMoney(items.reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0), baseCurrency)}
                      </div>
                    )}
                    renderRow={(tx, idx) => {
                      const displayAccountName = getTxAccountName(tx)
                      const amountText = `-${formatMoney(tx.amount.amount, baseCurrency)}`
                      const amountColor = "#b91c1c"
                      const creatorLabel = getTxCreatorLabel(tx)
                      const isTxDisabled = isTxEditDisabled(tx)
                      return (
                        <div key={tx.id} style={{ display: "grid", gap: 6, marginTop: idx === 0 ? 0 : 6 }}>
                          <div
                            data-disabled-tx-row-id={tx.id}
                            style={{ ...txRowStyle, ...(isTxDisabled ? txRowDisabledStyle : null) }}
                            onClick={() => openTxActions(tx.id)}
                          >
                            <div style={{ display: "grid", gap: 2 }}>
                              <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 15 }}>{displayAccountName}</div>
                              {creatorLabel ? (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#64748b" }}>
                                  <span
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: "50%",
                                      background: "#e2e8f0",
                                      color: "#475569",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 10,
                                      fontWeight: 700,
                                      lineHeight: 1,
                                      flex: "0 0 auto",
                                    }}
                                  >
                                    {creatorLabel.initials}
                                  </span>
                                  <span>{creatorLabel.name}</span>
                                </div>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontWeight: 600, color: amountColor, fontSize: 14 }}>{amountText}</div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openTxActions(tx.id)
                                }}
                                style={{
                                  padding: "4px 6px",
                                  border: "none",
                                  background: "transparent",
                                  cursor: isTxDisabled ? "not-allowed" : "pointer",
                                  fontSize: 16,
                                  lineHeight: 1,
                                }}
                              >
                                ✎
                              </button>
                            </div>
                          </div>
                          {renderTxArchivedHint(tx)}
                        </div>
                      )
                    }}
                  />
                    <button
                      type="button"
                      onClick={openExpenseFromCategoryDetails}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#0f172a",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        alignSelf: "center",
                        width: "100%",
                        maxWidth: 260,
                        marginTop: 2,
                      }}
                    >
                      Добавить операцию
                    </button>
                  </div>
              ) : detailIncomeSourceId ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
                  <input
                    value={incomeSourceSearch}
                    onChange={(e) => setIncomeSourceSearch(e.target.value)}
                    placeholder="Поиск по операциям"
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 15,
                      outline: "none",
                      boxShadow: "none",
                      WebkitAppearance: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "nowrap", minWidth: 0 }}>
                    <PeriodPickerTrigger
                      buttonLabel={accountPeriodButtonLabel}
                      isOpen={isAccountPeriodMenuOpen}
                      selectedPeriod={accountPeriodType}
                      buttonRef={accountPeriodButtonRef}
                      popoverWidth={accountPeriodPopoverWidth}
                      onToggle={toggleAccountPeriodMenu}
                      onClose={closeAccountPeriodMenu}
                      onSelect={selectAccountPeriod}
                    />

                    {accountPeriodType === "custom" ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", minWidth: 0, flex: 1, justifyContent: "flex-end" }}>
                        <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("from")}>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            {accountCustomFromLabel}
                          </button>
                          <input
                            ref={accountCustomFromInputRef}
                            type="date"
                            value={accountCustomFromValue}
                            onChange={(e) => handleAccountCustomDateChange("from", e.target.value)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              border: 0,
                              background: "transparent",
                              appearance: "none",
                              WebkitAppearance: "none",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                        <span style={{ color: "#6b7280", fontWeight: 600, flex: "0 0 auto" }}>—</span>
                        <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("to")}>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            {accountCustomToLabel}
                          </button>
                          <input
                            ref={accountCustomToInputRef}
                            type="date"
                            value={accountCustomToValue}
                            onChange={(e) => handleAccountCustomDateChange("to", e.target.value)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              border: 0,
                              background: "transparent",
                              appearance: "none",
                              WebkitAppearance: "none",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "#6b7280",
                          maxWidth: "100%",
                          flex: 1,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "clip",
                        }}
                      >
                        {accountPeriod.label}
                      </div>
                    )}
                  </div>

                  <TransactionsPanel
                    groups={groupedIncomeSourceTx}
                    emptyText="Нет операций"
                    renderDayTotal={(items) => (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        {formatMoney(items.reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0), baseCurrency)}
                      </div>
                    )}
                    renderRow={(tx, idx) => {
                      const displayAccountName = getTxAccountName(tx)
                      const isIncomeEntry = tx.type === "income"
                      const amountText = `${isIncomeEntry ? "+" : ""}${formatMoney(tx.amount.amount, baseCurrency)}`
                      const amountColor = isIncomeEntry ? "#16a34a" : "#0f172a"
                      const creatorLabel = getTxCreatorLabel(tx)
                      const isTxDisabled = isTxEditDisabled(tx)
                      return (
                        <div key={tx.id} style={{ display: "grid", gap: 6, marginTop: idx === 0 ? 0 : 6 }}>
                          <div
                            data-disabled-tx-row-id={tx.id}
                            style={{ ...txRowStyle, ...(isTxDisabled ? txRowDisabledStyle : null) }}
                            onClick={() => openTxActions(tx.id)}
                          >
                            <div style={{ display: "grid", gap: 2 }}>
                              <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 15 }}>{displayAccountName}</div>
                              {creatorLabel ? (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#64748b" }}>
                                  <span
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: "50%",
                                      background: "#e2e8f0",
                                      color: "#475569",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 10,
                                      fontWeight: 700,
                                      lineHeight: 1,
                                      flex: "0 0 auto",
                                    }}
                                  >
                                    {creatorLabel.initials}
                                  </span>
                                  <span>{creatorLabel.name}</span>
                                </div>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontWeight: 600, color: amountColor, fontSize: 14 }}>{amountText}</div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openTxActions(tx.id)
                                }}
                                style={{
                                  padding: "4px 6px",
                                  border: "none",
                                  background: "transparent",
                                  cursor: isTxDisabled ? "not-allowed" : "pointer",
                                  fontSize: 16,
                                  lineHeight: 1,
                                }}
                              >
                                ✎
                              </button>
                            </div>
                          </div>
                          {renderTxArchivedHint(tx)}
                        </div>
                      )
                    }}
                  />

                  <button
                    type="button"
                    onClick={openIncomeFromSourceDetails}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#0f172a",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      alignSelf: "center",
                      width: "100%",
                      maxWidth: 260,
                      marginTop: 2,
                    }}
                  >
                    Добавить операцию
                  </button>
                </div>
              ) : detailDebtor ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
                  <input
                    value={debtorSearch}
                    onChange={(e) => setDebtorSearch(e.target.value)}
                    placeholder="Поиск по операциям"
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 15,
                      outline: "none",
                      boxShadow: "none",
                      WebkitAppearance: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "nowrap", minWidth: 0 }}>
                    <PeriodPickerTrigger
                      buttonLabel={accountPeriodButtonLabel}
                      isOpen={isAccountPeriodMenuOpen}
                      selectedPeriod={accountPeriodType}
                      buttonRef={accountPeriodButtonRef}
                      popoverWidth={accountPeriodPopoverWidth}
                      onToggle={toggleAccountPeriodMenu}
                      onClose={closeAccountPeriodMenu}
                      onSelect={selectAccountPeriod}
                    />

                    {accountPeriodType === "custom" ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", minWidth: 0, flex: 1, justifyContent: "flex-end" }}>
                        <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("from")}>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            {accountCustomFromLabel}
                          </button>
                          <input
                            ref={accountCustomFromInputRef}
                            type="date"
                            value={accountCustomFromValue}
                            onChange={(e) => handleAccountCustomDateChange("from", e.target.value)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              border: 0,
                              background: "transparent",
                              appearance: "none",
                              WebkitAppearance: "none",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                        <span style={{ color: "#6b7280", fontWeight: 600, flex: "0 0 auto" }}>—</span>
                        <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("to")}>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            {accountCustomToLabel}
                          </button>
                          <input
                            ref={accountCustomToInputRef}
                            type="date"
                            value={accountCustomToValue}
                            onChange={(e) => handleAccountCustomDateChange("to", e.target.value)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              border: 0,
                              background: "transparent",
                              appearance: "none",
                              WebkitAppearance: "none",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "#6b7280",
                          maxWidth: "100%",
                          flex: 1,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "clip",
                        }}
                      >
                        {accountPeriod.label}
                      </div>
                    )}
                  </div>

                  <TransactionsPanel
                    groups={groupedDebtorTx}
                    emptyText="Нет операций"
                    renderDayTotal={(items) => (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        {formatMoney(items.reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0), baseCurrency)}
                      </div>
                    )}
                    renderRow={(tx, idx) => {
                      const displayName = getDebtTxDebtorLabel(tx) ?? "Операция"
                      const isDebtIncoming = tx.type === "transfer" && Boolean(tx.debtorId)
                      const isDebtOutgoing = tx.type === "expense" || isPayableDebtRepaymentTx(tx)
                      const amountSign = isDebtIncoming ? "+" : isDebtOutgoing ? "-" : ""
                      const amountColor = isDebtIncoming ? "#16a34a" : isDebtOutgoing ? "#b91c1c" : "#0f172a"
                      const amountText = `${amountSign}${formatMoney(tx.amount.amount, baseCurrency)}`
                      const creatorLabel = getTxCreatorLabel(tx)
                      const isTxDisabled = isTxEditDisabled(tx)
                      return (
                        <div key={tx.id} style={{ display: "grid", gap: 6, marginTop: idx === 0 ? 0 : 6 }}>
                          <div
                            data-disabled-tx-row-id={tx.id}
                            style={{ ...txRowStyle, ...(isTxDisabled ? txRowDisabledStyle : null) }}
                            onClick={() => openTxActions(tx.id)}
                          >
                            <div style={{ display: "grid", gap: 2 }}>
                              <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 15 }}>{displayName}</div>
                              {creatorLabel ? (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#64748b" }}>
                                  <span
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: "50%",
                                      background: "#e2e8f0",
                                      color: "#475569",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 10,
                                      fontWeight: 700,
                                      lineHeight: 1,
                                      flex: "0 0 auto",
                                    }}
                                  >
                                    {creatorLabel.initials}
                                  </span>
                                  <span>{creatorLabel.name}</span>
                                </div>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontWeight: 600, color: amountColor, fontSize: 14 }}>{amountText}</div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openTxActions(tx.id)
                                }}
                                style={{
                                  padding: "4px 6px",
                                  border: "none",
                                  background: "transparent",
                                  cursor: isTxDisabled ? "not-allowed" : "pointer",
                                  fontSize: 16,
                                  lineHeight: 1,
                                }}
                              >
                                ✎
                              </button>
                            </div>
                          </div>
                          {renderTxArchivedHint(tx)}
                        </div>
                      )
                    }}
                  />

                  <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => openEditDebtorFromDetails(detailDebtor)}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        color: "#0f172a",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Редактировать
                    </button>
                    {isConfirmingDebtorClose ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontSize: 14, color: "#0f172a", opacity: 0.75 }}>
                          Этот долг будет перемещён в архив и перестанет отображаться в актуальном списке.
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => setIsConfirmingDebtorClose(false)}
                            disabled={isDebtorDeleteRunning}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontWeight: 600,
                              cursor: isDebtorDeleteRunning ? "not-allowed" : "pointer",
                            }}
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            disabled={isDebtorDeleteRunning}
                            onClick={() => void handleDeleteDebtorFromDetails()}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #0f172a",
                              background: isDebtorDeleteRunning ? "#e5e7eb" : "#0f172a",
                              color: isDebtorDeleteRunning ? "#6b7280" : "#fff",
                              fontWeight: 700,
                              cursor: isDebtorDeleteRunning ? "not-allowed" : "pointer",
                            }}
                          >
                            {isDebtorDeleteRunning ? "Закрываем…" : "Закрыть долг"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isDebtorDeleteRunning}
                        onClick={() => setIsConfirmingDebtorClose(true)}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          border: "1px solid #0f172a",
                          background: isDebtorDeleteRunning ? "#e5e7eb" : "#0f172a",
                          color: isDebtorDeleteRunning ? "#6b7280" : "#fff",
                          fontWeight: 700,
                          cursor: isDebtorDeleteRunning ? "not-allowed" : "pointer",
                        }}
                      >
                        {isDebtorDeleteRunning ? "Закрываем…" : "Закрыть долг"}
                      </button>
                    )}
                  </div>
                </div>
              ) : detailGoal ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
                  <input
                    value={goalSearch}
                    onChange={(e) => setGoalSearch(e.target.value)}
                    placeholder="Поиск по операциям"
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 15,
                      outline: "none",
                      boxShadow: "none",
                      WebkitAppearance: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "nowrap", minWidth: 0 }}>
                    <PeriodPickerTrigger
                      buttonLabel={accountPeriodButtonLabel}
                      isOpen={isAccountPeriodMenuOpen}
                      selectedPeriod={accountPeriodType}
                      buttonRef={accountPeriodButtonRef}
                      popoverWidth={accountPeriodPopoverWidth}
                      onToggle={toggleAccountPeriodMenu}
                      onClose={closeAccountPeriodMenu}
                      onSelect={selectAccountPeriod}
                    />

                    {accountPeriodType === "custom" ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", minWidth: 0, flex: 1, justifyContent: "flex-end" }}>
                        <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("from")}>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            {accountCustomFromLabel}
                          </button>
                          <input
                            ref={accountCustomFromInputRef}
                            type="date"
                            value={accountCustomFromValue}
                            onChange={(e) => handleAccountCustomDateChange("from", e.target.value)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              border: 0,
                              background: "transparent",
                              appearance: "none",
                              WebkitAppearance: "none",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                        <span style={{ color: "#6b7280", fontWeight: 600, flex: "0 0 auto" }}>—</span>
                        <div style={{ position: "relative", flex: "0 1 160px", minWidth: 0 }} onClick={() => openAccountCustomDatePicker("to")}>
                          <button
                            type="button"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            {accountCustomToLabel}
                          </button>
                          <input
                            ref={accountCustomToInputRef}
                            type="date"
                            value={accountCustomToValue}
                            onChange={(e) => handleAccountCustomDateChange("to", e.target.value)}
                            style={{
                              position: "absolute",
                              inset: 0,
                              opacity: 0,
                              width: "100%",
                              height: "100%",
                              border: 0,
                              background: "transparent",
                              appearance: "none",
                              WebkitAppearance: "none",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "#6b7280",
                          maxWidth: "100%",
                          flex: 1,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "clip",
                        }}
                      >
                        {accountPeriod.label}
                      </div>
                    )}
                  </div>

                  <TransactionsPanel
                    groups={groupedGoalTx}
                    emptyText="Нет операций"
                    renderDayTotal={(items) => (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        {formatMoney(items.reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0), baseCurrency)}
                      </div>
                    )}
                    renderRow={(tx, idx) => {
                      const displayName = tx.accountName ?? "Операция"
                      const amountText = `${formatMoney(tx.amount.amount, baseCurrency)}`
                      const creatorLabel = getTxCreatorLabel(tx)
                      const isTxDisabled = isTxEditDisabled(tx)
                      return (
                        <div key={tx.id} style={{ display: "grid", gap: 6, marginTop: idx === 0 ? 0 : 6 }}>
                          <div
                            data-disabled-tx-row-id={tx.id}
                            style={{ ...txRowStyle, ...(isTxDisabled ? txRowDisabledStyle : null) }}
                            onClick={() => openTxActions(tx.id)}
                          >
                            <div style={{ display: "grid", gap: 2 }}>
                              <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 15 }}>{displayName}</div>
                              {creatorLabel ? (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#64748b" }}>
                                  <span
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: "50%",
                                      background: "#e2e8f0",
                                      color: "#475569",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 10,
                                      fontWeight: 700,
                                      lineHeight: 1,
                                      flex: "0 0 auto",
                                    }}
                                  >
                                    {creatorLabel.initials}
                                  </span>
                                  <span>{creatorLabel.name}</span>
                                </div>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 14 }}>{amountText}</div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openTxActions(tx.id)
                                }}
                                style={{
                                  padding: "4px 6px",
                                  border: "none",
                                  background: "transparent",
                                  cursor: isTxDisabled ? "not-allowed" : "pointer",
                                  fontSize: 16,
                                  lineHeight: 1,
                                }}
                              >
                                ✎
                              </button>
                            </div>
                          </div>
                          {renderTxArchivedHint(tx)}
                        </div>
                      )
                    }}
                  />

                  <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (detailGoalId) {
                          setPendingGoalCreate(false)
                          setPendingOpenGoalsList(false)
                          setIsGoalSheetOpen(false)
                          closeDetails()
                          setPendingGoalEdit({ id: detailGoalId, title: detailGoal.name })
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        color: "#0f172a",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Редактировать
                    </button>
                    {isGoalCompleteSheetOpen ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontSize: 14, color: "#0f172a", opacity: 0.75 }}>
                          Цель будет перемещена в архив. Накопления вернутся на исходный счет.
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => setIsGoalCompleteSheetOpen(false)}
                            disabled={isGoalCompleteRunning}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontWeight: 600,
                              cursor: isGoalCompleteRunning ? "not-allowed" : "pointer",
                            }}
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            disabled={isGoalCompleteRunning}
                            onClick={() => void handleArchiveGoalFromDetails()}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #0f172a",
                              background: isGoalCompleteRunning ? "#e5e7eb" : "#0f172a",
                              color: isGoalCompleteRunning ? "#6b7280" : "#fff",
                              fontWeight: 700,
                              cursor: isGoalCompleteRunning ? "not-allowed" : "pointer",
                            }}
                          >
                            {isGoalCompleteRunning ? "Закрываем…" : "Закрыть цель"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsGoalCompleteSheetOpen(true)
                        }}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          border: "1px solid #0f172a",
                          background: "#0f172a",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Закрыть цель
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
                </div>
            {detailAccountId && (!searchFocused && !accountSearch) && (
              <button
                type="button"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 700,
                  marginTop: 12,
                  marginBottom: 12,
                }}
                onClick={openTransferFromAccountDetails}
              >
                Добавить операцию
              </button>
            )}
          </div>
        </div>
      )}

      {isDebtsMode && isDebtorSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            closeDebtorSheet()
            setIsGoalsListOpen(true)
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 59,
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
            paddingLeft: 16,
            paddingRight: 16,
            paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              width: "100%",
              margin: "0 auto",
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              boxShadow: "none",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              maxHeight:
                "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - env(safe-area-inset-top, 0px) - 40px)",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{debtFormTitle}</div>
              <button
                type="button"
                onClick={() => {
                  closeDebtorSheet()
                  setIsGoalsListOpen(true)
                }}
                style={{
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Отмена
              </button>
            </div>

            {debtorError && !hasDebtorAmountRequiredError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{debtorError}</div> : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Имя должника</span>
              <input
                value={debtorName}
                onChange={(e) => setDebtorName(e.target.value)}
                placeholder="Например, Иван Петров"
                maxLength={DEBTOR_NAME_MAX_LENGTH}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: hasDebtorDuplicateNameError ? "1px solid #ef4444" : "1px solid #e5e7eb",
                  fontSize: 16,
                  outline: "none",
                  boxShadow: "none",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Дата выдачи</span>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 16,
                    background: "#fff",
                    color: "#0f172a",
                    textAlign: "left",
                  }}
                >
                  {debtorIssuedDateLabel}
                </div>
                <input
                  type="date"
                  value={debtorIssuedDate}
                  onChange={(e) => setDebtorIssuedDate(e.target.value)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0,
                    width: "100%",
                    height: "100%",
                    border: 0,
                    background: "transparent",
                    appearance: "none",
                    WebkitAppearance: "none",
                    zIndex: 1,
                    cursor: "pointer",
                  }}
                />
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Дата возврата</span>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 16,
                    background: "#fff",
                    color: "#0f172a",
                    textAlign: "left",
                  }}
                >
                  {debtorReturnDateLabel}
                </div>
                <input
                  type="date"
                  value={debtorReturnDate}
                  onChange={(e) => setDebtorReturnDate(e.target.value)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0,
                    width: "100%",
                    height: "100%",
                    border: 0,
                    background: "transparent",
                    appearance: "none",
                    WebkitAppearance: "none",
                    zIndex: 1,
                    cursor: "pointer",
                  }}
                />
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Сумма к возврату</span>
              <input
                value={debtorReturnAmount}
                onChange={(e) => {
                  const nextValue = e.target.value
                  setDebtorReturnAmount(nextValue)
                  if (!hasDebtorAmountRequiredError) return
                  const parsedAmount = Number(nextValue.trim().replace(",", "."))
                  if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
                    setDebtorError(null)
                  }
                }}
                placeholder="0"
                inputMode="decimal"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: hasDebtorAmountRequiredError ? "1px solid #ef4444" : "1px solid #e5e7eb",
                  fontSize: 15,
                  outline: "none",
                  boxShadow: "none",
                }}
              />
              {hasDebtorAmountRequiredError ? <div style={{ color: "#b91c1c", fontSize: 12 }}>Введите сумму</div> : null}
            </label>

            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Иконка</span>
              <button
                type="button"
                onClick={() => setIsDebtorIconPickerOpen(true)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  color: "#0f172a",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {debtorIcon && isFinanceIconKey(debtorIcon) ? <FinanceIcon iconKey={debtorIcon} size="md" /> : null}
                  <span style={{ fontSize: 15 }}>{debtorIcon && isFinanceIconKey(debtorIcon) ? debtorIcon : "Не выбрано"}</span>
                </span>
                <span style={{ fontSize: 16, color: "#9ca3af" }}>▾</span>
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  closeDebtorSheet()
                  setIsGoalsListOpen(true)
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#0f172a",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isDebtorSaveRunning}
                onClick={() => void handleSaveDebtor()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: isDebtorSaveRunning ? "#e5e7eb" : "#0f172a",
                  color: isDebtorSaveRunning ? "#6b7280" : "#fff",
                  fontWeight: 700,
                  cursor: isDebtorSaveRunning ? "not-allowed" : "pointer",
                }}
              >
                {isDebtorSaveRunning ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDebtsMode && isDebtorIconPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 60,
            padding: "0 12px 12px",
          }}
          onClick={() => setIsDebtorIconPickerOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              margin: "0 auto",
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              boxShadow: "none",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>Выбор иконки</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
                gap: 10,
              }}
            >
              {debtorIconKeys.length === 0 ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Нет иконок</div>
              ) : (
                debtorIconKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setDebtorIcon(key)
                      setIsDebtorIconPickerOpen(false)
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: debtorIcon === key ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: "#fff",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    {isFinanceIconKey(key) ? <FinanceIcon iconKey={key} size="lg" /> : null}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsDebtorIconPickerOpen(false)}
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Назад
            </button>
          </div>
        </div>
      ) : null}

      {isGoalsMode && isGoalSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setIsGoalSheetOpen(false)
            setGoalError(null)
            setPendingOpenGoalsList(true)
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 59,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              width: "100%",
              margin: "0 auto",
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              boxShadow: "none",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                {isDebtsMode ? debtFormTitle : "Создать цель"}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingOpenGoalsList(true)
                  setIsGoalSheetOpen(false)
                }}
                style={{
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Отмена
              </button>
            </div>

            {goalError && (!isDebtsMode || !hasGoalAmountRequiredError) ? (
              <div style={{ color: "#b91c1c", fontSize: 13 }}>{goalError}</div>
            ) : null}

            {isDebtsMode ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "#475569" }}>Дата выдачи</span>
                <input
                  type="date"
                  value={debtorIssuedDate}
                  onChange={(e) => setDebtorIssuedDate(e.target.value)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 16,
                    outline: "none",
                    boxShadow: "none",
                  }}
                />
              </label>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Название</span>
              <input
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder="Например, Путешествие"
                maxLength={GOAL_NAME_MAX_LENGTH}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: hasGoalDuplicateNameError ? "1px solid #ef4444" : "1px solid #e5e7eb",
                  fontSize: 15,
                  outline: "none",
                  boxShadow: "none",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>{isDebtsMode ? "Сумма займа" : "Сумма"}</span>
              <input
                value={goalTarget}
                onChange={(e) => {
                  const nextValue = e.target.value
                  setGoalTarget(nextValue)
                  if (!isDebtsMode || !hasGoalAmountRequiredError) return
                  const parsedAmount = Number(nextValue.trim().replace(",", "."))
                  if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
                    setGoalError(null)
                  }
                }}
                placeholder="0"
                inputMode="decimal"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: hasGoalAmountRequiredError ? "1px solid #ef4444" : "1px solid #e5e7eb",
                  fontSize: 15,
                  outline: "none",
                  boxShadow: "none",
                }}
              />
              {isDebtsMode && hasGoalAmountRequiredError ? (
                <div style={{ color: "#b91c1c", fontSize: 12 }}>Введите сумму</div>
              ) : null}
            </label>

            {isDebtsMode ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "#475569" }}>Дата возврата</span>
                <input
                  type="date"
                  value={debtorReturnDate}
                  onChange={(e) => setDebtorReturnDate(e.target.value)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 16,
                    outline: "none",
                    boxShadow: "none",
                  }}
                />
              </label>
            ) : null}

            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Иконка</span>
              <button
                type="button"
                onClick={() => {
                  setIsGoalSheetOpen(false)
                  setGoalSheetIntent("openGoalIconPicker")
                }}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  color: "#0f172a",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {goalIcon && isFinanceIconKey(goalIcon) ? <FinanceIcon iconKey={goalIcon} size="md" /> : null}
                  <span style={{ fontSize: 15 }}>{goalIcon && isFinanceIconKey(goalIcon) ? goalIcon : "Не выбрано"}</span>
                </span>
                <span style={{ fontSize: 16, color: "#9ca3af" }}>▾</span>
              </button>
            </div>

            {isDebtsMode ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "#475569" }}>Сумма возврата</span>
                <input
                  value={debtorReturnAmount}
                  onChange={(e) => setDebtorReturnAmount(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 15,
                    outline: "none",
                    boxShadow: "none",
                  }}
                />
              </label>
            ) : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setPendingOpenGoalsList(true)
                  setIsGoalSheetOpen(false)
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#0f172a",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSavingGoal}
                onClick={() => void handleCreateGoal()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: isSavingGoal ? 0.7 : 1,
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {isGoalsListOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeGoalsList}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 58,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              margin: "0 auto",
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              position: "absolute",
              left: 16,
              right: 16,
              top: 24,
              bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 24px)",
              maxHeight:
                "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
              boxShadow: "none",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: isGoalsMode || isDebtsMode ? 18 : 20, fontWeight: 700, color: "#0f172a" }}>{goalsListTitle}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={isDebtsMode ? openCreateDebtor : openCreateGoal}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                    fontWeight: 600,
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  + Создать
                </button>
                <button
                  type="button"
                  onClick={closeGoalsList}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div style={txListContainerStyle}>
              <div style={txScrollableStyle}>
                {isDebtsMode ? (
                  isDebtorsListLoading && filteredDebtors.length === 0 ? (
                    <div
                      style={{
                        minHeight: 120,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#64748b",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      Загрузка должников...
                    </div>
                  ) : (
                    <DebtorList
                      debtors={filteredDebtors}
                      emptyText="Пока нет должников"
                      currency={baseCurrency}
                      direction={currentDebtorDirection}
                      onSelectDebtor={(debtor) => {
                        setDetailDebtorId(debtor.id)
                        setDetailTitle(debtor.name)
                        setIsGoalsListOpen(false)
                        setDebtorSearch("")
                      }}
                    />
                  )
                ) : isGoalsListLoading && filteredGoals.length === 0 ? (
                  <div
                    style={{
                      minHeight: 120,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#f8fafc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#64748b",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Загрузка целей...
                  </div>
                ) : (
                  <GoalList
                    goals={filteredGoals}
                    onSelectGoal={(goal) => {
                      setDetailGoalId(goal.id)
                      setIsGoalsListOpen(false)
                      setGoalSearch("")
                    }}
                    emptyText="Пока нет целей"
                    currency={baseCurrency}
                  />
                )}
              </div>
            </div>
            {isGoalsMode || isDebtsMode ? (
              <div
                style={{
                  paddingTop: 10,
                  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)",
                }}
              >
                <button
                  type="button"
                  onClick={
                    isGoalsMode
                      ? openGoalOperationFromGoalsList
                      : isDebtsReceivableMode
                      ? openReceivableDebtOperationFromGoalsList
                      : openPayableDebtOperationFromGoalsList
                  }
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Добавить операцию
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {txMode !== "none" ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeTxSheet}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "auto",
              background: "#fff",
              borderRadius: 18,
              padding: "16px 20px",
              boxShadow: "none",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {txMode === "actions" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setTxMode("edit")}
                    disabled={txLoading}
                    style={{
                      display: "inline-flex",
                      justifyContent: "center",
                      padding: "12px 18px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      cursor: txLoading ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      width: "auto",
                      minWidth: "140px",
                    }}
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxMode("delete")}
                    disabled={txLoading}
                    style={{
                      display: "inline-flex",
                      justifyContent: "center",
                      padding: "12px 18px",
                      borderRadius: 12,
                      border: "1px solid #fee2e2",
                      background: "#fff",
                      color: "#b91c1c",
                      cursor: txLoading ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      minWidth: "140px",
                      width: "auto",
                    }}
                  >
                    Удалить
                  </button>
                  <button
                    type="button"
                    onClick={closeTxSheet}
                    style={{
                      display: "inline-flex",
                      justifyContent: "center",
                      padding: "12px 18px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      whiteSpace: "nowrap",
                      minWidth: "140px",
                      width: "auto",
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : null}

            {txMode === "delete" ? (
    <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Удалить операцию?</div>
                {txError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{txError}</div> : null}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={closeTxSheet}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      flex: 1,
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteTx}
                    disabled={txLoading || isDeleteTxRunning}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #fee2e2",
                      background: txLoading || isDeleteTxRunning ? "#fecdd3" : "#b91c1c",
                      color: "#fff",
                      flex: 1,
                      cursor: txLoading || isDeleteTxRunning ? "not-allowed" : "pointer",
                    }}
                  >
                    {txLoading || isDeleteTxRunning ? "Удаляем…" : "Удалить"}
                  </button>
                </div>
              </div>
            ) : null}

            {txMode === "edit" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Редактировать операцию</div>
                {txError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{txError}</div> : null}
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Сумма</span>
                  <input
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    inputMode="decimal"
                    disabled={txLoading || isEditTxRunning}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Дата</span>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    disabled={txLoading || isEditTxRunning}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={closeTxSheet}
                    disabled={txLoading || isEditTxRunning}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      flex: 1,
                      cursor: txLoading || isEditTxRunning ? "not-allowed" : "pointer",
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={txLoading || isEditTxRunning}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #0f172a",
                      background: txLoading || isEditTxRunning ? "#e5e7eb" : "#0f172a",
                      color: txLoading || isEditTxRunning ? "#6b7280" : "#fff",
                      flex: 1,
                      cursor: txLoading || isEditTxRunning ? "not-allowed" : "pointer",
                    }}
                  >
                    {txLoading || isEditTxRunning ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isAccountIconPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 45,
            padding: "0 12px 12px",
          }}
          onClick={() => {
            setIsAccountIconPickerOpen(false)
            setAccountSheetIntent("returnToAccountSheet")
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              margin: "0 auto",
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              boxShadow: "none",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>Выбор иконки</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
                gap: 10,
              }}
            >
              {(accountIconKeys ?? []).length === 0 ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Нет иконок</div>
              ) : (
                accountIconKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setAccountIcon(key)
                      setIsAccountIconPickerOpen(false)
                      setAccountSheetIntent("returnToAccountSheet")
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: accountIcon === key ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: "#fff",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    {isFinanceIconKey(key) ? <FinanceIcon iconKey={key} size="lg" /> : null}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAccountIconPickerOpen(false)
                setAccountSheetIntent("returnToAccountSheet")
              }}
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Назад
            </button>
          </div>
        </div>
      ) : null}

      {isGoalIconPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 45,
            padding: "0 12px 12px",
          }}
          onClick={() => {
            setIsGoalIconPickerOpen(false)
            setGoalSheetIntent("returnToGoalSheet")
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              margin: "0 auto",
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              boxShadow: "none",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>Выбор иконки</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
                gap: 10,
              }}
            >
              {(goalIconKeys ?? []).length === 0 ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Нет иконок</div>
              ) : (
                goalIconKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setGoalIcon(key)
                      setIsGoalIconPickerOpen(false)
                      setGoalSheetIntent("returnToGoalSheet")
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: goalIcon === key ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: "#fff",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    {isFinanceIconKey(key) ? <FinanceIcon iconKey={key} size="lg" /> : null}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsGoalIconPickerOpen(false)
                setGoalSheetIntent("returnToGoalSheet")
              }}
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Назад
            </button>
          </div>
        </div>
      ) : null}

      {isIncomeIconPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 45,
            padding: "0 12px 12px",
          }}
          onClick={() => {
            setIsIncomeIconPickerOpen(false)
            if (lastIncomeSourceModeRef.current) {
              setIncomeSourceSheetMode(lastIncomeSourceModeRef.current)
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              boxShadow: "none",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>Выбор иконки</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
                gap: 10,
              }}
            >
              {incomeIconKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setIncomeSourceIcon(key)
                    setIsIncomeIconPickerOpen(false)
                    if (lastIncomeSourceModeRef.current) {
                      setIncomeSourceSheetMode(lastIncomeSourceModeRef.current)
                    }
                  }}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: incomeSourceIcon === key ? "1px solid #0f172a" : "1px solid #e5e7eb",
                    background: "#fff",
                    display: "grid",
                    gap: 6,
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <FinanceIcon iconKey={key} size="lg" />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsIncomeIconPickerOpen(false)
                if (lastIncomeSourceModeRef.current) {
                  setIncomeSourceSheetMode(lastIncomeSourceModeRef.current)
                }
              }}
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Назад
            </button>
          </div>
        </div>
      ) : null}

      {isPeriodMenuOpen ? (
        <div
          role="dialog"
    aria-modal="true"
          onClick={() => setIsPeriodMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 63,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "70%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 16,
              padding: 12,
              boxShadow: "none",
              display: "grid",
              gap: 8,
            }}
          >
            {(["day", "week", "month", "year"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setAccountPeriodType(p)
                  setIsPeriodMenuOpen(false)
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid " + (accountPeriodType === p ? "#0f172a" : "#e5e7eb"),
                  background: accountPeriodType === p ? "#0f172a" : "#fff",
                  color: accountPeriodType === p ? "#fff" : "#0f172a",
                  fontWeight: 600,
                  fontSize: 14,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {p === "day" ? "День" : p === "week" ? "Неделя" : p === "month" ? "Месяц" : "Год"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setIsPeriodMenuOpen(false)
                setCustomFromDraft(customFrom || new Date().toISOString().slice(0, 10))
                setCustomToDraft(customTo || new Date().toISOString().slice(0, 10))
                setIsCustomSheetOpen(true)
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid " + (accountPeriodType === "custom" ? "#0f172a" : "#e5e7eb"),
                background: accountPeriodType === "custom" ? "#0f172a" : "#fff",
                color: accountPeriodType === "custom" ? "#fff" : "#0f172a",
                fontWeight: 600,
                fontSize: 14,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              Свой
            </button>
            <button
              type="button"
              onClick={() => setIsPeriodMenuOpen(false)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
  ) : null}

      {isCustomSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsCustomSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 62,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              boxShadow: "none",
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 14,
                position: "relative",
              }}
              onClick={() => setOpenPicker(null)}
            >
              {(["from", "to"] as const).map((side) => {
                const current = side === "from" ? customFromDraft || customFrom || new Date().toISOString().slice(0, 10) : customToDraft || customTo || new Date().toISOString().slice(0, 10)
                const dateObj = new Date(`${current}T00:00:00Z`)
                const y = dateObj.getUTCFullYear()
                const m = dateObj.getUTCMonth() + 1
                const d = dateObj.getUTCDate()
                const dayMax = daysInMonth(y, m - 1)
                const yearRange = (() => {
                  const base = y
                  const arr: number[] = []
                  for (let yy = base - 10; yy <= base + 10; yy += 1) arr.push(yy)
                  return arr
                })()

                const updateDraft = (nextY: number, nextM: number, nextD: number) => {
                  const clampedDay = Math.min(nextD, daysInMonth(nextY, nextM - 1))
                  const iso = `${nextY}-${pad2(nextM)}-${pad2(clampedDay)}`
                  if (side === "from") {
                    setCustomFromDraft(iso)
                  } else {
                    setCustomToDraft(iso)
                  }
                }

                const popoverFor = (part: "day" | "month" | "year") => {
                  if (!openPicker || openPicker.side !== side || openPicker.part !== part) return null
                  const alignRight = side === "to"
                  if (part === "day") {
                    const items = Array.from({ length: dayMax }, (_, i) => String(i + 1))
                    const selectedIndex = Math.max(0, Math.min(items.length - 1, d - 1))
                    return (
                      <PopoverList
                        items={items}
                        selectedIndex={selectedIndex}
                        alignRight={alignRight}
                        onSelect={(val) => updateDraft(y, m, Number(val))}
                        onClose={() => setOpenPicker(null)}
                      />
                    )
                  }
                  if (part === "month") {
                    const items = MONTH_NAMES
                    const selectedIndex = m - 1
                    return (
                      <PopoverList
                        items={items}
                        selectedIndex={selectedIndex}
                        alignRight={alignRight}
                        onSelect={(val) => updateDraft(y, MONTH_NAMES.indexOf(val) + 1, d)}
                        onClose={() => setOpenPicker(null)}
                      />
                    )
                  }
                  const yearItems = yearRange.map(String)
                  const selectedIndex = yearRange.indexOf(y)
                  return (
                    <PopoverList
                      items={yearItems}
                      selectedIndex={selectedIndex}
                      alignRight={alignRight}
                      onSelect={(val) => updateDraft(Number(val), m, d)}
                      onClose={() => setOpenPicker(null)}
                    />
                  )
                }

                const pillStyle = {
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  minWidth: 72,
                  textAlign: "center" as const,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  position: "relative" as const,
                }

                return (
                  <div
                    key={side}
                    style={{
                      display: "grid",
                      gap: 8,
                      justifyItems: "center",
                      position: "relative",
                      width: "48%",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#4b5563",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                        opacity: 0.7,
                      }}
                    >
                      {side === "from" ? "Начало периода" : "Конец периода"}
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", width: "100%" }}>
                      <div style={{ position: "relative", flex: 1 }}>
                        <button
                          type="button"
                          style={{ ...pillStyle, padding: "10px 10px", width: "100%" }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenPicker({ side, part: "day" })
                          }}
                        >
                          {d}
                        </button>
                        {popoverFor("day")}
                      </div>
                      <div style={{ position: "relative", flex: 1 }}>
                        <button
                          type="button"
                          style={{ ...pillStyle, padding: "10px 10px", width: "100%" }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenPicker({ side, part: "year" })
                          }}
                        >
                          {y}
                        </button>
                        {popoverFor("year")}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                      <div style={{ position: "relative", width: "100%" }}>
                        <button
                          type="button"
                          style={{
                            ...pillStyle,
                            padding: "10px 12px",
                            width: "100%",
                            whiteSpace: "nowrap",
                            fontSize: 13,
                            lineHeight: 1,
                            textAlign: "center",
                            minWidth: 96,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenPicker({ side, part: "month" })
                          }}
                        >
                          {MONTH_NAMES[m - 1]}
                        </button>
                        {popoverFor("month")}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
              <button
                type="button"
                onClick={applyCustomRange}
                style={{
                  width: "68%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: customFromDraft && customToDraft ? "pointer" : "not-allowed",
                  opacity: customFromDraft && customToDraft ? 1 : 0.6,
                }}
                disabled={!customFromDraft || !customToDraft}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAccountSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
            paddingLeft: 16,
            paddingRight: 16,
            paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)",
          }}
          onClick={closeAccountSheet}
        >
          <div
            style={{
              width: "100%",
              maxWidth: editingAccountId ? 420 : 540,
              background: "#fff",
              borderRadius: editingAccountId ? 20 : 16,
              padding: editingAccountId ? "18px 18px 20px" : "16px 16px 20px",
              boxShadow: "none",
              maxHeight: editingAccountId ? "calc(100vh - 80px)" : "70vh",
              overflow: editingAccountId ? "hidden" : undefined,
              overflowX: editingAccountId ? "hidden" : "hidden",
              overflowY: editingAccountId ? undefined : "auto",
              paddingBottom: editingAccountId
                ? "calc(env(safe-area-inset-bottom, 0px) + 12px)"
                : "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {editingAccountId ? (
              <div style={{ maxHeight: "calc(100vh - 120px)", overflowY: "auto", paddingBottom: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
                  Редактировать счёт
                </div>
                <div style={{ display: "grid", gap: 16 }}>
                  <div
                    style={{
                      background: accountPreviewColor,
                      borderRadius: 18,
                      padding: 16,
                      display: "grid",
                      gap: 12,
                      border: "none",
                      boxShadow: "none",
                    }}
                  >
                    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                      Название
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Введите название"
                        maxLength={ACCOUNT_NAME_MAX_LENGTH}
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: hasAccountDuplicateNameError ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.35)",
                          fontSize: 16,
                          outline: "none",
                          boxShadow: "none",
                          background: "rgba(255,255,255,0.97)",
                          color: "#0f172a",
                        }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                      {editingAccountId ? "Баланс" : "Стартовый баланс"}
                      <input
                        value={balance}
                        onChange={(e) => setBalance(e.target.value)}
                        inputMode="decimal"
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.35)",
                          fontSize: 16,
                          background: "rgba(255,255,255,0.97)",
                          outline: "none",
                          boxShadow: "none",
                          color: "#0f172a",
                        }}
                      />
                    </label>
                    <div style={{ display: "grid", gap: 6, color: "rgba(255,255,255,0.92)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Иконка</div>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountSheetIntent("openAccountIconPicker")
                          setIsAccountSheetOpen(false)
                        }}
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.35)",
                          background: "rgba(255,255,255,0.97)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#0f172a" }}>
                          {accountIcon && isFinanceIconKey(accountIcon) ? <FinanceIcon iconKey={accountIcon} size="md" /> : null}
                          <span style={{ fontSize: 14 }}>{accountIcon && isFinanceIconKey(accountIcon) ? accountIcon : "Не выбрано"}</span>
                        </span>
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>▼</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Оформление</div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        overflowX: "auto",
                        paddingBottom: 4,
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      {accountColorOptions.map((clr) => (
                        <button
                          key={clr}
                          type="button"
                          onClick={() => setAccountColor(clr)}
                          style={{
                            width: 34,
                            height: 34,
                            minWidth: 34,
                            borderRadius: "50%",
                            border: clr === accountColor ? "2px solid #0f172a" : "1px solid #e5e7eb",
                            background: clr,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            boxShadow: "none",
                            flexShrink: 0,
                          }}
                        >
                          {clr === accountColor ? "✓" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                  {accountActionError ? (
                    <div style={{ color: "#b91c1c", fontSize: 13, textAlign: "center" }}>{accountActionError}</div>
                  ) : null}
                  {editingAccountId ? (
                    isConfirmingDelete ? (
                      <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
                        <div style={{ fontSize: 14, color: "#0f172a", opacity: 0.7 }}>Удалить счёт?</div>
                        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setIsConfirmingDelete(false)
                              setAccountActionError(null)
                            }}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#0f172a",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Отменить
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              runAccountFlight(async () => {
                                const tokenLocal = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
                                if (!tokenLocal || !editingAccountId) return
                                setAccountActionError(null)
                                try {
                                  await deleteAccount(tokenLocal, editingAccountId)
                                  await refetchAccountsSeq()
                                  await refetchGoals()
                                  closeAccountSheet()
                                } catch (err) {
                                  if (err instanceof DOMException && err.name === "AbortError") return
                                  setAccountActionError(err instanceof Error ? err.message : "Не удалось удалить счёт")
                                } finally {
                                  setIsConfirmingDelete(false)
                                }
                              })
                            }
                            disabled={isAccountFlight}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid #fee2e2",
                              background: "#fff",
                              color: isAccountFlight ? "#fca5a5" : "#b91c1c",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: isAccountFlight ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isAccountFlight ? "Удаляем…" : "Подтвердить"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountActionError(null)
                            setIsConfirmingDelete(true)
                          }}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #fee2e2",
                            background: "#fff",
                            color: "#b91c1c",
                            fontWeight: 600,
                            cursor: "pointer",
                            width: "100%",
                          }}
                        >
                          Удалить
                        </button>
                        <button
                          type="button"
                          onClick={closeAccountSheet}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            cursor: "pointer",
                            width: "100%",
                          }}
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAccount}
                          disabled={isAccountFlight}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: isAccountFlight ? "#e5e7eb" : "#0f172a",
                            color: isAccountFlight ? "#6b7280" : "#fff",
                            fontWeight: 600,
                            cursor: isAccountFlight ? "not-allowed" : "pointer",
                            width: "100%",
                          }}
                        >
                          {isAccountFlight ? "Сохраняем…" : "Сохранить"}
                        </button>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={handleSaveAccount}
                      disabled={isAccountFlight}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "none",
                        background: isAccountFlight ? "#1f2937" : "#000",
                        color: isAccountFlight ? "rgba(255,255,255,0.8)" : "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: isAccountFlight ? "not-allowed" : "pointer",
                      }}
                    >
                      {isAccountFlight ? "Сохраняем…" : "Сохранить"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
                  Создание счёта
                </div>
                <div style={{ display: "grid", gap: 16 }}>
                  <div
                    style={{
                      background: accountPreviewColor,
                      borderRadius: 18,
                      padding: 16,
                      display: "grid",
                      gap: 12,
                      border: "none",
                      boxShadow: "none",
                    }}
                  >
                    <label
                      style={{
                        display: "grid",
                        gap: 6,
                        fontSize: 13,
                        color: "rgba(255,255,255,0.92)",
                      }}
                    >
                      Название
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Введите название"
                        maxLength={ACCOUNT_NAME_MAX_LENGTH}
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: hasAccountDuplicateNameError ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.35)",
                          fontSize: 16,
                          outline: "none",
                          boxShadow: "none",
                          background: "rgba(255,255,255,0.97)",
                          color: "#0f172a",
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: "grid",
                        gap: 6,
                        fontSize: 13,
                        color: "rgba(255,255,255,0.92)",
                      }}
                    >
                      Стартовый баланс
                      <input
                        value={balance}
                        onChange={(e) => setBalance(e.target.value)}
                        inputMode="decimal"
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.35)",
                          fontSize: 16,
                          background: "rgba(255,255,255,0.97)",
                          outline: "none",
                          boxShadow: "none",
                          color: "#0f172a",
                        }}
                      />
                    </label>
                    <div style={{ display: "grid", gap: 6, color: "rgba(255,255,255,0.92)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Иконка</div>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountSheetIntent("openAccountIconPicker")
                          setIsAccountSheetOpen(false)
                        }}
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.35)",
                          background: "rgba(255,255,255,0.97)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          cursor: "pointer",
                          color: "#0f172a",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {accountIcon && isFinanceIconKey(accountIcon) ? <FinanceIcon iconKey={accountIcon} size="md" /> : null}
                          <span style={{ fontSize: 14 }}>{accountIcon && isFinanceIconKey(accountIcon) ? accountIcon : "Не выбрано"}</span>
                        </span>
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>▼</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Оформление</div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        overflowX: "auto",
                        paddingBottom: 4,
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      {accountColorOptions.map((clr) => (
                        <button
                          key={clr}
                          type="button"
                          onClick={() => setAccountColor(clr)}
                          style={{
                            width: 34,
                            height: 34,
                            minWidth: 34,
                            borderRadius: "50%",
                            border: clr === accountColor ? "2px solid #0f172a" : "1px solid #e5e7eb",
                            background: clr,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            boxShadow: "none",
                            flexShrink: 0,
                          }}
                        >
                          {clr === accountColor ? "✓" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                  {accountActionError ? (
                    <div style={{ color: "#b91c1c", fontSize: 13, textAlign: "center" }}>{accountActionError}</div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button
                      type="button"
                      onClick={closeAccountSheet}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAccount}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#0f172a",
                        color: "#fff",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      Создать
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {categorySheetMode ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 45,
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
            paddingLeft: 16,
            paddingRight: 16,
            paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)",
          }}
          onClick={() => closeCategorySheet()}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              margin: "0 auto",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "none",
              maxHeight: "calc(100vh - 120px)",
              overflowY: "auto",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              {categorySheetMode === "create" ? "Новая категория" : "Редактировать категорию"}
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Название</label>
                <input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Название"
                  maxLength={EXPENSE_CATEGORY_NAME_MAX_LENGTH}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: hasCategoryDuplicateNameError ? "1px solid #ef4444" : "1px solid #e5e7eb",
                    fontSize: 16,
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Бюджет</label>
                <input
                  value={categoryBudget}
                  onChange={(e) => setCategoryBudget(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 16 }}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Иконка</label>
                <button
                  type="button"
                  onClick={() => {
                    lastCategorySheetModeRef.current = categorySheetMode
                    closeCategorySheet({ preserveForm: true })
                    setIsCategoryIconPickerOpen(true)
                  }}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    boxShadow: "none",
                    outline: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, color: "#0f172a" }}>
                    {categoryIcon && isFinanceIconKey(categoryIcon) ? <FinanceIcon iconKey={categoryIcon} size={16} /> : null}
                    <span style={{ fontSize: 15 }}>
                      {categoryIcon && isFinanceIconKey(categoryIcon) ? categoryIcon : "Не выбрано"}
                    </span>
                  </span>
                  <span style={{ fontSize: 16, color: "#9ca3af" }}>▾</span>
                </button>
            </div>
            {categorySaveError ? (
              <div style={{ color: "#b91c1c", fontSize: 12, marginTop: -4 }}>{categorySaveError}</div>
            ) : null}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: categorySheetMode === "edit" && editingCategoryId ? "1fr 1fr 1fr" : "1fr 1fr",
                gap: 10,
              }}
            >
              {categorySheetMode === "edit" && editingCategoryId ? (
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(editingCategoryId)}
                  disabled={deletingCategoryId === editingCategoryId || isCategoryDeleteRunning}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #fee2e2",
                    background: deletingCategoryId === editingCategoryId || isCategoryDeleteRunning ? "#fecdd3" : "#fff",
                    color: "#b91c1c",
                    cursor: deletingCategoryId === editingCategoryId || isCategoryDeleteRunning ? "not-allowed" : "pointer",
                    width: "100%",
                  }}
                >
                  {deletingCategoryId === editingCategoryId || isCategoryDeleteRunning ? "Удаляем…" : "Удалить"}
                </button>
              ) : null}
                <button
                  type="button"
                  onClick={() => closeCategorySheet()}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSaveCategory}
                  disabled={isSavingCategory || isCategorySaveRunning}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: isSavingCategory || isCategorySaveRunning ? "#e5e7eb" : "#0f172a",
                    color: isSavingCategory || isCategorySaveRunning ? "#6b7280" : "#fff",
                    fontWeight: 600,
                    cursor: isSavingCategory || isCategorySaveRunning ? "not-allowed" : "pointer",
                    width: "100%",
                  }}
                >
                  {isSavingCategory || isCategorySaveRunning ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCategoryIconPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 45,
            padding: "0 12px 12px",
          }}
          onClick={() => {
            setIsCategoryIconPickerOpen(false)
            if (lastCategorySheetModeRef.current) {
              setCategorySheetMode(lastCategorySheetModeRef.current)
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              margin: "0 auto",
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              boxShadow: "none",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>Выбор иконки</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
                gap: 10,
              }}
            >
              {categoryIconKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setCategoryIcon(key)
                    setIsCategoryIconPickerOpen(false)
                    if (lastCategorySheetModeRef.current) {
                      setCategorySheetMode(lastCategorySheetModeRef.current)
                    }
                  }}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: categoryIcon === key ? "1px solid #0f172a" : "1px solid #e5e7eb",
                    background: "#fff",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <FinanceIcon iconKey={key} size="lg" />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCategoryIconPickerOpen(false)
                if (lastCategorySheetModeRef.current) {
                  setCategorySheetMode(lastCategorySheetModeRef.current)
                }
              }}
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Назад
            </button>
          </div>
        </div>
      ) : null}

      {incomeSourceSheetMode ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 45,
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
            paddingLeft: 16,
            paddingRight: 16,
            paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)",
          }}
          onClick={() => closeIncomeSourceSheet()}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "none",
              maxHeight: "calc(100vh - 120px)",
              overflowY: "auto",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              {incomeSourceSheetMode === "create" ? "Новый источник дохода" : "Редактировать источник"}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                value={incomeSourceName}
                onChange={(e) => setIncomeSourceName(e.target.value)}
                placeholder="Название"
                maxLength={INCOME_SOURCE_NAME_MAX_LENGTH}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: hasIncomeSourceDuplicateNameError ? "1px solid #ef4444" : "1px solid #e5e7eb",
                  fontSize: 16,
                }}
              />
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Иконка</div>
                <button
                  type="button"
                  onClick={() => {
                    lastIncomeSourceModeRef.current = incomeSourceSheetMode
                    closeIncomeSourceSheet({ preserveForm: true })
                    setIsIncomeIconPickerOpen(true)
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#0f172a" }}>
                    {incomeSourceIcon && isFinanceIconKey(incomeSourceIcon) ? <FinanceIcon iconKey={incomeSourceIcon} size="md" /> : null}
                    <span style={{ fontSize: 14 }}>
                      {incomeSourceIcon && isFinanceIconKey(incomeSourceIcon) ? incomeSourceIcon : "Без иконки"}
                    </span>
                  </span>
                  <span style={{ color: "#9ca3af", fontSize: 12 }}>▼</span>
                </button>
              </div>
              {incomeSourceError ? (
                <div style={{ color: "#b91c1c", fontSize: 13 }}>{incomeSourceError}</div>
              ) : null}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    incomeSourceSheetMode === "edit" && editingIncomeSourceId ? "1fr 1fr 1fr" : "1fr 1fr",
                  gap: 10,
                }}
              >
                {incomeSourceSheetMode === "edit" && editingIncomeSourceId ? (
                    <button
                  type="button"
                  onClick={() => handleDeleteIncomeSource(editingIncomeSourceId)}
                  disabled={deletingIncomeSourceId === editingIncomeSourceId || isIncomeDeleteRunning}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #fee2e2",
                    background:
                      deletingIncomeSourceId === editingIncomeSourceId || isIncomeDeleteRunning ? "#fecdd3" : "#fff",
                    color: "#b91c1c",
                    cursor:
                      deletingIncomeSourceId === editingIncomeSourceId || isIncomeDeleteRunning ? "not-allowed" : "pointer",
                    width: "100%",
                  }}
                >
                  {deletingIncomeSourceId === editingIncomeSourceId || isIncomeDeleteRunning ? "Удаляем…" : "Удалить"}
                </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => closeIncomeSourceSheet()}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSaveIncomeSource}
                  disabled={isSavingIncomeSource || isIncomeSaveRunning}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: isSavingIncomeSource || isIncomeSaveRunning ? "#e5e7eb" : "#0f172a",
                    color: isSavingIncomeSource || isIncomeSaveRunning ? "#6b7280" : "#fff",
                    cursor: isSavingIncomeSource || isIncomeSaveRunning ? "not-allowed" : "pointer",
                    width: "100%",
                  }}
                >
                  {isSavingIncomeSource || isIncomeSaveRunning ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default OverviewScreen
