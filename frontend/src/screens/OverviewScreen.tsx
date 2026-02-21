import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useAppStore } from "../store/useAppStore"
import type { Goal, Transaction } from "../types/finance"
import "./OverviewScreen.css"
import { AppIcon, type IconName } from "../components/AppIcon"
import { FinanceIcon, FINANCE_ICON_SECTIONS, isFinanceIconKey } from "../shared/icons/financeIcons"
import { createAccount, getAccounts, updateAccount, deleteAccount, adjustAccountBalance } from "../api/accounts"
import { createCategory, deleteCategory, getCategories, renameCategory } from "../api/categories"
import { createIncomeSource, deleteIncomeSource, getIncomeSources, renameIncomeSource } from "../api/incomeSources"
import { createGoal, getGoals, updateGoal } from "../api/goals"
import { createTransaction, deleteTransaction, getTransactions } from "../api/transactions"
import { formatMoney, normalizeCurrency } from "../utils/formatMoney"

type TileType = "account" | "category" | "income-source" | "goal"
type TileSize = "sm" | "md" | "lg"
type TxKind = "income" | "expense" | "transfer"

type CardItem = {
  id: string
  title: string
  amount: number
  icon?: string | null
  financeIconKey?: string | null
  color: string
  textColor?: string
  isAdd?: boolean
  type?: TileType
  size?: TileSize
  budget?: number | null
  budgetTone?: "normal" | "warn" | "alert"
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

const getCurrentMonthTag = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${now.getFullYear()}-${month}`
}

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

type OpenPicker =
  | {
      side: "from" | "to"
      part: "day" | "month" | "year"
    }
  | null

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

const isCurrentMonth = (tx: Transaction, currentTag: string) => tx.date.slice(0, 7) === currentTag

const pickTextColor = (hex: string) => {
  const raw = hex.replace("#", "")
  if (raw.length !== 6) return "#0f172a"
  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? "#0f172a" : "#fff"
}

const Section: React.FC<{
  title: string
  items: CardItem[]
  rowScroll?: boolean
  rowClass?: string
  onAddAccounts?: () => void
  onAddCategory?: () => void
  onAddIncomeSource?: () => void
  onCategoryClick?: (id: string, title: string) => void
  onAccountClick?: (id: string, title: string) => void
  onIncomeSourceClick?: (id: string, title: string) => void
  onGoalClick?: (id: string, title: string) => void
  baseCurrency: string
}> = ({
  title,
  items,
  rowScroll,
  rowClass,
  onAddAccounts,
  onAddCategory,
  onAddIncomeSource,
  onCategoryClick,
  onAccountClick,
  onIncomeSourceClick,
  onGoalClick,
  baseCurrency,
}) => {
  const listClass = rowScroll
    ? `overview-section__list overview-section__list--row ${rowClass ?? ""}`.trim()
    : "overview-section__list tile-grid"
  return (
    <section className="overview-section">
      <div className="overview-section__title overview-section__title--muted">{title}</div>
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
          const tileStyle =
            item.type === "account" && !item.isAdd
              ? {
                  background: item.color,
                  color: item.textColor ?? "#0f172a",
                  border: "1px solid rgba(0,0,0,0.08)",
                }
              : item.type === "category" && categoryHighlight
              ? categoryHighlight
              : undefined

          return (
            <div
              key={item.id}
              className={`tile-card ${item.isAdd ? "tile-card--add overview-add-tile" : ""} ${
                item.type ? `tile-card--${item.type}` : ""
              } tile--${item.size ?? "md"}`}
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
              }}
            >
              <div
                className="tile-card__icon"
                style={
                  item.isAdd
                    ? undefined
                    : {
                        background:
                          item.type === "account" && !item.isAdd ? "rgba(255,255,255,0.2)" : "rgba(15, 23, 42, 0.05)",
                        color: item.textColor ?? "rgba(15, 23, 42, 0.85)",
                        opacity: item.type === "account" && !item.isAdd ? 1 : 0.75,
                      }
                }
              >
                {item.financeIconKey && isFinanceIconKey(item.financeIconKey) ? (
                  <FinanceIcon iconKey={item.financeIconKey} size={16} />
                ) : item.icon ? (
                  <AppIcon name={item.icon as IconName} size={16} />
                ) : null}
              </div>
              <div className="tile-card__title">{item.title}</div>
              {!item.isAdd && (
                <div
                  className="tile-card__amount"
                  style={item.type === "account" ? { color: item.textColor ?? "#0f172a" } : undefined}
                >
                  {formatMoney(item.amount, baseCurrency)}
                  {item.type === "category" && item.budget != null ? (
                    <div style={{ marginTop: 2, fontSize: 9, color: "#6b7280" }}>{formatMoney(item.budget, baseCurrency)}</div>
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
}

function OverviewScreen({ overviewError = null, onRetryOverview }: OverviewScreenProps) {
  const {
    accounts,
    categories,
    incomeSources,
    goals,
    transactions,
    setAccounts,
    setCategories,
    setIncomeSources,
    setGoals,
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
  const [pendingCategoryEdit, setPendingCategoryEdit] = useState<{ id: string; title: string } | null>(null)
  const [isCategoryIconPickerOpen, setIsCategoryIconPickerOpen] = useState(false)
  const lastCategorySheetModeRef = useRef<"create" | "edit" | null>(null)
  const [incomeSourceSheetMode, setIncomeSourceSheetMode] = useState<"create" | "edit" | null>(null)
  const [editingIncomeSourceId, setEditingIncomeSourceId] = useState<string | null>(null)
  const [incomeSourceName, setIncomeSourceName] = useState("")
  const [incomeSourceBudget, setIncomeSourceBudget] = useState("")
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
  const [goalTab, setGoalTab] = useState<"active" | "completed">("active")
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null)
  const [goalSearch, setGoalSearch] = useState("")
  const [isGoalSheetOpen, setIsGoalSheetOpen] = useState(false)
  const [goalName, setGoalName] = useState("")
  const [goalTarget, setGoalTarget] = useState("")
  const [goalIcon, setGoalIcon] = useState<string | null>(null)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [isSavingGoal, setIsSavingGoal] = useState(false)
  const [goalSheetMode, setGoalSheetMode] = useState<"create" | "edit">("create")
  const [pendingGoalCreate, setPendingGoalCreate] = useState(false)
  const [pendingOpenGoalsList, setPendingOpenGoalsList] = useState(false)
  const [pendingGoalEdit, setPendingGoalEdit] = useState<{ id: string; title: string } | null>(null)
  const [isGoalIconPickerOpen, setIsGoalIconPickerOpen] = useState(false)
  const [goalSheetIntent, setGoalSheetIntent] = useState<null | "openGoalIconPicker" | "returnToGoalSheet">(null)
  const [detailTitle, setDetailTitle] = useState<string>("")
  const [accountSearch, setAccountSearch] = useState("")
  const [categorySearch, setCategorySearch] = useState("")
  const [incomeSourceSearch, setIncomeSourceSearch] = useState("")
  const [accountPeriodType, setAccountPeriodType] = useState<"day" | "week" | "month" | "year" | "custom">("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [customFromDraft, setCustomFromDraft] = useState("")
  const [customToDraft, setCustomToDraft] = useState("")
  const [isCustomSheetOpen, setIsCustomSheetOpen] = useState(false)
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null)
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false)
  const [txActionId, setTxActionId] = useState<string | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [txMode, setTxMode] = useState<"none" | "actions" | "delete" | "edit">("none")
  const [txError, setTxError] = useState<string | null>(null)
  const [txLoading, setTxLoading] = useState(false)
  const [editKind, setEditKind] = useState<TxKind>("expense")
  const [editAmount, setEditAmount] = useState("")
  const [editAccountId, setEditAccountId] = useState("")
  const [editToAccountId, setEditToAccountId] = useState("")
  const [editCategoryId, setEditCategoryId] = useState("")
  const [editIncomeSourceId, setEditIncomeSourceId] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editNote, setEditNote] = useState("")
  const currentMonthTag = getCurrentMonthTag()

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
      const accType = (acc as { type?: string } | undefined)?.type ?? "cash"
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

  const { incomeSum, expenseSum, incomeBySource, expenseByCategory } = useMemo(() => {
    let income = 0
    let expense = 0
    const incomeMap = new Map<string, number>()
    const expenseMap = new Map<string, number>()

    transactions.forEach((tx) => {
      if (!isCurrentMonth(tx, currentMonthTag)) return
      if (tx.type === "transfer") return

      if (tx.type === "income") {
        income += tx.amount.amount
        const key = tx.incomeSourceId ?? "uncategorized"
        incomeMap.set(key, (incomeMap.get(key) ?? 0) + tx.amount.amount)
      }

      if (tx.type === "expense") {
        expense += tx.amount.amount
        const key = tx.categoryId ?? "uncategorized"
        expenseMap.set(key, (expenseMap.get(key) ?? 0) + tx.amount.amount)
      }
    })

    return {
      incomeSum: income,
      expenseSum: expense,
      incomeBySource: incomeMap,
      expenseByCategory: expenseMap,
    }
  }, [transactions, currentMonthTag])

  const monthLabel = useMemo(() => {
    const now = new Date()
    return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(now)
  }, [])

  const baseCurrency = normalizeCurrency(currency || "RUB")

  const filteredGoals = useMemo(() => goals.filter((g) => g.status === goalTab), [goalTab, goals])
  const detailGoal = useMemo(() => goals.find((g) => g.id === detailGoalId) ?? null, [detailGoalId, goals])
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
    const section = FINANCE_ICON_SECTIONS.find((s) => s.id === "goals")
    return section ? section.keys : []
  }, [])

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
    }))
    setCategories(mapped)
  }, [setCategories, token])

  const refetchIncomeSources = useCallback(async () => {
    if (!token) return
    const data = await getIncomeSources(token)
    const mapped = data.incomeSources.map((s) => ({ id: s.id, name: s.name, icon: s.icon ?? null }))
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
  }, [setGoals, token])

  const refetchAccountsSeq = useCallback(async () => {
    if (!token) return
    const data = await getAccounts(token)
    const mapped = data.accounts.map((a) => ({
      id: a.id,
      name: a.name,
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
    }))
    setTransactions(mapped)
  }, [setTransactions, token])

  const openCreateCategory = useCallback(() => {
    setCategorySheetMode("create")
    lastCategorySheetModeRef.current = "create"
    setEditingCategoryId(null)
    setCategoryName("")
  }, [])

  const openGoalsList = useCallback(async () => {
    try {
      await refetchGoals()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось загрузить цели"
      setGoalError(msg)
    }
    setIsGoalsListOpen(true)
    setDetailGoalId(null)
  }, [refetchGoals])

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
    setIncomeSourceBudget("")
    setIncomeSourceIcon(null)
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
    setIncomeSourceBudget("")
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

  const openTxActions = useCallback(
    (id: string) => {
      setTxError(null)
      setTxLoading(false)
      setTxActionId(id)
      setTxMode("actions")
      const tx = transactions.find((t) => t.id === id)
      if (tx) {
        setEditKind((tx.type as TxKind) ?? "expense")
        setEditAmount(String(tx.amount.amount))
        setEditAccountId(tx.accountId)
        setEditToAccountId(tx.toAccountId ?? "")
        setEditCategoryId(tx.categoryId ?? "")
        setEditIncomeSourceId(tx.incomeSourceId ?? "")
        setEditDate(tx.date.slice(0, 10))
        setEditNote(tx.comment ?? "")
      }
    },
    [transactions]
  )

  const closeTxSheet = useCallback(() => {
    setTxMode("none")
    setTxActionId(null)
    setTxError(null)
    setTxLoading(false)
  }, [])

  const closeDetails = useCallback(() => {
    setDetailAccountId(null)
    setDetailCategoryId(null)
    setDetailIncomeSourceId(null)
    setDetailGoalId(null)
    setDetailTitle("")
    setAccountSearch("")
    setCategorySearch("")
    setIncomeSourceSearch("")
    setGoalSearch("")
    setSearchFocused(false)
    closeTxSheet()
  }, [closeTxSheet])

  const openEditAccountFromDetails = useCallback(
    (accountId: string) => {
      closeDetails()
      queueMicrotask(() => openEditAccountSheet(accountId))
    },
    [closeDetails, openEditAccountSheet],
  )

  const handleDeleteTx = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    if (!token) {
      setTxError("Нет токена")
      return
    }
    if (!txActionId) return
    setTxLoading(true)
    setTxError(null)
    try {
      await deleteTransaction(token, txActionId)
      await refetchAccountsSeq()
      await refetchTransactions()
      closeTxSheet()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setTxLoading(false)
        return
      }
      setTxError("Не удалось удалить операцию")
    } finally {
      setTxLoading(false)
    }
  }, [closeTxSheet, refetchAccountsSeq, refetchTransactions, txActionId])

  const handleSaveEdit = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    if (!token) {
      setTxError("Нет токена")
      return
    }
    if (!txActionId) return
    const original = transactions.find((t) => t.id === txActionId)
    const num = Number(editAmount.replace(",", "."))
    if (!Number.isFinite(num) || num <= 0) {
      setTxError("Некорректная сумма")
      return
    }
    setTxLoading(true)
    setTxError(null)
    try {
      await deleteTransaction(token, txActionId)

      if (editKind === "transfer") {
        if (!editAccountId || !editToAccountId || editAccountId === editToAccountId) {
          setTxError("Укажите разные счета")
          setTxLoading(false)
          return
        }
        await createTransaction(token, {
          kind: "transfer",
          amount: num,
          fromAccountId: editAccountId,
          toAccountId: editToAccountId,
          happenedAt: editDate || undefined,
          note: editNote || null,
        })
      } else if (editKind === "income") {
        if (!editAccountId) {
          setTxError("Укажите счет")
          setTxLoading(false)
          return
        }
        await createTransaction(token, {
          kind: "income",
          amount: num,
          accountId: editAccountId,
          incomeSourceId: editIncomeSourceId || null,
          happenedAt: editDate || undefined,
          note: editNote || null,
        })
      } else {
        if (!editAccountId) {
          setTxError("Укажите счет")
          setTxLoading(false)
          return
        }
        await createTransaction(token, {
          kind: "expense",
          amount: num,
          accountId: editAccountId,
          categoryId: editCategoryId || null,
          happenedAt: editDate || undefined,
          note: editNote || null,
        })
      }

      await refetchAccountsSeq()
      await refetchTransactions()
      closeTxSheet()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setTxLoading(false)
        return
      }
      const message = err instanceof Error ? err.message : "Не удалось сохранить"
      if (original && /5\d\d/.test(message)) {
        try {
          if (original.type === "transfer") {
            await createTransaction(token, {
              kind: "transfer",
              amount: original.amount.amount,
              fromAccountId: original.accountId,
              toAccountId: original.toAccountId ?? "",
              happenedAt: original.date,
              note: original.comment ?? null,
            })
          } else if (original.type === "income") {
            await createTransaction(token, {
              kind: "income",
              amount: original.amount.amount,
              accountId: original.accountId,
              incomeSourceId: original.incomeSourceId ?? null,
              happenedAt: original.date,
              note: original.comment ?? null,
            })
          } else {
            await createTransaction(token, {
              kind: "expense",
              amount: original.amount.amount,
              accountId: original.accountId,
              categoryId: original.categoryId ?? null,
              happenedAt: original.date,
              note: original.comment ?? null,
            })
          }
        } catch {
          // best-effort restore
        }
      }
      setTxError(message)
    } finally {
      setTxLoading(false)
    }
  }, [
    closeTxSheet,
    editAccountId,
    editAmount,
    editCategoryId,
    editDate,
    editIncomeSourceId,
    editKind,
    editNote,
    editToAccountId,
    refetchAccountsSeq,
    refetchTransactions,
    transactions,
    txActionId,
  ])

  const handleSaveCategory = useCallback(async () => {
    if (!token) {
      return
    }
    const trimmed = categoryName.trim()
    if (!trimmed) {
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
    setIsSavingCategory(true)
    try {
      if (categorySheetMode === "create") {
        await createCategory(token, { name: trimmed, kind: "expense", icon: categoryIcon ?? null, budget: budgetNumber })
      } else if (categorySheetMode === "edit" && editingCategoryId) {
        await renameCategory(token, editingCategoryId, trimmed, { icon: categoryIcon ?? null, budget: budgetNumber })
      }
      await refetchCategories()
      closeCategorySheet()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка"
      setAccountActionError(msg)
    } finally {
      setIsSavingCategory(false)
    }
  }, [categoryBudget, categoryIcon, categoryName, categorySheetMode, closeCategorySheet, editingCategoryId, refetchCategories, token])

  const handleSaveIncomeSource = useCallback(async () => {
    if (!token) {
      setIncomeSourceError("Нет токена")
      return
    }
    const trimmed = incomeSourceName.trim()
    if (!trimmed) {
      setIncomeSourceError("Введите название источника")
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
      setIncomeSourceError(msg.includes("INCOME_SOURCE_NAME_EXISTS") ? "Источник с таким названием уже есть" : msg)
    } finally {
      setIsSavingIncomeSource(false)
    }
  }, [
    closeIncomeSourceSheet,
    editingIncomeSourceId,
    incomeSourceName,
    incomeSourceSheetMode,
    incomeSourceIcon,
    refetchIncomeSources,
    token,
  ])

  const closeGoalsList = useCallback(() => {
    setIsGoalsListOpen(false)
  }, [])

  const openCreateGoal = useCallback(() => {
    setGoalError(null)
    setGoalName("")
    setGoalTarget("")
    setGoalIcon(null)
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
    const targetRaw = goalTarget.trim().replace(",", ".")
    const target = Number(targetRaw)
    if (!Number.isFinite(target) || target <= 0) {
      setGoalError("Введите сумму цели")
      return
    }
    setIsSavingGoal(true)
    try {
      if (goalSheetMode === "create") {
        await createGoal(token, { name: trimmed, icon: goalIcon?.trim() || null, targetAmount: Math.round(target * 100) / 100 })
      } else if (goalSheetMode === "edit" && detailGoalId) {
        await updateGoal(token, detailGoalId, {
          name: trimmed,
          icon: goalIcon?.trim() || null,
          targetAmount: Math.round(target * 100) / 100,
        })
      }
      await refetchGoals()
      setPendingOpenGoalsList(true)
      setIsGoalSheetOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось создать цель"
      setGoalError(msg)
    } finally {
      setIsSavingGoal(false)
    }
  }, [goalIcon, goalName, goalTarget, refetchGoals, token])

  const handleDeleteCategory = useCallback(
    async (id: string) => {
      if (!token) {
        alert("Нет токена")
        return
      }
      const confirmed = window.confirm("Удалить категорию?")
      if (!confirmed) return
      setDeletingCategoryId(id)
      try {
        await deleteCategory(token, id)
        await refetchCategories()
        closeCategorySheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка"
        if (msg.includes("CATEGORY_IN_USE")) {
          alert("Категория используется в транзакциях и не может быть удалена")
        } else {
          alert(msg)
        }
      } finally {
        setDeletingCategoryId(null)
      }
    },
    [closeCategorySheet, refetchCategories, token]
  )

  const handleDeleteIncomeSource = useCallback(
    async (id: string) => {
      if (!token) {
        alert("Нет токена")
        return
      }
      const confirmed = window.confirm("Удалить источник дохода?")
      if (!confirmed) return
      setDeletingIncomeSourceId(id)
      try {
        await deleteIncomeSource(token, id)
        await refetchIncomeSources()
        closeIncomeSourceSheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка"
        if (msg.includes("INCOME_SOURCE_IN_USE")) {
          alert("Источник используется в транзакциях и не может быть удалён")
        } else {
          alert(msg)
        }
      } finally {
        setDeletingIncomeSourceId(null)
      }
    },
    [closeIncomeSourceSheet, refetchIncomeSources, token]
  )

  const accountItems: CardItem[] = accounts.map((account, idx) => {
    const bg = account.color ?? DEFAULT_ACCOUNT_COLOR
    const txt = pickTextColor(bg)
    return {
      id: account.id,
      title: account.name,
      amount: account.balance.amount,
      financeIconKey: isFinanceIconKey(account.icon ?? "") ? (account.icon as string) : null,
      icon: idx % 2 === 0 ? "wallet" : "card",
      color: bg,
      textColor: txt,
      type: "account" as const,
      size: "lg",
    }
  })

  const accountsToRender = accountItems

  const expenseCategories = categories.filter((c) => c.type === "expense")

const incomeItems: CardItem[] = incomeSources.map((src, idx) => ({
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

  const handleSaveAccount = async () => {
    const tokenLocal = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    if (!tokenLocal) return
    if (!name.trim()) return
    const parsed = Number(balance.trim().replace(",", "."))
    if (!Number.isFinite(parsed)) return
    const balanceNumber = Math.round(parsed * 100) / 100
    try {
      setAccountActionError(null)
      const currentAccount = accounts.find((a) => a.id === editingAccountId)
      const currentBalance = currentAccount?.balance.amount
      const balanceChanged =
        typeof currentBalance === "number" ? Math.round(currentBalance * 100) / 100 !== balanceNumber : false
      const needUpdateAccount =
        editingAccountId &&
        (name.trim() !== currentAccount?.name ||
          accountColor !== (currentAccount as { color?: string })?.color ||
          accountIcon !== (currentAccount as { icon?: string | null })?.icon)

      if (editingAccountId) {
        if (needUpdateAccount) {
          await updateAccount(tokenLocal, editingAccountId, {
            name: name.trim(),
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
          name: name.trim(),
          type: type || "cash",
          currency: baseCurrency,
          balance: balanceNumber,
          color: accountColor,
          icon: accountIcon ?? null,
        })
      }
      await refetchAccountsSeq()
      await refetchTransactions()
      closeAccountSheet()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setAccountActionError(err instanceof Error ? err.message : "Не удалось сохранить счёт")
    }
  }

  const maxExpenseAmount = Math.max(0, ...expenseItems.map((i) => i.amount))
  const sizedExpenseItems = expenseItems.map((i) => ({ ...i, size: i.size ?? computeSize(i.amount, maxExpenseAmount) }))

  const expenseToRender = [...sizedExpenseItems]

  const goalsItems: CardItem[] = [{ id: "goals-entry", title: "Мои цели", amount: 0, icon: "goal", color: "#0f172a", type: "goal" }]

  const debtsItems: CardItem[] = [
    { id: "debt-bank", title: "Банк", amount: 0, icon: "bank", color: "#ea580c" },
    { id: "debt-friend", title: "Друзья", amount: 0, icon: "repeat", color: "#1e293b" },
  ]

  const addCard = (suffix: string): CardItem => ({
    id: `add-${suffix}`,
    title: "Добавить",
    amount: 0,
    icon: "plus",
    color: "transparent",
    isAdd: true,
  })

  const summaryBalance = accounts.reduce((sum, acc) => sum + acc.balance.amount, 0)
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
  paddingRight: 2,
}

const txDateHeaderStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
} as const

const goalProgressLabel = (current: number, target: number, currency: string) => {
  const safeTarget = target || 1
  const percent = Math.min(100, Math.max(0, Math.floor((current / safeTarget) * 100)))
  return `${formatMoney(current, currency)} / ${formatMoney(target, currency)} (${percent}%)`
}

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

  const displayTransactions = useMemo(() => transactions.filter((t) => t.type !== "adjustment"), [transactions])

  const accountTx = useMemo(() => {
    if (!detailAccountId) return []
    return displayTransactions
      .filter(
        (t) =>
          t.accountId === detailAccountId ||
          t.toAccountId === detailAccountId ||
          (t.type === "transfer" && t.accountId === detailAccountId)
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [detailAccountId, displayTransactions])

  const categoryTx = useMemo(() => {
    if (!detailCategoryId) return []
    return displayTransactions
      .filter((t) => t.type === "expense" && t.categoryId === detailCategoryId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [detailCategoryId, displayTransactions])

  const incomeSourceTx = useMemo(() => {
    if (!detailIncomeSourceId) return []
    return displayTransactions
      .filter((t) => t.type === "income" && t.incomeSourceId === detailIncomeSourceId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
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
    else if (accountPeriodType === "year") end.setFullYear(end.getFullYear() + 1)
    else end.setDate(end.getDate() + 1)
    const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    const endPrev = new Date(end.getTime() - 1)
    return { start, end, label: `${fmt.format(start)} - ${fmt.format(endPrev)}` }
  }, [accountPeriodType, customFrom, customTo])

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
      const title =
        tx.type === "income"
          ? incomeSourceNameById.get(tx.incomeSourceId ?? "") ?? "Доход"
          : tx.type === "expense"
          ? categoryNameById.get(tx.categoryId ?? "") ?? "Расход"
          : "Перевод"
      return title.toLowerCase().includes(query) || amountText.includes(query)
    })
  }, [accountPeriod, accountSearch, accountTx, categoryNameById, detailAccountId, incomeSourceNameById])

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
    const groups = new Map<string, Transaction[]>()
    filteredAccountTx.forEach((tx) => {
      const key = tx.date.slice(0, 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(tx)
    })
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        dateLabel: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(date)),
        items: items.sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
  }, [filteredAccountTx])

  const groupedCategoryTx = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    filteredCategoryTx.forEach((tx) => {
      const key = tx.date.slice(0, 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(tx)
    })
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        dateLabel: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(date)),
        items: items.sort((a, b) => (a.date < b.date ? 1 : -1)),
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
    const groups = new Map<string, Transaction[]>()
    filteredIncomeSourceTx.forEach((tx) => {
      const key = tx.date.slice(0, 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(tx)
    })
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        dateLabel: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(date)),
        items: items.sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
  }, [filteredIncomeSourceTx])

  const goalTx = useMemo(() => {
    if (!detailGoalId) return []
    return displayTransactions.filter((t) => t.type !== "adjustment" && t.goalId === detailGoalId)
  }, [detailGoalId, displayTransactions])

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
      const name = tx.accountName ?? "Операция"
      const amountText = String(Math.abs(tx.amount.amount))
      return name.toLowerCase().includes(query) || amountText.includes(query)
    })
  }, [accountPeriod, detailGoalId, goalSearch, goalTx])

  const groupedGoalTx = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    filteredGoalTx.forEach((tx) => {
      const key = tx.date.slice(0, 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(tx)
    })
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        dateLabel: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(date)),
        items: items.sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
  }, [filteredGoalTx])

  return (
    <div className="overview">
      <div className="overview__header">
        <div className="overview__header-spacer" />
        <button type="button" className="profile-selector">
          <span className="profile-selector__label">default</span>
          <span className="profile-selector__caret">▾</span>
        </button>
        <div className="overview__month">{monthLabel}</div>
      </div>

      <section className="summary">
        <div className="summary__pill">
          <div className="summary__col">
            <div className="summary__label">РАСХОДЫ</div>
            <div className="summary__value summary__value--negative">{formatMoney(expenseSum, baseCurrency)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">БАЛАНС</div>
            <div className="summary__value">{formatMoney(summaryBalance, baseCurrency)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">ДОХОДЫ</div>
            <div className="summary__value summary__value--positive">{formatMoney(incomeSum, baseCurrency)}</div>
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
        items={goalsItems}
        rowScroll
        baseCurrency={baseCurrency}
        onGoalClick={() => {
          setDetailGoalId(null)
          void openGoalsList()
        }}
      />
      <Section title="Долги / Кредиты" items={[...debtsItems, addCard("debts")]} rowScroll baseCurrency={baseCurrency} />

      {(detailAccountId || detailCategoryId || detailIncomeSourceId || detailGoalId) && (
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
                {detailTitle || detailGoal?.name || "Детали"}
              </div>
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

                <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setIsPeriodMenuOpen(true)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      background: "#f8fafc",
                      fontWeight: 600,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      width: "fit-content",
                    }}
                  >
                    Период
                    <span style={{ fontSize: 12, color: "#6b7280" }}>▾</span>
                  </button>

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
                    const isIncome = tx.type === "income"
                    const isExpense = tx.type === "expense"
                    const sign = isIncome ? "+" : isExpense ? "-" : ""
                    const color = isIncome ? "#16a34a" : "#0f172a"
                    const amountText = `${sign}${formatMoney(tx.amount.amount, baseCurrency)}`
                    return (
                      <div
                        key={tx.id}
                        style={{ ...txRowStyle, marginTop: idx === 0 ? 0 : 6 }}
                        onClick={() => openTxActions(tx.id)}
                      >
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 500, color: "#0f172a", fontSize: 14.5 }}>
                            {tx.type === "income"
                              ? incomeSourceNameById.get(tx.incomeSourceId ?? "") ?? "Доход"
                              : tx.type === "expense"
                              ? categoryNameById.get(tx.categoryId ?? "") ?? "Расход"
                              : "Перевод"}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 600, color, textAlign: "right", fontSize: 13.5 }}>{amountText}</div>
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
                              cursor: "pointer",
                              fontSize: 16,
                              lineHeight: 1,
                            }}
                          >
                            ✎
                          </button>
                        </div>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setIsPeriodMenuOpen(true)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        fontWeight: 600,
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "fit-content",
                      }}
                    >
                      Период
                      <span style={{ fontSize: 12, color: "#6b7280" }}>▾</span>
                    </button>

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
                      return (
                        <div
                          key={tx.id}
                          style={{ ...txRowStyle, marginTop: idx === 0 ? 0 : 6 }}
                          onClick={() => openTxActions(tx.id)}
                        >
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 15 }}>{displayAccountName}</div>
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
                                cursor: "pointer",
                                fontSize: 16,
                                lineHeight: 1,
                              }}
                            >
                              ✎
                            </button>
                          </div>
                        </div>
                      )
                    }}
                  />
                    <button
                      type="button"
                      onClick={() => {
                        if (detailCategoryId) {
                        setPendingCategoryEdit({ id: detailCategoryId, title: detailTitle || "Категория" })
                        closeDetails()
                      }
                      }}
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
                      Редактировать категорию
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
                  <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setIsPeriodMenuOpen(true)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        fontWeight: 600,
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "fit-content",
                      }}
                    >
                      Период
                      <span style={{ fontSize: 12, color: "#6b7280" }}>▾</span>
                    </button>

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
                      const amountText = `${formatMoney(tx.amount.amount, baseCurrency)}`
                      return (
                        <div
                          key={tx.id}
                          style={{ ...txRowStyle, marginTop: idx === 0 ? 0 : 6 }}
                          onClick={() => openTxActions(tx.id)}
                        >
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 15 }}>{displayAccountName}</div>
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
                                cursor: "pointer",
                                fontSize: 16,
                                lineHeight: 1,
                              }}
                            >
                              ✎
                            </button>
                          </div>
                        </div>
                      )
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      if (detailIncomeSourceId) {
                        setPendingIncomeSourceEdit({ id: detailIncomeSourceId, title: detailTitle || "Источник" })
                        closeDetails()
                      }
                    }}
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
                    Редактировать источник
                  </button>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setIsPeriodMenuOpen(true)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        fontWeight: 600,
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "fit-content",
                      }}
                    >
                      Период
                      <span style={{ fontSize: 12, color: "#6b7280" }}>▾</span>
                    </button>

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
                      return (
                        <div
                          key={tx.id}
                          style={{ ...txRowStyle, marginTop: idx === 0 ? 0 : 6 }}
                          onClick={() => openTxActions(tx.id)}
                        >
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 15 }}>{displayName}</div>
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
                                cursor: "pointer",
                                fontSize: 16,
                                lineHeight: 1,
                              }}
                            >
                              ✎
                            </button>
                          </div>
                        </div>
                      )
                    }}
                  />

                  <div style={{ display: "flex", gap: 10, marginTop: 4, justifyContent: "space-between" }}>
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
                    <button
                      type="button"
                      onClick={async () => {
                        if (!token || !detailGoalId) return
                        setIsSavingGoal(true)
                        try {
                          await updateGoal(token, detailGoalId, { status: "completed" })
                          await refetchGoals()
                          closeDetails()
                          setPendingOpenGoalsList(true)
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Не удалось завершить цель"
                          setGoalError(msg)
                        } finally {
                          setIsSavingGoal(false)
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid #0f172a",
                        background: "#0f172a",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Завершить цель
                    </button>
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
                onClick={() => {
                  if (detailAccountId) {
                    openEditAccountFromDetails(detailAccountId)
                  }
                }}
              >
                Редактировать счет
              </button>
            )}
          </div>
        </div>
      )}

      {isGoalSheetOpen && (
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
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Создать цель</div>
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

            {goalError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{goalError}</div> : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Название</span>
              <input
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder="Например, Путешествие"
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

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#475569" }}>Сумма</span>
              <input
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
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
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Мои цели</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={openCreateGoal}
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                type="button"
                onClick={() => setGoalTab("active")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: goalTab === "active" ? "1px solid #0f172a" : "1px solid #e5e7eb",
                  background: goalTab === "active" ? "#0f172a" : "#f8fafc",
                  color: goalTab === "active" ? "#fff" : "#0f172a",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Активные цели
              </button>
              <button
                type="button"
                onClick={() => setGoalTab("completed")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: goalTab === "completed" ? "1px solid #0f172a" : "1px solid #e5e7eb",
                  background: goalTab === "completed" ? "#0f172a" : "#f8fafc",
                  color: goalTab === "completed" ? "#fff" : "#0f172a",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Завершенные цели
              </button>
            </div>

            <div style={txListContainerStyle}>
              <div style={txScrollableStyle}>
                {filteredGoals.length === 0 ? (
                  <div style={{ padding: "12px 4px", fontSize: 14, color: "#6b7280" }}>Пока нет целей</div>
                ) : (
                  filteredGoals.map((goal, idx) => {
                    const percent = goal.targetAmount > 0 ? Math.min(100, Math.max(0, (goal.currentAmount / goal.targetAmount) * 100)) : 0
                    const isLast = idx === filteredGoals.length - 1
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => {
                          setDetailGoalId(goal.id)
                          setIsGoalsListOpen(false)
                          setGoalSearch("")
                        }}
                        style={{
                          display: "grid",
                          gap: 8,
                          padding: 8,
                          borderRadius: 12,
                          border: "none",
                          textAlign: "left",
                          background: "transparent",
                          width: "100%",
                          borderBottom: isLast ? "none" : "1px solid #e5e7eb",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" }}>
                            {goal.icon && isFinanceIconKey(goal.icon) ? <FinanceIcon iconKey={goal.icon} size="md" /> : null}
                          </div>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>{goal.name}</div>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${percent}%`,
                              background: "#0f172a",
                              transition: "width 0.2s ease",
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 13, color: "#475569" }}>
                          {goalProgressLabel(goal.currentAmount, goal.targetAmount, baseCurrency)}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
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
                    disabled={txLoading}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #fee2e2",
                      background: txLoading ? "#fecdd3" : "#b91c1c",
                      color: "#fff",
                      flex: 1,
                      cursor: txLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {txLoading ? "Удаляем…" : "Удалить"}
                  </button>
                </div>
              </div>
            ) : null}

            {txMode === "edit" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Редактировать операцию</div>
                {txError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{txError}</div> : null}
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Тип</span>
                  <select
                    value={editKind}
                    onChange={(e) => setEditKind(e.target.value as TxKind)}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    disabled={txLoading}
                  >
                    <option value="expense">Расход</option>
                    <option value="income">Доход</option>
                    <option value="transfer">Перевод</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Сумма</span>
                  <input
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    inputMode="decimal"
                    disabled={txLoading}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Дата</span>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    disabled={txLoading}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                </label>

                {editKind === "transfer" ? (
                  <>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 13, color: "#4b5563" }}>Со счёта</span>
                      <select
                        value={editAccountId}
                        onChange={(e) => setEditAccountId(e.target.value)}
                        disabled={txLoading || accounts.length < 1}
                        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 13, color: "#4b5563" }}>На счёт</span>
                      <select
                        value={editToAccountId}
                        onChange={(e) => setEditToAccountId(e.target.value)}
                        disabled={txLoading || accounts.length < 2}
                        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                      >
                        {accounts
                          .filter((a) => a.id !== editAccountId)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#4b5563" }}>Счёт</span>
                    <select
                      value={editAccountId}
                      onChange={(e) => setEditAccountId(e.target.value)}
                      disabled={txLoading || accounts.length === 0}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {editKind === "expense" ? (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#4b5563" }}>Категория</span>
                    <select
                      value={editCategoryId}
                      onChange={(e) => setEditCategoryId(e.target.value)}
                      disabled={txLoading}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">Без категории</option>
                      {categories
                        .filter((c) => c.type === "expense")
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}

                {editKind === "income" ? (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#4b5563" }}>Источник дохода</span>
                    <select
                      value={editIncomeSourceId}
                      onChange={(e) => setEditIncomeSourceId(e.target.value)}
                      disabled={txLoading}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">Без источника</option>
                      {incomeSources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Комментарий</span>
                  <input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    disabled={txLoading}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                </label>

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
                    onClick={handleSaveEdit}
                    disabled={txLoading}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #0f172a",
                      background: txLoading ? "#e5e7eb" : "#0f172a",
                      color: txLoading ? "#6b7280" : "#fff",
                      flex: 1,
                      cursor: txLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {txLoading ? "Сохраняем…" : "Сохранить"}
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
                            fontSize: 14,
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
            alignItems: editingAccountId ? "center" : "flex-end",
            justifyContent: "center",
            zIndex: 40,
            paddingTop: editingAccountId ? 40 : 0,
            paddingLeft: editingAccountId ? 24 : 0,
            paddingRight: editingAccountId ? 24 : 0,
            paddingBottom: editingAccountId ? "calc(40px + env(safe-area-inset-bottom, 0px))" : 0,
          }}
          onClick={closeAccountSheet}
        >
          <div
            style={{
              width: "100%",
              maxWidth: editingAccountId ? 420 : 540,
              background: "#fff",
              borderRadius: editingAccountId ? 20 : undefined,
              borderTopLeftRadius: editingAccountId ? 20 : 16,
              borderTopRightRadius: editingAccountId ? 20 : 16,
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
                      background: "#f8fafc",
                      borderRadius: 18,
                      padding: 16,
                      display: "grid",
                      gap: 12,
                      border: "1px solid #e5e7eb",
                      boxShadow: "none",
                    }}
                  >
                    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                      Название
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Введите название"
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          fontSize: 16,
                          outline: "none",
                          boxShadow: "none",
                          background: "#fff",
                          color: "#0f172a",
                        }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                      {editingAccountId ? "Баланс" : "Стартовый баланс"}
                      <input
                        value={balance}
                        onChange={(e) => setBalance(e.target.value)}
                        inputMode="decimal"
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          fontSize: 16,
                          background: editingAccountId ? "#fff" : "#f1f5f9",
                          outline: "none",
                          boxShadow: "none",
                          color: "#0f172a",
                        }}
                      />
                    </label>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Иконка</div>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountSheetIntent("openAccountIconPicker")
                          setIsAccountSheetOpen(false)
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
                  <button
                    type="button"
                    onClick={handleSaveAccount}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Сохранить
                  </button>
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
                            onClick={async () => {
                              const tokenLocal = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
                              if (!tokenLocal || !editingAccountId) return
                              try {
                                setAccountActionError(null)
                                await deleteAccount(tokenLocal, editingAccountId)
                                await refetchAccountsSeq()
                                await refetchTransactions()
                                closeAccountSheet()
                              } catch (err) {
                                if (err instanceof DOMException && err.name === "AbortError") return
                                setAccountActionError(err instanceof Error ? err.message : "Не удалось удалить счёт")
                              } finally {
                                setIsConfirmingDelete(false)
                              }
                            }}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid #fee2e2",
                              background: "#fff",
                              color: "#b91c1c",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Подтвердить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountActionError(null)
                            setIsConfirmingDelete(true)
                          }}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #fee2e2",
                            background: "#fff",
                            color: "#b91c1c",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    )
                  ) : null}
                  {accountActionError ? (
                    <div style={{ color: "#b91c1c", fontSize: 13, textAlign: "center" }}>{accountActionError}</div>
                  ) : null}
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
                      background: accountColor,
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
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.35)",
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
                  <button
                    type="button"
                    onClick={handleSaveAccount}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Создать
                  </button>
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
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 45,
            padding: "0 12px 12px",
          }}
          onClick={() => closeCategorySheet()}
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
                  style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 16 }}
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
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {categoryIcon && isFinanceIconKey(categoryIcon) ? <FinanceIcon iconKey={categoryIcon} size={16} /> : null}
                    <span style={{ fontSize: 15 }}>
                      {categoryIcon && isFinanceIconKey(categoryIcon) ? categoryIcon : "Не выбрано"}
                    </span>
                  </span>
                  <span style={{ fontSize: 16, color: "#9ca3af" }}>▾</span>
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {categorySheetMode === "edit" && editingCategoryId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(editingCategoryId)}
                    disabled={deletingCategoryId === editingCategoryId}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #fee2e2",
                      background: deletingCategoryId === editingCategoryId ? "#fecdd3" : "#fff",
                      color: "#b91c1c",
                      cursor: deletingCategoryId === editingCategoryId ? "not-allowed" : "pointer",
                      width: "100%",
                    }}
                  >
                    {deletingCategoryId === editingCategoryId ? "Удаляем…" : "Удалить"}
                  </button>
                ) : (
                  <div />
                )}
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
                  disabled={isSavingCategory}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: isSavingCategory ? "#e5e7eb" : "#0f172a",
                    color: isSavingCategory ? "#6b7280" : "#fff",
                    fontWeight: 600,
                    cursor: isSavingCategory ? "not-allowed" : "pointer",
                    width: "100%",
                  }}
                >
                  {isSavingCategory ? "Сохраняем…" : "Сохранить"}
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
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 45,
            padding: "0 12px 12px",
          }}
          onClick={() => closeIncomeSourceSheet()}
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
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              {incomeSourceSheetMode === "create" ? "Новый источник дохода" : "Редактировать источник"}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                value={incomeSourceName}
                onChange={(e) => setIncomeSourceName(e.target.value)}
                placeholder="Название"
                style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 16 }}
              />
              <input
                value={incomeSourceBudget}
                onChange={(e) => setIncomeSourceBudget(e.target.value)}
                placeholder="Бюджет"
                inputMode="decimal"
                style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 16 }}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {incomeSourceSheetMode === "edit" && editingIncomeSourceId ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteIncomeSource(editingIncomeSourceId)}
                      disabled={deletingIncomeSourceId === editingIncomeSourceId}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #fee2e2",
                        background: deletingIncomeSourceId === editingIncomeSourceId ? "#fecdd3" : "#fff",
                        color: "#b91c1c",
                        cursor: deletingIncomeSourceId === editingIncomeSourceId ? "not-allowed" : "pointer",
                        width: "100%",
                      }}
                    >
                      {deletingIncomeSourceId === editingIncomeSourceId ? "Удаляем…" : "Удалить"}
                    </button>
                ) : (
                  <div />
                )}
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
                  disabled={isSavingIncomeSource}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: isSavingIncomeSource ? "#e5e7eb" : "#0f172a",
                    color: isSavingIncomeSource ? "#6b7280" : "#fff",
                    cursor: isSavingIncomeSource ? "not-allowed" : "pointer",
                    width: "100%",
                  }}
                >
                  {isSavingIncomeSource ? "Сохраняем…" : "Сохранить"}
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
