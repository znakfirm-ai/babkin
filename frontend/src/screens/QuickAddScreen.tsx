import { useMemo, useState, useCallback, useRef, useEffect, type CSSProperties, type PointerEvent, type UIEvent } from "react"
import { useAppStore } from "../store/useAppStore"
import { formatMoney, normalizeCurrency } from "../utils/formatMoney"
import { createTransaction, getTransactions } from "../api/transactions"
import { getAccounts } from "../api/accounts"
import { AppIcon, type IconName } from "../components/AppIcon"
import { FinanceIcon, isFinanceIconKey } from "../shared/icons/financeIcons"
import { getAccountDisplay, getCategoryDisplay, getGoalDisplay, getIncomeSourceDisplay } from "../shared/display"
import { GoalList } from "../components/GoalList"
import { DebtorList } from "../components/DebtorList"
import { contributeGoal, getGoals, type GoalDto } from "../api/goals"
import { getDebtors } from "../api/debtors"
import { getReadableTextColor } from "../utils/getReadableTextColor"
import { useSingleFlight } from "../hooks/useSingleFlight"
import { buildMonthlyTransactionMetrics, getLocalMonthPoint } from "../utils/monthlyTransactionMetrics"
import { getTransactionErrorMessage } from "../utils/transactionErrorMessage"
import type { Debtor } from "../types/finance"

const getTodayLocalDate = () => {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const toPositiveNumberOrZero = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const pickDebtTotal = (debtor: Debtor) => {
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

export const DateIconButton: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => (
  <label
    style={{
      position: "relative",
      width: 48,
      height: 48,
      flex: "0 0 48px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      background: "#fff",
    }}
  >
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0,
        width: "100%",
        height: "100%",
        cursor: "pointer",
      }}
    />
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="M16 14h-2.5a2.5 2.5 0 1 0 0 5H16" />
      <path d="M18 20v-6" />
    </svg>
  </label>
)

const AmountDateRow: React.FC<{
  amount: string
  onAmountChange: (val: string) => void
  date: string
  onDateChange: (val: string) => void
}> = ({ amount, onAmountChange, date, onDateChange }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
    <input
      value={amount}
      onChange={(e) => onAmountChange(e.target.value)}
      placeholder="Сумма"
      inputMode="decimal"
      style={{
        flex: 1,
        minWidth: 0,
        padding: 12,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        fontSize: 16,
        outline: "none",
        boxShadow: "none",
      }}
    />
    <DateIconButton value={date} onChange={onDateChange} />
  </div>
)

type QuickAddTab = "expense" | "income" | "transfer" | "debt" | "goal"

type Props = {
  onClose: () => void
  onOpenCreateGoal?: () => void
}

export const QuickAddScreen: React.FC<Props> = ({ onClose, onOpenCreateGoal }) => {
  const { accounts, categories, incomeSources, goals, debtors, transactions, setAccounts, setTransactions, setGoals, setDebtors, currency } =
    useAppStore()
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null), [])
  const baseCurrency = normalizeCurrency(currency || "RUB")

  const [activeTab, setActiveTab] = useState<QuickAddTab>("expense")
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedIncomeSourceId, setSelectedIncomeSourceId] = useState<string | null>(null)
  const [transferFromAccountId, setTransferFromAccountId] = useState<string | null>(null)
  const [transferToAccountId, setTransferToAccountId] = useState<string | null>(null)
  const [transferTargetType, setTransferTargetType] = useState<"account" | "goal" | "debt">("account")
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [debtAction, setDebtAction] = useState<"receivable" | "payable">("receivable")
  const [selectedDebtAccountId, setSelectedDebtAccountId] = useState<string | null>(null)
  const [selectedReceivableDebtorId, setSelectedReceivableDebtorId] = useState<string | null>(null)
  const [selectedPayableDebtorId, setSelectedPayableDebtorId] = useState<string | null>(null)
  const [transferDate, setTransferDate] = useState(() => getTodayLocalDate())
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [visualViewportShift, setVisualViewportShift] = useState(0)
  const [footerBasePx, setFooterBasePx] = useState(56)
  const [showTransferDebtScrollHint, setShowTransferDebtScrollHint] = useState(false)
  const [transferDebtListScrolled, setTransferDebtListScrolled] = useState(false)
  const [showTransferGoalScrollHint, setShowTransferGoalScrollHint] = useState(false)
  const [transferGoalListScrolled, setTransferGoalListScrolled] = useState(false)
  const [showDebtReceivableScrollHint, setShowDebtReceivableScrollHint] = useState(false)
  const [debtReceivableListScrolled, setDebtReceivableListScrolled] = useState(false)
  const [showDebtPayableScrollHint, setShowDebtPayableScrollHint] = useState(false)
  const [debtPayableListScrolled, setDebtPayableListScrolled] = useState(false)
  const goalsFetchInFlight = useRef(false)
  const visualViewportShiftRef = useRef(0)
  const footerBasePxRef = useRef(56)
  const dismissStartPointRef = useRef<{ x: number; y: number } | null>(null)
  const dismissMovedRef = useRef(false)
  const transferDebtListRef = useRef<HTMLDivElement | null>(null)
  const transferGoalListRef = useRef<HTMLDivElement | null>(null)
  const debtReceivableListRef = useRef<HTMLDivElement | null>(null)
  const debtPayableListRef = useRef<HTMLDivElement | null>(null)
  const { run, isRunning } = useSingleFlight()

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories])
  const incomeSourcesList = useMemo(() => incomeSources, [incomeSources])
  const activeGoals = useMemo(() => goals.filter((goal) => goal.status === "active"), [goals])
  const receivablePaidByDebtorId = useMemo(() => {
    const paidById: Record<string, number> = {}
    transactions.forEach((tx) => {
      if (!tx.debtorId) return
      const isReceivableReturn = tx.type === "transfer" && Boolean(tx.toAccountId) && !tx.fromAccountId && !tx.goalId
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
  const activeReceivableDebtors = useMemo(
    () =>
      debtors
        .filter((debtor) => debtor.direction === "receivable" && debtor.status === "active" && pickDebtTotal(debtor) > 0)
        .map((debtor) => ({
          ...debtor,
          paidAmount: receivablePaidByDebtorId[debtor.id] ?? debtor.paidAmount ?? 0,
        })),
    [debtors, receivablePaidByDebtorId],
  )
  const activePayableDebtors = useMemo(
    () =>
      debtors
        .filter((debtor) => debtor.direction === "payable" && debtor.status === "active" && pickDebtTotal(debtor) > 0)
        .map((debtor) => ({
          ...debtor,
          paidAmount: payablePaidByDebtorId[debtor.id] ?? debtor.paidAmount ?? 0,
        })),
    [debtors, payablePaidByDebtorId],
  )
  const currentMonthPoint = getLocalMonthPoint()
  const monthlyMetrics = useMemo(
    () => buildMonthlyTransactionMetrics(transactions, currentMonthPoint),
    [currentMonthPoint.monthIndex, currentMonthPoint.year, transactions],
  )
  const spendByCategory = monthlyMetrics.expenseByCategory
  const incomeBySource = monthlyMetrics.incomeBySource

  const accountsById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts])
  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const incomeSourcesById = useMemo(() => Object.fromEntries(incomeSources.map((s) => [s.id, s])), [incomeSources])
  const activeGoalsById = useMemo(() => Object.fromEntries(activeGoals.map((g) => [g.id, g])), [activeGoals])
  const hScrollRowStyle = useMemo(
    () =>
      ({
        paddingBottom: 6,
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-x",
        overscrollBehaviorX: "contain",
      }) as const,
    [],
  )
  const debtListScrollContainerStyle = useMemo(
    () =>
      ({
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 8,
        maxHeight: 181,
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
      }) as const,
    [],
  )
  const quickAddLayoutVars = useMemo(
    () =>
      ({
        "--qa-vv-shift": `${visualViewportShift}px`,
        "--qa-footer-base": `${footerBasePx}px`,
        "--qa-footer-h": "136px",
      }) as CSSProperties,
    [footerBasePx, visualViewportShift],
  )
  const stickyFooterStyle = useMemo(
    () =>
      ({
        borderTop: "1px solid #e5e7eb",
        paddingTop: 12,
        display: "grid",
        gap: 6,
        position: "fixed",
        left: "max(16px, calc((100vw - 480px) / 2 + 16px))",
        right: "max(16px, calc((100vw - 480px) / 2 + 16px))",
        bottom: "calc(env(safe-area-inset-bottom,0px) + var(--qa-footer-base, 0px))",
        transform: "translateY(var(--qa-vv-shift))",
        zIndex: 8,
        background: "#f5f6f8",
      }) as const,
    [],
  )

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined" || typeof document === "undefined") return
    const viewportWidth = window.innerWidth
    const docWidth = document.documentElement.scrollWidth
    if (docWidth <= viewportWidth + 1) return
    const offenders = Array.from(document.body.querySelectorAll("*"))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return { element, rect }
      })
      .filter(({ rect }) => rect.right > viewportWidth + 1 || rect.left < -1)
      .slice(0, 20)
      .map(({ element, rect }) => ({
        tag: element.tagName.toLowerCase(),
        className: (element as HTMLElement).className || "",
        dataHscroll: (element as HTMLElement).dataset?.hscroll || "",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }))

    console.warn("[QuickAdd overflow-x]", {
      viewportWidth,
      docWidth,
      offenders,
    })
  }, [])

  useEffect(() => {
    if (!selectedGoalId) return
    const existsInActive = activeGoals.some((goal) => goal.id === selectedGoalId)
    if (!existsInActive) {
      setSelectedGoalId(null)
    }
  }, [activeGoals, selectedGoalId])

  useEffect(() => {
    if (!selectedReceivableDebtorId) return
    const exists = activeReceivableDebtors.some((debtor) => debtor.id === selectedReceivableDebtorId)
    if (!exists) {
      setSelectedReceivableDebtorId(null)
    }
  }, [activeReceivableDebtors, selectedReceivableDebtorId])

  useEffect(() => {
    if (!selectedPayableDebtorId) return
    const exists = activePayableDebtors.some((debtor) => debtor.id === selectedPayableDebtorId)
    if (!exists) {
      setSelectedPayableDebtorId(null)
    }
  }, [activePayableDebtors, selectedPayableDebtorId])

  useEffect(() => {
    if (activeTab !== "transfer" || transferTargetType !== "debt") {
      setShowTransferDebtScrollHint(false)
      setTransferDebtListScrolled(false)
      return
    }
    const el = transferDebtListRef.current
    if (!el) {
      setShowTransferDebtScrollHint(false)
      return
    }
    const canScroll = el.scrollHeight > el.clientHeight + 1
    setShowTransferDebtScrollHint(canScroll && !transferDebtListScrolled && el.scrollTop <= 0)
  }, [activePayableDebtors.length, activeTab, transferDebtListScrolled, transferTargetType])

  const handleTransferDebtListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (transferDebtListScrolled) return
    if (event.currentTarget.scrollTop > 0) {
      setTransferDebtListScrolled(true)
      setShowTransferDebtScrollHint(false)
    }
  }, [transferDebtListScrolled])

  useEffect(() => {
    if (activeTab !== "transfer" || transferTargetType !== "goal") {
      setShowTransferGoalScrollHint(false)
      setTransferGoalListScrolled(false)
      return
    }
    const el = transferGoalListRef.current
    if (!el) {
      setShowTransferGoalScrollHint(false)
      return
    }
    const canScroll = el.scrollHeight > el.clientHeight + 1
    setShowTransferGoalScrollHint(canScroll && !transferGoalListScrolled && el.scrollTop <= 0)
  }, [activeGoals.length, activeTab, transferGoalListScrolled, transferTargetType])

  const handleTransferGoalListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (transferGoalListScrolled) return
    if (event.currentTarget.scrollTop > 0) {
      setTransferGoalListScrolled(true)
      setShowTransferGoalScrollHint(false)
    }
  }, [transferGoalListScrolled])

  useEffect(() => {
    if (activeTab !== "debt" || debtAction !== "receivable") {
      setShowDebtReceivableScrollHint(false)
      setDebtReceivableListScrolled(false)
      return
    }
    const el = debtReceivableListRef.current
    if (!el) {
      setShowDebtReceivableScrollHint(false)
      return
    }
    const canScroll = el.scrollHeight > el.clientHeight + 1
    setShowDebtReceivableScrollHint(canScroll && !debtReceivableListScrolled && el.scrollTop <= 0)
  }, [activeReceivableDebtors.length, activeTab, debtAction, debtReceivableListScrolled])

  const handleDebtReceivableListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (debtReceivableListScrolled) return
    if (event.currentTarget.scrollTop > 0) {
      setDebtReceivableListScrolled(true)
      setShowDebtReceivableScrollHint(false)
    }
  }, [debtReceivableListScrolled])

  useEffect(() => {
    if (activeTab !== "debt" || debtAction !== "payable") {
      setShowDebtPayableScrollHint(false)
      setDebtPayableListScrolled(false)
      return
    }
    const el = debtPayableListRef.current
    if (!el) {
      setShowDebtPayableScrollHint(false)
      return
    }
    const canScroll = el.scrollHeight > el.clientHeight + 1
    setShowDebtPayableScrollHint(canScroll && !debtPayableListScrolled && el.scrollTop <= 0)
  }, [activePayableDebtors.length, activeTab, debtAction, debtPayableListScrolled])

  const handleDebtPayableListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (debtPayableListScrolled) return
    if (event.currentTarget.scrollTop > 0) {
      setDebtPayableListScrolled(true)
      setShowDebtPayableScrollHint(false)
    }
  }, [debtPayableListScrolled])

  useEffect(() => {
    if (typeof window === "undefined") return
    const viewport = window.visualViewport
    if (!viewport) {
      if (visualViewportShiftRef.current !== 0) {
        visualViewportShiftRef.current = 0
        setVisualViewportShift(0)
      }
      return
    }

    const applyShift = (nextShift: number) => {
      if (Math.abs(nextShift - visualViewportShiftRef.current) < 2) return
      visualViewportShiftRef.current = nextShift
      setVisualViewportShift(nextShift)
    }
    const applyFooterBase = (nextBase: number) => {
      if (Math.abs(nextBase - footerBasePxRef.current) < 1) return
      footerBasePxRef.current = nextBase
      setFooterBasePx(nextBase)
    }

    const updateVisualViewportShift = () => {
      const innerHeight = window.innerHeight
      const viewportDelta = innerHeight - viewport.height
      const bottomNavRaw = getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-height")
      const bottomNavPx = Number.parseFloat(bottomNavRaw) || 56
      const keyboardOpen = viewportDelta >= 120
      const keyboardClosed = viewportDelta < 40

      if (keyboardClosed) {
        applyFooterBase(bottomNavPx)
        applyShift(0)
        return
      }

      if (keyboardOpen) {
        applyFooterBase(0)
        const rawShift = -Math.round(Math.max(0, viewportDelta))
        applyShift(rawShift)
        return
      }
    }

    updateVisualViewportShift()
    viewport.addEventListener("resize", updateVisualViewportShift)
    viewport.addEventListener("scroll", updateVisualViewportShift)

    return () => {
      viewport.removeEventListener("resize", updateVisualViewportShift)
      viewport.removeEventListener("scroll", updateVisualViewportShift)
    }
  }, [])

  const isEditableElement = (element: Element | null): element is HTMLElement =>
    element instanceof HTMLElement && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable)

  const handleDismissPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const active = document.activeElement
    if (!isEditableElement(active)) {
      dismissStartPointRef.current = null
      dismissMovedRef.current = false
      return
    }
    dismissStartPointRef.current = { x: event.clientX, y: event.clientY }
    dismissMovedRef.current = false
  }, [])

  const handleDismissPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const startPoint = dismissStartPointRef.current
    if (!startPoint) return
    if (dismissMovedRef.current) return
    const dx = Math.abs(event.clientX - startPoint.x)
    const dy = Math.abs(event.clientY - startPoint.y)
    if (Math.max(dx, dy) > 8) {
      dismissMovedRef.current = true
    }
  }, [])

  const handleDismissPointerCancel = useCallback(() => {
    dismissStartPointRef.current = null
    dismissMovedRef.current = false
  }, [])

  const handleDismissPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const startPoint = dismissStartPointRef.current
    const wasMoved = dismissMovedRef.current
    dismissStartPointRef.current = null
    dismissMovedRef.current = false
    if (!startPoint || wasMoved) return

    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest("[data-quick-add-footer='1']")) return
    if (target.closest("input, textarea, [contenteditable='true']")) return

    const active = document.activeElement
    if (isEditableElement(active)) {
      active.blur()
    }
  }, [])

  const accountTiles = useMemo(
    () =>
      accounts.map((acc) => {
        const display = getAccountDisplay(acc.id, accountsById)
        return {
          id: acc.id,
          title: display.title,
          iconKey: display.iconKey ?? null,
          color: display.color ?? "#EEF2F7",
          text: formatMoney(acc.balance.amount, baseCurrency),
        }
      }),
    [accounts, accountsById, baseCurrency],
  )

  const expenseCategoryTiles = useMemo(
    () =>
      expenseCategories.map((cat) => {
        const display = getCategoryDisplay(cat.id, categoriesById)
        const budget = (cat as { budget?: number | null }).budget ?? null
        const spent = spendByCategory.get(cat.id) ?? 0
        const budgetTone = (() => {
          if (!budget || budget <= 0) return "normal" as const
          const ratio = spent / budget
          if (ratio > 1) return "alert" as const
          if (ratio > 0.7) return "warn" as const
          return "normal" as const
        })()
        return {
          id: cat.id,
          title: display.title,
          iconKey: display.iconKey ?? null,
          amount: spent,
          budget,
          budgetTone,
        }
      }),
    [categoriesById, expenseCategories, spendByCategory],
  )

  const incomeSourceTiles = useMemo(
    () =>
      incomeSourcesList.map((src) => {
        const display = getIncomeSourceDisplay(src.id, incomeSourcesById)
        return {
          id: src.id,
          title: display.title,
          iconKey: display.iconKey ?? null,
          amount: incomeBySource.get(src.id) ?? 0,
          color: "#EEF2F7",
        }
      }),
    [incomeBySource, incomeSourcesById, incomeSourcesList],
  )

  const submitExpense = useCallback(() => {
    if (isRunning) return
    return run(async () => {
    if (!token) {
      setError("Нет токена")
      return
    }
    if (!selectedAccountId || !selectedCategoryId) {
      setError("Выберите счёт и категорию")
      return
    }
    const amt = Number(amount.replace(",", "."))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Введите сумму")
      return
    }
    setError(null)
    try {
      await createTransaction(token, {
        kind: "expense",
        amount: Math.round(amt * 100) / 100,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId,
        happenedAt: `${transferDate}T00:00:00.000Z`,
      })
      const accountsData = await getAccounts(token)
      setAccounts(
        accountsData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        })),
      )
      const txData = await getTransactions(token)
      setTransactions(
        txData.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: { amount: typeof t.amount === "string" ? Number(t.amount) : t.amount, currency: "RUB" },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          accountName: t.accountName ?? null,
          fromAccountId: t.fromAccountId ?? undefined,
          fromAccountName: t.fromAccountName ?? null,
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
          toAccountName: t.toAccountName ?? null,
          goalId: (t as { goalId?: string | null }).goalId ?? undefined,
          goalName: (t as { goalName?: string | null }).goalName ?? null,
          debtorId: (t as { debtorId?: string | null }).debtorId ?? undefined,
          debtorName: (t as { debtorName?: string | null }).debtorName ?? null,
        })),
      )
      onClose()
    } catch (err) {
      setError(getTransactionErrorMessage(err))
    }
    })
  }, [amount, isRunning, onClose, run, selectedAccountId, selectedCategoryId, setAccounts, setTransactions, token])

  const submitIncome = useCallback(() => {
    if (isRunning) return
    return run(async () => {
    if (!token) {
      setError("Нет токена")
      return
    }
    if (!selectedIncomeSourceId || !selectedAccountId) {
      setError("Выберите источник и счёт")
      return
    }
    const amt = Number(amount.replace(",", "."))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Введите сумму")
      return
    }
    setError(null)
    try {
      await createTransaction(token, {
        kind: "income",
        amount: Math.round(amt * 100) / 100,
        accountId: selectedAccountId,
        incomeSourceId: selectedIncomeSourceId,
        happenedAt: `${transferDate}T00:00:00.000Z`,
      })
      const accountsData = await getAccounts(token)
      setAccounts(
        accountsData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        })),
      )
      const txData = await getTransactions(token)
      setTransactions(
        txData.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: { amount: typeof t.amount === "string" ? Number(t.amount) : t.amount, currency: "RUB" },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          accountName: t.accountName ?? null,
          fromAccountId: t.fromAccountId ?? undefined,
          fromAccountName: t.fromAccountName ?? null,
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
          toAccountName: t.toAccountName ?? null,
          goalId: (t as { goalId?: string | null }).goalId ?? undefined,
          goalName: (t as { goalName?: string | null }).goalName ?? null,
          debtorId: (t as { debtorId?: string | null }).debtorId ?? undefined,
          debtorName: (t as { debtorName?: string | null }).debtorName ?? null,
        })),
      )
      setSelectedIncomeSourceId(null)
      setSelectedAccountId(null)
      setAmount("")
      onClose()
    } catch (err) {
      setError(getTransactionErrorMessage(err))
    }
    })
  }, [amount, isRunning, onClose, run, selectedAccountId, selectedIncomeSourceId, setAccounts, setTransactions, token])

  const renderTile = (
    item: {
      id: string
      title: string
      icon?: string
      iconKey?: string | null
      color?: string
      text?: string
      amount?: number
      budget?: number | null
      budgetTone?: "normal" | "warn" | "alert"
    },
    active: boolean,
    kind: "account" | "category" | "income-source" | "goal",
    onSelect?: (id: string) => void,
  ) => (
    (() => {
      const isAccount = kind === "account"
      const bg = isAccount ? item.color ?? "#EEF2F7" : item.color
      const contentColor = isAccount ? getReadableTextColor(bg ?? "#EEF2F7") : "#0f172a"
      const secondaryColor =
        isAccount && contentColor === "#FFFFFF" ? "rgba(255,255,255,0.85)" : "rgba(17,17,17,0.75)"
      const shadow = isAccount && contentColor === "#FFFFFF" ? "0 1px 2px rgba(0,0,0,0.25)" : "none"
      const buttonStyle =
        isAccount && !item.budgetTone
          ? {
              background: bg,
              color: contentColor,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: undefined,
            }
          : {
              background: item.budgetTone
                ? item.budgetTone === "alert"
                  ? "rgba(248,113,113,0.12)"
                  : item.budgetTone === "warn"
                  ? "rgba(251,191,36,0.12)"
                  : bg
                : bg,
              border: item.budgetTone
                ? item.budgetTone === "alert"
                  ? "1px solid #ef4444"
                  : item.budgetTone === "warn"
                  ? "1px solid #f59e0b"
                  : undefined
                : "1px solid rgba(0,0,0,0.08)",
              boxShadow: undefined,
              color: isAccount ? contentColor : "#0f172a",
            }

      return (
        <button
          key={item.id}
          type="button"
          className={`tile-card ${kind === "category" ? "tile-card--category" : "tile-card--account"}${active ? " tile-card--selected" : ""}`}
          onClick={() => {
            if (onSelect) {
              onSelect(item.id)
              return
            }
            if (kind === "account") {
              setSelectedAccountId(item.id)
            } else if (kind === "category") {
              setSelectedCategoryId(item.id)
            } else if (kind === "income-source") {
              setSelectedIncomeSourceId(item.id)
            } else if (kind === "goal") {
              setSelectedGoalId(item.id)
            }
          }}
          style={buttonStyle}
        >
          {active ? <span className="tile-card__selected-check" aria-hidden="true">✓</span> : null}
          <div
            className="tile-card__icon"
            style={
              isAccount
                ? {
                    background: "transparent",
                    color: contentColor,
                    filter: contentColor === "#FFFFFF" ? "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" : "none",
                  }
                : { background: "rgba(15,23,42,0.06)", opacity: 1 }
            }
          >
            {item.iconKey && isFinanceIconKey(item.iconKey) ? (
              <FinanceIcon iconKey={item.iconKey} size={16} />
            ) : item.icon ? (
              <AppIcon name={(item.icon as IconName) ?? "wallet"} size={16} />
            ) : null}
          </div>
          <div
            className="tile-card__title"
            style={isAccount ? { fontWeight: 600, color: secondaryColor, textShadow: shadow } : { fontWeight: 600 }}
          >
            {item.title}
          </div>
          {item.text ? (
            <div style={isAccount ? { fontSize: 12, color: secondaryColor } : { fontSize: 12, color: "#6b7280" } }>
              {item.text}
            </div>
          ) : null}
          {item.amount !== undefined ? (
            <div className="tile-card__amount" style={isAccount ? { color: contentColor, textShadow: shadow } : undefined}>
              {formatMoney(item.amount, baseCurrency)}
            </div>
          ) : null}
          {item.budget != null ? (
            <div style={{ marginTop: 2, fontSize: 9, color: "#6b7280" }}>{formatMoney(item.budget, baseCurrency)}</div>
          ) : null}
        </button>
      )
    })()
  )

  const ensureGoalsLoaded = useCallback(async () => {
    if (!token || goalsFetchInFlight.current) return
    goalsFetchInFlight.current = true
    try {
      const data = await getGoals(token)
      const mapped = data.goals.map((g: GoalDto) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ?? null,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        status: g.status,
      }))
      setGoals(mapped)
    } catch (err) {
      console.error(err)
    } finally {
      goalsFetchInFlight.current = false
    }
  }, [setGoals, token])

  const refetchDebtors = useCallback(async () => {
    if (!token) return
    const data = await getDebtors(token)
    setDebtors(
      data.debtors.map((d) => ({
        id: d.id,
        name: d.name,
        icon: d.icon,
        issuedDate: d.issuedAt.slice(0, 10),
        loanAmount: Number(d.principalAmount),
        dueDate: d.dueAt ? d.dueAt.slice(0, 10) : "",
        returnAmount: d.payoffAmount === null ? Number(d.principalAmount) : Number(d.payoffAmount),
        status: d.status,
        direction: d.direction ?? "receivable",
      })),
    )
  }, [setDebtors, token])

  useEffect(() => {
    if (activeTab === "goal" || (activeTab === "transfer" && transferTargetType === "goal")) {
      void ensureGoalsLoaded()
    }
  }, [activeTab, ensureGoalsLoaded, transferTargetType])

  useEffect(() => {
    if (activeTab === "debt") {
      void refetchDebtors()
    }
  }, [activeTab, refetchDebtors])

  const submitTransfer = useCallback(() => {
    if (isRunning) return
    return run(async () => {
    if (!token) {
      setError("Нет токена")
      return
    }
    const amt = Number(amount.replace(",", "."))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Введите сумму")
      return
    }
    if (transferTargetType === "account") {
      if (!transferFromAccountId || !transferToAccountId) {
        setError("Выберите счета")
        return
      }
      if (transferFromAccountId === transferToAccountId) {
        setError("Счета должны различаться")
        return
      }
    }
    if (transferTargetType === "goal") {
      if (!transferFromAccountId) {
        setError("Выберите счёт")
        return
      }
      if (!selectedGoalId) {
        setError("Выберите цель")
        return
      }
    }
    if (transferTargetType === "debt") {
      if (!transferFromAccountId) {
        setError("Выберите счёт")
        return
      }
      if (!selectedPayableDebtorId) {
        setError("Выберите долг")
        return
      }
    }
    setError(null)
    try {
      if (transferTargetType === "account") {
        const fromId = transferFromAccountId as string
        const toId = transferToAccountId as string
        await createTransaction(token, {
          kind: "transfer",
          amount: Math.round(amt * 100) / 100,
          fromAccountId: fromId,
          toAccountId: toId,
          happenedAt: `${transferDate}T00:00:00.000Z`,
        })
      } else if (transferTargetType === "goal" && selectedGoalId && transferFromAccountId) {
        const fromId = transferFromAccountId as string
        await contributeGoal(token, selectedGoalId, {
          accountId: fromId,
          amount: Math.round(amt * 100) / 100,
          date: `${transferDate}T00:00:00.000Z`,
        })
      } else if (transferTargetType === "debt" && selectedPayableDebtorId && transferFromAccountId) {
        await createTransaction(token, {
          kind: "expense",
          amount: Math.round(amt * 100) / 100,
          accountId: transferFromAccountId,
          debtorId: selectedPayableDebtorId,
          happenedAt: `${transferDate}T00:00:00.000Z`,
        })
      }
      const accountsData = await getAccounts(token)
      setAccounts(
        accountsData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        })),
      )
      const txData = await getTransactions(token)
      setTransactions(
        txData.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: { amount: typeof t.amount === "string" ? Number(t.amount) : t.amount, currency: "RUB" },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          accountName: t.accountName ?? null,
          fromAccountId: t.fromAccountId ?? undefined,
          fromAccountName: t.fromAccountName ?? null,
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
          toAccountName: t.toAccountName ?? null,
          goalId: (t as { goalId?: string | null }).goalId ?? undefined,
          goalName: (t as { goalName?: string | null }).goalName ?? null,
          debtorId: (t as { debtorId?: string | null }).debtorId ?? undefined,
          debtorName: (t as { debtorName?: string | null }).debtorName ?? null,
        })),
      )
      if (transferTargetType === "goal") {
        await ensureGoalsLoaded()
      } else if (transferTargetType === "debt") {
        await refetchDebtors()
      }
      onClose()
    } catch (err) {
      setError(getTransactionErrorMessage(err))
    }
    })
  }, [
    amount,
    ensureGoalsLoaded,
    isRunning,
    run,
    onClose,
    refetchDebtors,
    selectedPayableDebtorId,
    selectedGoalId,
    setAccounts,
    setTransactions,
    token,
    transferDate,
    transferFromAccountId,
    transferToAccountId,
    transferTargetType,
  ])

  const expenseReady = selectedAccountId && selectedCategoryId && Number(amount.replace(",", ".")) > 0
  const incomeReady = selectedAccountId && selectedIncomeSourceId && Number(amount.replace(",", ".")) > 0
  const transferAmountNumber = Number(amount.replace(",", "."))
  const transferReady =
    transferTargetType === "account"
      ? Boolean(transferFromAccountId && transferToAccountId && transferFromAccountId !== transferToAccountId && transferAmountNumber > 0)
      : transferTargetType === "goal"
      ? Boolean(transferFromAccountId && selectedGoalId && transferAmountNumber > 0)
      : Boolean(transferFromAccountId && selectedPayableDebtorId && transferAmountNumber > 0)
  const goalReady = Boolean(selectedAccountId && selectedGoalId && Number(amount.replace(",", ".")) > 0)
  const debtReady = Boolean(
    selectedDebtAccountId &&
      Number(amount.replace(",", ".")) > 0 &&
      (debtAction === "receivable" ? selectedReceivableDebtorId : selectedPayableDebtorId),
  )

  const labelMap: Record<QuickAddTab, string> = {
    expense: "Расход",
    income: "Доход",
    transfer: "Перевод",
    debt: "Долг",
    goal: "Цель",
  }

  const submitGoal = useCallback(() => {
    if (isRunning) return
    return run(async () => {
    if (!token) {
      setError("Нет токена")
      return
    }
    if (!selectedAccountId) {
      setError("Выберите счёт")
      return
    }
    if (!selectedGoalId) {
      setError("Выберите цель")
      return
    }
    const amt = Number(amount.replace(",", "."))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Введите сумму")
      return
    }
    setError(null)
    try {
      await contributeGoal(token, selectedGoalId, {
        accountId: selectedAccountId,
        amount: Math.round(amt * 100) / 100,
        date: `${transferDate}T00:00:00.000Z`,
      })
      const accountsData = await getAccounts(token)
      setAccounts(
        accountsData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        })),
      )
      const txData = await getTransactions(token)
      setTransactions(
        txData.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: { amount: typeof t.amount === "string" ? Number(t.amount) : t.amount, currency: "RUB" },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          accountName: t.accountName ?? null,
          fromAccountId: t.fromAccountId ?? undefined,
          fromAccountName: t.fromAccountName ?? null,
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
          toAccountName: t.toAccountName ?? null,
          goalId: (t as { goalId?: string | null }).goalId ?? undefined,
          goalName: (t as { goalName?: string | null }).goalName ?? null,
          debtorId: (t as { debtorId?: string | null }).debtorId ?? undefined,
          debtorName: (t as { debtorName?: string | null }).debtorName ?? null,
        })),
      )
      await ensureGoalsLoaded()
      onClose()
    } catch (err) {
      setError(getTransactionErrorMessage(err))
    }
    })
  }, [amount, isRunning, onClose, run, selectedAccountId, selectedGoalId, setAccounts, setTransactions, token, transferDate])

  const submitDebt = useCallback(() => {
    if (isRunning) return
    return run(async () => {
      if (!token) {
        setError("Нет токена")
        return
      }
      const amt = Number(amount.replace(",", "."))
      if (!Number.isFinite(amt) || amt <= 0) {
        setError("Введите сумму")
        return
      }

      if (!selectedDebtAccountId) {
        setError("Выберите счёт")
        return
      }

      if (debtAction === "receivable") {
        if (!selectedReceivableDebtorId) {
          setError("Выберите должника")
          return
        }
      } else if (!selectedPayableDebtorId) {
        setError("Выберите долг")
        return
      }

      setError(null)

      try {
        if (debtAction === "receivable") {
          await createTransaction(token, {
            kind: "transfer",
            amount: Math.round(amt * 100) / 100,
            toAccountId: selectedDebtAccountId,
            debtorId: selectedReceivableDebtorId ?? null,
            happenedAt: `${transferDate}T00:00:00.000Z`,
          })
        } else {
          await createTransaction(token, {
            kind: "expense",
            amount: Math.round(amt * 100) / 100,
            accountId: selectedDebtAccountId,
            debtorId: selectedPayableDebtorId ?? null,
            happenedAt: `${transferDate}T00:00:00.000Z`,
          })
        }

        onClose()
        try {
          const accountsData = await getAccounts(token)
          setAccounts(
            accountsData.accounts.map((a) => ({
              id: a.id,
              name: a.name,
              balance: { amount: a.balance, currency: a.currency },
              color: a.color ?? undefined,
              icon: a.icon ?? null,
            })),
          )

          const txData = await getTransactions(token)
          setTransactions(
            txData.transactions.map((t) => ({
              id: t.id,
              type: t.kind,
              amount: { amount: typeof t.amount === "string" ? Number(t.amount) : t.amount, currency: "RUB" },
              date: t.happenedAt,
              accountId: t.accountId ?? t.fromAccountId ?? "",
              accountName: t.accountName ?? null,
              fromAccountId: t.fromAccountId ?? undefined,
              fromAccountName: t.fromAccountName ?? null,
              categoryId: t.categoryId ?? undefined,
              incomeSourceId: t.incomeSourceId ?? undefined,
              toAccountId: t.toAccountId ?? undefined,
              toAccountName: t.toAccountName ?? null,
              goalId: (t as { goalId?: string | null }).goalId ?? undefined,
              goalName: (t as { goalName?: string | null }).goalName ?? null,
              debtorId: (t as { debtorId?: string | null }).debtorId ?? undefined,
              debtorName: (t as { debtorName?: string | null }).debtorName ?? null,
            })),
          )

          await refetchDebtors()
        } catch (refreshErr) {
          console.error(refreshErr)
        }
      } catch (err) {
        setError(getTransactionErrorMessage(err))
      }
    })
  }, [
    amount,
    debtAction,
    isRunning,
    onClose,
    refetchDebtors,
    run,
    selectedDebtAccountId,
    selectedPayableDebtorId,
    selectedReceivableDebtorId,
    setAccounts,
    setTransactions,
    token,
    transferDate,
  ])

  return (
    <div
      className="app-shell"
      style={{
        ...quickAddLayoutVars,
        background: "#f5f6f8",
        position: "relative",
        minHeight: "100dvh",
        overflow: "visible",
      }}
    >
      <div
        className="app-shell__inner overview"
        onPointerDown={handleDismissPointerDown}
        onPointerMove={handleDismissPointerMove}
        onPointerUp={handleDismissPointerUp}
        onPointerCancel={handleDismissPointerCancel}
        style={{
          paddingBottom: "calc(var(--bottom-nav-height,56px) + env(safe-area-inset-bottom,0px) + var(--qa-footer-h))",
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          minHeight: "100dvh",
        }}
      >
        <div style={{ display: "grid", gap: 10, padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, color: "#0f172a" }}>Выберите операцию</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#0f172a",
                fontWeight: 600,
              }}
            >
              Закрыть
            </button>
          </div>
          <div
            data-hscroll="1"
            style={{
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: 2,
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x",
              overscrollBehaviorX: "contain",
            }}
          >
            <div style={{ display: "flex", flexWrap: "nowrap", gap: 8, minWidth: 0 }}>
              {(Object.keys(labelMap) as QuickAddTab[]).map((tab) => {
                const iconMap: Record<QuickAddTab, IconName> = {
                  expense: "report",
                  income: "plus",
                  transfer: "repeat",
                  debt: "bank",
                  goal: "goal",
                }
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab)
                      setError(null)
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: activeTab === tab ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: activeTab === tab ? "#0f172a" : "#fff",
                      color: activeTab === tab ? "#fff" : "#0f172a",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <AppIcon name={iconMap[tab]} size={14} />
                    {labelMap[tab]}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ borderBottom: "1px solid #e5e7eb" }} />
        </div>

        {activeTab === "expense" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт для списания</div>
            <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
              {accountTiles.map((acc) =>
                renderTile(
                    {
                      id: acc.id,
                      title: acc.title,
                      icon: "wallet",
                      iconKey: acc.iconKey,
                      color: acc.color,
                      text: acc.text,
                    },
                    selectedAccountId === acc.id,
                    "account",
                  ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Категория расходов</div>
              <div className="overview-expenses-row">
                {expenseCategoryTiles.map((cat) =>
                  renderTile(
                    {
                      id: cat.id,
                      title: cat.title,
                      iconKey: cat.iconKey,
                      amount: cat.amount,
                      budget: cat.budget,
                      budgetTone: cat.budgetTone,
                    },
                    selectedCategoryId === cat.id,
                    "category",
                  ),
                )}
              </div>
            </div>

            <div data-quick-add-footer="1" style={stickyFooterStyle}>
              <AmountDateRow
                amount={amount}
                onAmountChange={setAmount}
                date={transferDate}
                onDateChange={setTransferDate}
              />
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
              <div style={{ paddingTop: 8 }}>
                <button
                  type="button"
                  disabled={!expenseReady || isRunning}
                  onClick={() => void submitExpense()}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: expenseReady && !isRunning ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                    color: expenseReady && !isRunning ? "#ffffff" : "rgba(255,255,255,0.7)",
                    fontWeight: 700,
                    cursor: expenseReady && !isRunning ? "pointer" : "not-allowed",
                  }}
                >
                  {isRunning ? "Сохранение..." : "Готово"}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === "income" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Источник дохода</div>
            <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
              {incomeSourceTiles.map((src) =>
                renderTile(
                  {
                    id: src.id,
                    title: src.title,
                    iconKey: src.iconKey,
                    amount: src.amount,
                    color: src.color,
                  },
                  selectedIncomeSourceId === src.id,
                  "income-source",
                ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт для зачисления</div>
              <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
              {accountTiles.map((acc) =>
                renderTile(
                  {
                    id: acc.id,
                    title: acc.title,
                    icon: "wallet",
                    iconKey: acc.iconKey,
                    color: acc.color,
                    text: acc.text,
                  },
                  selectedAccountId === acc.id,
                  "account",
                  ),
              )}
            </div>
            </div>

            <div data-quick-add-footer="1" style={stickyFooterStyle}>
              <AmountDateRow
                amount={amount}
                onAmountChange={setAmount}
                date={transferDate}
                onDateChange={setTransferDate}
              />
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
              <div style={{ paddingTop: 8 }}>
                <button
                  type="button"
                  disabled={!incomeReady || isRunning}
                  onClick={() => void submitIncome()}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: incomeReady && !isRunning ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                    color: incomeReady && !isRunning ? "#ffffff" : "rgba(255,255,255,0.7)",
                    fontWeight: 700,
                    cursor: incomeReady && !isRunning ? "pointer" : "not-allowed",
                  }}
                >
                  {isRunning ? "Сохранение..." : "Готово"}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === "transfer" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт — откуда</div>
            <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
              {accountTiles.map((acc) =>
                renderTile(
                  {
                    id: acc.id,
                    title: acc.title,
                    icon: "wallet",
                    iconKey: acc.iconKey,
                    color: acc.color,
                    text: acc.text,
                  },
                  transferFromAccountId === acc.id,
                  "account",
                  (id) => {
                    setTransferFromAccountId(id)
                    setError(null)
                  },
                ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 10 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Куда</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {[
                  { key: "account", label: "Счёт" },
                  { key: "goal", label: "Мои цели" },
                  { key: "debt", label: "Долг" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setTransferTargetType(opt.key as "account" | "goal" | "debt")
                      setError(null)
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: transferTargetType === opt.key ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: transferTargetType === opt.key ? "#0f172a" : "#fff",
                      color: transferTargetType === opt.key ? "#fff" : "#0f172a",
                      fontWeight: 600,
                      minWidth: 90,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {transferTargetType === "account" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт — куда</div>
                  <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
                    {accountTiles.map((acc) =>
                      renderTile(
                        {
                          id: acc.id,
                          title: acc.title,
                          icon: "wallet",
                          iconKey: acc.iconKey,
                          color: acc.color,
                          text: acc.text,
                        },
                        transferToAccountId === acc.id,
                        "account",
                        (id) => {
                          setTransferToAccountId(id)
                          setError(null)
                        },
                      ),
                    )}
                  </div>
                </div>
              ) : transferTargetType === "goal" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Цель</div>
                  <div style={{ position: "relative" }}>
                    <div
                      ref={transferGoalListRef}
                      onScroll={handleTransferGoalListScroll}
                      style={debtListScrollContainerStyle}
                    >
                      <GoalList
                        goals={activeGoals}
                        selectedGoalId={selectedGoalId}
                        onSelectGoal={(goal) => {
                          setSelectedGoalId(goal.id)
                          setError(null)
                        }}
                        emptyText="Нет актуальных целей"
                        currency={baseCurrency}
                        showSelectedCheck
                        selectedCheckOnly
                      />
                    </div>
                    {showTransferGoalScrollHint ? (
                      <div
                        style={{
                          position: "absolute",
                          left: "50%",
                          bottom: 8,
                          transform: "translateX(-50%)",
                          pointerEvents: "none",
                          color: "rgba(71,85,105,0.9)",
                          fontSize: 14,
                          lineHeight: 1,
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.88)",
                          border: "1px solid rgba(148,163,184,0.45)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ↓
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Список моих долгов</div>
                  <div style={{ position: "relative" }}>
                    <div
                      ref={transferDebtListRef}
                      onScroll={handleTransferDebtListScroll}
                      style={debtListScrollContainerStyle}
                    >
                      <DebtorList
                        debtors={activePayableDebtors}
                        direction="payable"
                        emptyText="Нет актуальных долгов"
                        selectedDebtorId={selectedPayableDebtorId}
                        selectedBorder={false}
                        selectedCheckOnly
                        currency={baseCurrency}
                        onSelectDebtor={(debtor) => {
                          setSelectedPayableDebtorId(debtor.id)
                          setError(null)
                        }}
                      />
                    </div>
                    {showTransferDebtScrollHint ? (
                      <div
                        style={{
                          position: "absolute",
                          left: "50%",
                          bottom: 8,
                          transform: "translateX(-50%)",
                          pointerEvents: "none",
                          color: "rgba(71,85,105,0.9)",
                          fontSize: 14,
                          lineHeight: 1,
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.88)",
                          border: "1px solid rgba(148,163,184,0.45)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ↓
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div data-quick-add-footer="1" style={stickyFooterStyle}>
              <AmountDateRow
                amount={amount}
                onAmountChange={setAmount}
                date={transferDate}
                onDateChange={setTransferDate}
              />
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
              <div style={{ paddingTop: 8 }}>
                <button
                  type="button"
                  disabled={!transferReady || isRunning}
                  onClick={() => void submitTransfer()}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: transferReady && !isRunning ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                    color: transferReady && !isRunning ? "#ffffff" : "rgba(255,255,255,0.7)",
                    fontWeight: 700,
                    cursor: transferReady && !isRunning ? "pointer" : "not-allowed",
                  }}
                >
                  {isRunning ? "Сохранение..." : "Готово"}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === "debt" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setDebtAction("receivable")
                  setError(null)
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: debtAction === "receivable" ? "1px solid #0f172a" : "1px solid #e5e7eb",
                  background: debtAction === "receivable" ? "#0f172a" : "#fff",
                  color: debtAction === "receivable" ? "#fff" : "#0f172a",
                  fontWeight: 600,
                  minWidth: 120,
                }}
              >
                Мне вернули
              </button>
              <button
                type="button"
                onClick={() => {
                  setDebtAction("payable")
                  setError(null)
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: debtAction === "payable" ? "1px solid #0f172a" : "1px solid #e5e7eb",
                  background: debtAction === "payable" ? "#0f172a" : "#fff",
                  color: debtAction === "payable" ? "#fff" : "#0f172a",
                  fontWeight: 600,
                  minWidth: 120,
                }}
              >
                Я вернул
              </button>
            </div>

            {debtAction === "receivable" ? (
              <>
                <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Список должников</div>
                {activeReceivableDebtors.length > 0 ? (
                  <div style={{ position: "relative" }}>
                    <div
                      ref={debtReceivableListRef}
                      onScroll={handleDebtReceivableListScroll}
                      style={debtListScrollContainerStyle}
                    >
                      <DebtorList
                        debtors={activeReceivableDebtors}
                        direction="receivable"
                        selectedDebtorId={selectedReceivableDebtorId}
                        selectedCheckOnly
                        currency={baseCurrency}
                        onSelectDebtor={(debtor) => {
                          setSelectedReceivableDebtorId(debtor.id)
                          setError(null)
                        }}
                      />
                    </div>
                    {showDebtReceivableScrollHint ? (
                      <div
                        style={{
                          position: "absolute",
                          left: "50%",
                          bottom: 8,
                          transform: "translateX(-50%)",
                          pointerEvents: "none",
                          color: "rgba(71,85,105,0.9)",
                          fontSize: 14,
                          lineHeight: 1,
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.88)",
                          border: "1px solid rgba(148,163,184,0.45)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ↓
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", color: "#6b7280", fontSize: 13 }}>Нет актуальных должников</div>
                )}

                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт для зачисления</div>
                  <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
                    {accountTiles.map((acc) =>
                      renderTile(
                        {
                          id: acc.id,
                          title: acc.title,
                          icon: "wallet",
                          iconKey: acc.iconKey,
                          color: acc.color,
                          text: acc.text,
                        },
                        selectedDebtAccountId === acc.id,
                        "account",
                        (id) => {
                          setSelectedDebtAccountId(id)
                          setError(null)
                        },
                      ),
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт для списания</div>
                <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
                  {accountTiles.map((acc) =>
                    renderTile(
                      {
                        id: acc.id,
                        title: acc.title,
                        icon: "wallet",
                        iconKey: acc.iconKey,
                        color: acc.color,
                        text: acc.text,
                      },
                      selectedDebtAccountId === acc.id,
                      "account",
                      (id) => {
                        setSelectedDebtAccountId(id)
                        setError(null)
                      },
                    ),
                  )}
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Список моих долгов</div>
                  {activePayableDebtors.length > 0 ? (
                    <div style={{ position: "relative" }}>
                      <div
                        ref={debtPayableListRef}
                        onScroll={handleDebtPayableListScroll}
                        style={debtListScrollContainerStyle}
                      >
                        <DebtorList
                          debtors={activePayableDebtors}
                          direction="payable"
                          selectedDebtorId={selectedPayableDebtorId}
                          selectedCheckOnly
                          currency={baseCurrency}
                          onSelectDebtor={(debtor) => {
                            setSelectedPayableDebtorId(debtor.id)
                            setError(null)
                          }}
                        />
                      </div>
                      {showDebtPayableScrollHint ? (
                        <div
                          style={{
                            position: "absolute",
                            left: "50%",
                            bottom: 8,
                            transform: "translateX(-50%)",
                            pointerEvents: "none",
                            color: "rgba(71,85,105,0.9)",
                            fontSize: 14,
                            lineHeight: 1,
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.88)",
                            border: "1px solid rgba(148,163,184,0.45)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          ↓
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", color: "#6b7280", fontSize: 13 }}>Нет актуальных долгов</div>
                  )}
                </div>
              </>
            )}

            <div data-quick-add-footer="1" style={stickyFooterStyle}>
              <AmountDateRow amount={amount} onAmountChange={setAmount} date={transferDate} onDateChange={setTransferDate} />
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
              <div style={{ paddingTop: 8 }}>
                <button
                  type="button"
                  disabled={!debtReady || isRunning}
                  onClick={() => void submitDebt()}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: debtReady && !isRunning ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                    color: debtReady && !isRunning ? "#ffffff" : "rgba(255,255,255,0.7)",
                    fontWeight: 700,
                    cursor: debtReady && !isRunning ? "pointer" : "not-allowed",
                  }}
                >
                  {isRunning ? "Сохранение..." : "Готово"}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === "goal" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт</div>
            <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
              {accountTiles.map((acc) =>
                renderTile(
                  {
                    id: acc.id,
                    title: acc.title,
                    icon: "wallet",
                    iconKey: acc.iconKey,
                    color: acc.color,
                    text: acc.text,
                  },
                  selectedAccountId === acc.id,
                  "account",
                  ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Цель</div>
              {activeGoals.length > 0 ? (
                <div data-hscroll="1" className="overview-section__list overview-section__list--row overview-accounts-row" style={hScrollRowStyle}>
                  {activeGoals.map((goal) =>
                    renderTile(
                      {
                        id: goal.id,
                        title: getGoalDisplay(goal.id, activeGoalsById).title,
                        iconKey: getGoalDisplay(goal.id, activeGoalsById).iconKey ?? null,
                        amount: goal.currentAmount,
                        budget: goal.targetAmount,
                      },
                      selectedGoalId === goal.id,
                      "goal",
                      (id) => {
                        setSelectedGoalId(id)
                        setError(null)
                      },
                    ),
                  )}
                </div>
              ) : (
                <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "16px 8px" }}>
                  <div style={{ fontSize: 14, color: "#64748b", textAlign: "center" }}>Нет актуальных целей</div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenCreateGoal) {
                        onOpenCreateGoal()
                      } else {
                        onClose()
                      }
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #0f172a",
                      background: "#0f172a",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + Создать цель
                  </button>
                </div>
              )}
            </div>

            <div data-quick-add-footer="1" style={stickyFooterStyle}>
              <AmountDateRow
                amount={amount}
                onAmountChange={setAmount}
                date={transferDate}
                onDateChange={setTransferDate}
              />
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
              <div style={{ paddingTop: 8 }}>
                <button
                  type="button"
                  disabled={!goalReady || isRunning}
                  onClick={() => void submitGoal()}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: goalReady && !isRunning ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                    color: goalReady && !isRunning ? "#ffffff" : "rgba(255,255,255,0.7)",
                    fontWeight: 700,
                    cursor: goalReady && !isRunning ? "pointer" : "not-allowed",
                  }}
                >
                  {isRunning ? "Сохранение..." : "Готово"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Скоро</div>
        )}

      </div>
    </div>
  )
}

export default QuickAddScreen
