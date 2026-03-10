import { useMemo, useState, useCallback, useRef, useEffect, type CSSProperties, type FocusEvent, type MouseEvent, type PointerEvent, type UIEvent } from "react"
import { useAppStore } from "../store/useAppStore"
import { formatMoney, normalizeCurrency } from "../utils/formatMoney"
import { createTransaction, getTransactions } from "../api/transactions"
import { createAccount, getAccounts } from "../api/accounts"
import { createCategory, getCategories } from "../api/categories"
import { AppIcon, type IconName } from "../components/AppIcon"
import { FinanceIcon, isFinanceIconKey } from "../shared/icons/financeIcons"
import { getAccountDisplay, getCategoryDisplay, getIncomeSourceDisplay } from "../shared/display"
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

export const DateIconButton: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
  const pickerRef = useRef<HTMLInputElement | null>(null)

  const openDatePicker = useCallback(() => {
    const input = pickerRef.current
    if (!input) return
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void }
    if (typeof pickerInput.showPicker === "function") {
      try {
        pickerInput.showPicker()
      } catch {
        input.focus()
      }
    } else {
      input.focus()
    }
  }, [])

  return (
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
        color: "#0f172a",
        cursor: "pointer",
      }}
      onClick={(event) => {
        event.preventDefault()
        openDatePicker()
      }}
    >
      <input
        ref={pickerRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          width: "100%",
          height: "100%",
          cursor: "pointer",
          transform: "scale(0.8)",
          transformOrigin: "center center",
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
}

const TapHintIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = "#0f172a" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 9.5C7 6.46 9.46 4 12.5 4C15.54 4 18 6.46 18 9.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.2 10.1C9.2 8.31 10.66 6.85 12.45 6.85C14.24 6.85 15.7 8.31 15.7 10.1" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12.1 12.1V18.1" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
    <path
      d="M9.35 14.1V18.4C9.35 19.84 10.51 21 11.95 21H13.4C14.75 21 15.88 19.98 16 18.64L16.16 16.8C16.25 15.73 15.41 14.8 14.34 14.8V17"
      stroke={color}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const AmountDateRow: React.FC<{
  amount: string
  onAmountChange: (val: string) => void
  date: string
  onDateChange: (val: string) => void
  onAmountFocus?: (event: FocusEvent<HTMLInputElement>) => void
  onAmountBlur?: (event: FocusEvent<HTMLInputElement>) => void
  amountInputRef?: React.RefObject<HTMLInputElement | null>
}> = ({ amount, onAmountChange, date, onDateChange, onAmountFocus, onAmountBlur, amountInputRef }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
    <input
      ref={amountInputRef}
      value={amount}
      onChange={(e) => onAmountChange(e.target.value)}
      onFocus={onAmountFocus}
      onBlur={onAmountBlur}
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
  initialTab?: QuickAddTab
  initialIncomeSourceId?: string | null
  initialCategoryId?: string | null
  initialDebtAction?: "receivable" | "payable"
}

export const QuickAddScreen: React.FC<Props> = ({
  onClose,
  onOpenCreateGoal,
  initialTab = "expense",
  initialIncomeSourceId = null,
  initialCategoryId = null,
  initialDebtAction = "receivable",
}) => {
  const { accounts, categories, incomeSources, goals, debtors, transactions, setAccounts, setCategories, setTransactions, setGoals, setDebtors, currency } =
    useAppStore()
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null), [])
  const baseCurrency = normalizeCurrency(currency || "RUB")

  const [activeTab, setActiveTab] = useState<QuickAddTab>(initialTab)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategoryId)
  const [selectedIncomeSourceId, setSelectedIncomeSourceId] = useState<string | null>(initialIncomeSourceId)
  const [transferFromAccountId, setTransferFromAccountId] = useState<string | null>(null)
  const [transferToAccountId, setTransferToAccountId] = useState<string | null>(null)
  const [transferTargetType, setTransferTargetType] = useState<"account" | "goal" | "debt">("account")
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [debtAction, setDebtAction] = useState<"receivable" | "payable">(initialDebtAction)
  const [selectedDebtAccountId, setSelectedDebtAccountId] = useState<string | null>(null)
  const [selectedReceivableDebtorId, setSelectedReceivableDebtorId] = useState<string | null>(null)
  const [selectedPayableDebtorId, setSelectedPayableDebtorId] = useState<string | null>(null)
  const [transferDate, setTransferDate] = useState(() => getTodayLocalDate())
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isAmountFocused, setIsAmountFocused] = useState(false)
  const [expensePicker, setExpensePicker] = useState<"account" | "category" | null>(null)
  const [expensePickerCreateMode, setExpensePickerCreateMode] = useState<"account" | "category" | null>(null)
  const [expensePickerCreateName, setExpensePickerCreateName] = useState("")
  const [expensePickerCreateError, setExpensePickerCreateError] = useState<string | null>(null)
  const [expensePickerClosing, setExpensePickerClosing] = useState(false)
  const [expenseAccountError, setExpenseAccountError] = useState(false)
  const [expenseCategoryError, setExpenseCategoryError] = useState(false)
  const [expensePickerDragOffset, setExpensePickerDragOffset] = useState(0)
  const [footerHeightPx, setFooterHeightPx] = useState(148)
  const [showTransferDebtScrollHint, setShowTransferDebtScrollHint] = useState(false)
  const [transferDebtListScrolled, setTransferDebtListScrolled] = useState(false)
  const [showTransferGoalScrollHint, setShowTransferGoalScrollHint] = useState(false)
  const [transferGoalListScrolled, setTransferGoalListScrolled] = useState(false)
  const [showDebtReceivableScrollHint, setShowDebtReceivableScrollHint] = useState(false)
  const [debtReceivableListScrolled, setDebtReceivableListScrolled] = useState(false)
  const [showDebtPayableScrollHint, setShowDebtPayableScrollHint] = useState(false)
  const [debtPayableListScrolled, setDebtPayableListScrolled] = useState(false)
  const goalsFetchInFlight = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const footerRef = useRef<HTMLDivElement | null>(null)
  const amountInputRef = useRef<HTMLInputElement | null>(null)
  const transferDebtListRef = useRef<HTMLDivElement | null>(null)
  const transferGoalListRef = useRef<HTMLDivElement | null>(null)
  const debtReceivableListRef = useRef<HTMLDivElement | null>(null)
  const debtPayableListRef = useRef<HTMLDivElement | null>(null)
  const expensePickerSheetRef = useRef<HTMLDivElement | null>(null)
  const expensePickerOverlayRef = useRef<HTMLDivElement | null>(null)
  const expensePickerContentRef = useRef<HTMLDivElement | null>(null)
  const expensePickerGestureRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    tracking: boolean
    draggingSheet: boolean
    blockClick: boolean
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    tracking: false,
    draggingSheet: false,
    blockClick: false,
  })
  const expensePickerTouchRef = useRef<{
    identifier: number | null
    startX: number
    startY: number
  }>({
    identifier: null,
    startX: 0,
    startY: 0,
  })
  const expensePickerCloseTimerRef = useRef<number | null>(null)
  const choiceGestureRef = useRef<{
    tracking: boolean
    pointerId: number | null
    moved: boolean
    startX: number
    startY: number
  }>({
    tracking: false,
    pointerId: null,
    moved: false,
    startX: 0,
    startY: 0,
  })
  const dismissGestureRef = useRef<{
    tracking: boolean
    pointerId: number | null
    moved: boolean
    startX: number
    startY: number
  }>({
    tracking: false,
    pointerId: null,
    moved: false,
    startX: 0,
    startY: 0,
  })
  const { run, isRunning } = useSingleFlight()
  const { run: runPickerCreate, isRunning: isPickerCreateRunning } = useSingleFlight()

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense" && !category.isArchived),
    [categories],
  )
  const incomeSourcesList = useMemo(() => incomeSources.filter((source) => !source.isArchived), [incomeSources])
  const activeGoals = useMemo(() => goals.filter((goal) => goal.status === "active"), [goals])
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
  const hScrollRowStyle = useMemo(
    () =>
      ({
        paddingBottom: 6,
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
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
        overscrollBehaviorY: "contain",
        touchAction: "pan-y",
      }) as const,
    [],
  )
  const footerSectionStyle = useMemo(
    () =>
      ({
        borderTop: "1px solid #e5e7eb",
        paddingTop: 12,
        display: "grid",
        gap: 6,
      }) as const,
    [],
  )
  const quickAddFooterDockStyle = useMemo(
    () =>
      ({
        ...footerSectionStyle,
        position: "fixed",
        left: 0,
        right: 0,
        width: "100%",
        maxWidth: 480,
        marginInline: "auto",
        zIndex: 140,
        bottom: 0,
        background: "#f5f6f8",
        padding: "12px 16px calc(env(safe-area-inset-bottom,0px) + 8px)",
        boxShadow: "0 -8px 20px rgba(15,23,42,0.06)",
      }) as const,
    [footerSectionStyle],
  )

  useEffect(() => {
    if (!selectedCategoryId) return
    const existsInActive = expenseCategories.some((category) => category.id === selectedCategoryId)
    if (!existsInActive) {
      setSelectedCategoryId(null)
    }
  }, [expenseCategories, selectedCategoryId])

  useEffect(() => {
    if (activeTab !== "expense") {
      setExpensePicker(null)
      setExpensePickerClosing(false)
      setExpenseAccountError(false)
      setExpenseCategoryError(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (expensePicker) return
    setExpensePickerDragOffset(0)
    setExpensePickerClosing(false)
    setExpensePickerCreateMode(null)
    setExpensePickerCreateName("")
    setExpensePickerCreateError(null)
    expensePickerGestureRef.current.pointerId = null
    expensePickerGestureRef.current.tracking = false
    expensePickerGestureRef.current.draggingSheet = false
    expensePickerGestureRef.current.blockClick = false
  }, [expensePicker])

  useEffect(() => {
    return () => {
      if (expensePickerCloseTimerRef.current !== null) {
        window.clearTimeout(expensePickerCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!expensePicker) return
    const overlay = expensePickerOverlayRef.current
    const sheet = expensePickerSheetRef.current
    if (!overlay || !sheet) return

    const resetTouchState = () => {
      expensePickerTouchRef.current.identifier = null
      expensePickerTouchRef.current.startX = 0
      expensePickerTouchRef.current.startY = 0
    }

    const getTrackedTouch = (event: TouchEvent) => {
      const trackedId = expensePickerTouchRef.current.identifier
      if (trackedId == null) return event.touches[0] ?? event.changedTouches[0] ?? null
      for (let i = 0; i < event.touches.length; i += 1) {
        const touch = event.touches.item(i)
        if (touch && touch.identifier === trackedId) return touch
      }
      for (let i = 0; i < event.changedTouches.length; i += 1) {
        const touch = event.changedTouches.item(i)
        if (touch && touch.identifier === trackedId) return touch
      }
      return null
    }

    const onTouchStartCapture = (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0]
      if (!touch) return
      expensePickerTouchRef.current.identifier = touch.identifier
      expensePickerTouchRef.current.startX = touch.clientX
      expensePickerTouchRef.current.startY = touch.clientY
    }

    const onTouchMoveCapture = (event: TouchEvent) => {
      const touch = getTrackedTouch(event)
      if (!touch) return
      const dx = touch.clientX - expensePickerTouchRef.current.startX
      const dy = touch.clientY - expensePickerTouchRef.current.startY
      if (Math.abs(dy) <= Math.abs(dx)) return

      const targetNode = event.target instanceof Node ? event.target : null
      const content = expensePickerContentRef.current
      const targetInSheet = targetNode ? sheet.contains(targetNode) : false
      const targetInContent = targetNode ? Boolean(content?.contains(targetNode)) : false

      if (!targetInSheet || !targetInContent || !content) {
        event.preventDefault()
        return
      }

      const atTop = content.scrollTop <= 0
      const atBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 1
      if ((dy > 0 && atTop) || (dy < 0 && atBottom)) {
        event.preventDefault()
      }
    }

    const onTouchEndCapture = () => {
      resetTouchState()
    }

    const onTouchCancelCapture = () => {
      resetTouchState()
    }

    overlay.addEventListener("touchstart", onTouchStartCapture, { capture: true, passive: true })
    overlay.addEventListener("touchmove", onTouchMoveCapture, { capture: true, passive: false })
    overlay.addEventListener("touchend", onTouchEndCapture, { capture: true, passive: true })
    overlay.addEventListener("touchcancel", onTouchCancelCapture, { capture: true, passive: true })

    return () => {
      overlay.removeEventListener("touchstart", onTouchStartCapture, true)
      overlay.removeEventListener("touchmove", onTouchMoveCapture, true)
      overlay.removeEventListener("touchend", onTouchEndCapture, true)
      overlay.removeEventListener("touchcancel", onTouchCancelCapture, true)
      resetTouchState()
    }
  }, [expensePicker])

  useEffect(() => {
    if (!selectedIncomeSourceId) return
    const existsInActive = incomeSourcesList.some((source) => source.id === selectedIncomeSourceId)
    if (!existsInActive) {
      setSelectedIncomeSourceId(null)
    }
  }, [incomeSourcesList, selectedIncomeSourceId])

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
    const isGoalSelectionMode = activeTab === "goal" || (activeTab === "transfer" && transferTargetType === "goal")
    if (!isGoalSelectionMode) {
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
    const footerNode = footerRef.current
    if (!footerNode) return
    const nextHeight = Math.round(footerNode.getBoundingClientRect().height)
    if (nextHeight > 0) {
      setFooterHeightPx(nextHeight)
    }
  }, [activeTab, error, isAmountFocused, isRunning])

  const isEditableElement = (element: Element | null): element is HTMLElement =>
    element instanceof HTMLElement && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable)

  const handleChoicePointerDownCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest("button")) {
      choiceGestureRef.current.tracking = true
      choiceGestureRef.current.pointerId = event.pointerId
      choiceGestureRef.current.moved = false
      choiceGestureRef.current.startX = event.clientX
      choiceGestureRef.current.startY = event.clientY
    } else {
      choiceGestureRef.current.tracking = false
      choiceGestureRef.current.pointerId = null
      choiceGestureRef.current.moved = false
    }

    if (!isAmountFocused) return
    if (target.closest("[data-quick-add-footer='1']")) {
      dismissGestureRef.current.tracking = false
      dismissGestureRef.current.pointerId = null
      dismissGestureRef.current.moved = false
      return
    }
    if (target.closest("input, textarea, [contenteditable='true']")) {
      dismissGestureRef.current.tracking = false
      dismissGestureRef.current.pointerId = null
      dismissGestureRef.current.moved = false
      return
    }
    dismissGestureRef.current.tracking = true
    dismissGestureRef.current.pointerId = event.pointerId
    dismissGestureRef.current.moved = false
    dismissGestureRef.current.startX = event.clientX
    dismissGestureRef.current.startY = event.clientY
  }, [isAmountFocused])

  const handleChoicePointerMoveCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const gesture = choiceGestureRef.current
    if (!gesture.tracking || gesture.pointerId !== event.pointerId || gesture.moved) return
    const dx = Math.abs(event.clientX - gesture.startX)
    const dy = Math.abs(event.clientY - gesture.startY)
    if (Math.max(dx, dy) > 8) {
      gesture.moved = true
    }

    const dismissGesture = dismissGestureRef.current
    if (!dismissGesture.tracking || dismissGesture.pointerId !== event.pointerId || dismissGesture.moved) return
    const dismissDx = Math.abs(event.clientX - dismissGesture.startX)
    const dismissDy = Math.abs(event.clientY - dismissGesture.startY)
    if (Math.max(dismissDx, dismissDy) > 8) {
      dismissGesture.moved = true
    }
  }, [])

  const handleChoicePointerUpCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const gesture = choiceGestureRef.current
    if (gesture.pointerId === event.pointerId) {
      gesture.tracking = false
      gesture.pointerId = null
    }

    const dismissGesture = dismissGestureRef.current
    if (dismissGesture.pointerId !== event.pointerId) return
    const shouldBlur = dismissGesture.tracking && !dismissGesture.moved
    dismissGesture.tracking = false
    dismissGesture.pointerId = null
    dismissGesture.moved = false
    if (!shouldBlur) return
    const active = document.activeElement
    if (isEditableElement(active)) {
      active.blur()
    }
  }, [])

  const handleChoicePointerCancelCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const gesture = choiceGestureRef.current
    if (gesture.pointerId === event.pointerId) {
      gesture.tracking = false
      gesture.pointerId = null
      gesture.moved = false
    }

    const dismissGesture = dismissGestureRef.current
    if (dismissGesture.pointerId !== event.pointerId) return
    dismissGesture.tracking = false
    dismissGesture.pointerId = null
    dismissGesture.moved = false
  }, [])

  const handleChoiceClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const gesture = choiceGestureRef.current
    if (!gesture.moved) return
    const target = event.target as HTMLElement | null
    if (!target || !target.closest("button")) return
    event.preventDefault()
    event.stopPropagation()
    gesture.moved = false
  }, [])

  const handleAmountFocus = useCallback((event: FocusEvent<HTMLInputElement>) => {
    const amountInput = event.currentTarget
    setIsAmountFocused(true)
    amountInputRef.current = amountInput
    const editableElements = scrollRef.current?.querySelectorAll<HTMLElement>("input, textarea, [contenteditable='true']")
    editableElements?.forEach((element) => {
      if (element !== amountInput && isEditableElement(element)) {
        element.blur()
      }
    })
  }, [])

  const handleAmountBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget as HTMLElement | null
    if (next?.closest("[data-quick-add-footer='1']")) return
    setIsAmountFocused(false)
  }, [])

  useEffect(() => {
    if (!isAmountFocused) return
    const amountInput = amountInputRef.current
    if (!amountInput) return
    const active = document.activeElement
    if (isEditableElement(active) && active !== amountInput) {
      active.blur()
    }
  }, [isAmountFocused])

  const accountTiles = useMemo(
    () =>
      accounts.map((acc) => {
        const display = getAccountDisplay(acc.id, accountsById)
        const reservedInGoals = reservedInActiveGoalsByAccountId.get(acc.id) ?? 0
        const factualBalance = acc.balance.amount + reservedInGoals
        return {
          id: acc.id,
          title: display.title,
          iconKey: display.iconKey ?? null,
          color: display.color ?? "#EEF2F7",
          amount: acc.balance.amount,
          secondaryAmount: reservedInGoals > 0 ? factualBalance : undefined,
        }
      }),
    [accounts, accountsById, reservedInActiveGoalsByAccountId],
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
  const selectedAccountTile = useMemo(
    () => accountTiles.find((tile) => tile.id === selectedAccountId) ?? null,
    [accountTiles, selectedAccountId],
  )
  const selectedExpenseCategoryTile = useMemo(
    () => expenseCategoryTiles.find((tile) => tile.id === selectedCategoryId) ?? null,
    [expenseCategoryTiles, selectedCategoryId],
  )
  const expenseCompactTileHeight = 98
  const expenseCompactTileStyle = useMemo(
    () =>
      ({
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        height: expenseCompactTileHeight,
        minHeight: expenseCompactTileHeight,
        maxHeight: expenseCompactTileHeight,
        overflow: "hidden",
        justifyContent: "center",
      }) satisfies CSSProperties,
    [expenseCompactTileHeight],
  )
  const expenseCompactCategorySheetTileStyle = useMemo(
    () =>
      ({
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        minHeight: 96,
      }) satisfies CSSProperties,
    [],
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
          createdAt: a.createdAt ?? null,
          type: a.type,
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
          createdAt: t.createdAt ?? null,
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
          createdByUserId: t.createdByUserId ?? null,
          createdByName: t.createdByName ?? null,
        })),
      )
      onClose()
    } catch (err) {
      setError(getTransactionErrorMessage(err))
    }
    })
  }, [amount, isRunning, onClose, run, selectedAccountId, selectedCategoryId, setAccounts, setTransactions, token])

  const openExpensePicker = useCallback((picker: "account" | "category") => {
    if (expensePickerCloseTimerRef.current !== null) {
      window.clearTimeout(expensePickerCloseTimerRef.current)
      expensePickerCloseTimerRef.current = null
    }
    setExpensePicker(picker)
    setExpensePickerClosing(false)
    setExpensePickerCreateMode(null)
    setExpensePickerCreateName("")
    setExpensePickerCreateError(null)
    setExpensePickerDragOffset(0)
    setError(null)
  }, [])

  const finalizeExpensePickerClose = useCallback(() => {
    if (expensePickerCloseTimerRef.current !== null) {
      window.clearTimeout(expensePickerCloseTimerRef.current)
      expensePickerCloseTimerRef.current = null
    }
    setExpensePicker(null)
    setExpensePickerClosing(false)
    setExpensePickerDragOffset(0)
    setExpensePickerCreateMode(null)
    setExpensePickerCreateName("")
    setExpensePickerCreateError(null)
    expensePickerGestureRef.current.pointerId = null
    expensePickerGestureRef.current.tracking = false
    expensePickerGestureRef.current.draggingSheet = false
    expensePickerGestureRef.current.blockClick = false
    expensePickerTouchRef.current.identifier = null
    expensePickerTouchRef.current.startX = 0
    expensePickerTouchRef.current.startY = 0
  }, [])

  const requestCloseExpensePicker = useCallback(() => {
    if (!expensePicker || expensePickerClosing) return
    setExpensePickerClosing(true)
    if (expensePickerCloseTimerRef.current !== null) {
      window.clearTimeout(expensePickerCloseTimerRef.current)
    }
    expensePickerCloseTimerRef.current = window.setTimeout(() => {
      finalizeExpensePickerClose()
    }, 190)
  }, [expensePicker, expensePickerClosing, finalizeExpensePickerClose])

  const selectExpenseAccount = useCallback((accountId: string) => {
    setSelectedAccountId(accountId)
    setExpenseAccountError(false)
    setError(null)
    requestCloseExpensePicker()
  }, [requestCloseExpensePicker])

  const selectExpenseCategory = useCallback((categoryId: string) => {
    setSelectedCategoryId(categoryId)
    setExpenseCategoryError(false)
    setError(null)
    requestCloseExpensePicker()
  }, [requestCloseExpensePicker])

  const openExpensePickerCreate = useCallback((mode: "account" | "category") => {
    setExpensePickerCreateMode(mode)
    setExpensePickerCreateName("")
    setExpensePickerCreateError(null)
  }, [])

  const closeExpensePickerCreate = useCallback(() => {
    setExpensePickerCreateMode(null)
    setExpensePickerCreateName("")
    setExpensePickerCreateError(null)
  }, [])

  const handleExpensePickerCreateSave = useCallback(() => {
    if (!token || !expensePickerCreateMode) return
    void runPickerCreate(async () => {
      const trimmed = expensePickerCreateName.trim()
      if (!trimmed) {
        setExpensePickerCreateError(expensePickerCreateMode === "account" ? "Введите название счёта" : "Введите название категории")
        return
      }
      if (expensePickerCreateMode === "account") {
        const duplicate = accounts.some((account) => account.name.trim().toLowerCase() === trimmed.toLowerCase())
        if (duplicate) {
          setExpensePickerCreateError("Такое название уже используется")
          return
        }
        await createAccount(token, {
          name: trimmed,
          type: "cash",
          currency: baseCurrency,
          balance: 0,
          color: "#EEF2F7",
          icon: null,
        })
        const accountsData = await getAccounts(token)
        setAccounts(
          accountsData.accounts.map((account) => ({
            id: account.id,
            name: account.name,
            createdAt: account.createdAt ?? null,
            type: account.type,
            balance: { amount: account.balance, currency: account.currency },
            color: account.color ?? undefined,
            icon: account.icon ?? null,
          })),
        )
      } else {
        const duplicate = expenseCategories.some((category) => category.name.trim().toLowerCase() === trimmed.toLowerCase())
        if (duplicate) {
          setExpensePickerCreateError("Такое название уже используется")
          return
        }
        await createCategory(token, { name: trimmed, kind: "expense", icon: null })
        const categoriesData = await getCategories(token)
        setCategories(
          categoriesData.categories.map((category) => ({
            id: category.id,
            name: category.name,
            createdAt: category.createdAt ?? null,
            type: category.kind,
            icon: category.icon ?? null,
            budget: category.budget ?? null,
            isArchived: category.isArchived ?? false,
          })),
        )
      }
      setExpensePickerCreateError(null)
      setExpensePickerCreateMode(null)
      setExpensePickerCreateName("")
    })
  }, [
    accounts,
    baseCurrency,
    expenseCategories,
    expensePickerCreateMode,
    expensePickerCreateName,
    runPickerCreate,
    setAccounts,
    setCategories,
    token,
  ])

  const handleExpenseSave = useCallback(() => {
    const missingAccount = !selectedAccountId
    const missingCategory = !selectedCategoryId
    if (missingAccount || missingCategory) {
      setExpenseAccountError(missingAccount)
      setExpenseCategoryError(missingCategory)
      setError(null)
      return
    }
    setExpenseAccountError(false)
    setExpenseCategoryError(false)
    void submitExpense()
  }, [selectedAccountId, selectedCategoryId, submitExpense])

  const handleExpensePickerPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const gesture = expensePickerGestureRef.current
    gesture.pointerId = event.pointerId
    gesture.startX = event.clientX
    gesture.startY = event.clientY
    gesture.tracking = true
    gesture.draggingSheet = false
    gesture.blockClick = false
  }, [])

  const handleExpensePickerPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const gesture = expensePickerGestureRef.current
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return

    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    const content = expensePickerContentRef.current
    const atTop = !content || content.scrollTop <= 0

    if (!gesture.draggingSheet) {
      if (absDy < 8 || absDy <= absDx) return
      if (dy > 0 && atTop) {
        gesture.draggingSheet = true
        gesture.blockClick = true
      } else {
        gesture.tracking = false
        gesture.pointerId = null
        return
      }
    }

    event.preventDefault()
    const nextOffset = Math.max(0, dy)
    setExpensePickerDragOffset(nextOffset)
  }, [])

  const handleExpensePickerPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const gesture = expensePickerGestureRef.current
    if (gesture.pointerId !== event.pointerId) return

    const shouldClose = gesture.draggingSheet && expensePickerDragOffset > 72
    gesture.pointerId = null
    gesture.tracking = false
    gesture.draggingSheet = false
    gesture.blockClick = false
    if (shouldClose) {
      requestCloseExpensePicker()
      return
    }
    setExpensePickerDragOffset(0)
  }, [expensePickerDragOffset, requestCloseExpensePicker])

  const handleExpensePickerPointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const gesture = expensePickerGestureRef.current
    if (gesture.pointerId !== event.pointerId) return
    gesture.pointerId = null
    gesture.tracking = false
    gesture.draggingSheet = false
    gesture.blockClick = false
    setExpensePickerDragOffset(0)
  }, [])

  const handleExpensePickerClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!expensePickerGestureRef.current.blockClick) return
    event.preventDefault()
    event.stopPropagation()
    expensePickerGestureRef.current.blockClick = false
  }, [])

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
          createdAt: a.createdAt ?? null,
          type: a.type,
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
          createdAt: t.createdAt ?? null,
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
          createdByUserId: t.createdByUserId ?? null,
          createdByName: t.createdByName ?? null,
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
      secondaryAmount?: number
      budget?: number | null
      budgetTone?: "normal" | "warn" | "alert"
    },
    active: boolean,
    kind: "account" | "category" | "income-source" | "goal",
    onSelect?: (id: string) => void,
    tileStyle?: CSSProperties,
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
          style={{
            ...buttonStyle,
            ...(tileStyle ?? {}),
          }}
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
          {isAccount && item.secondaryAmount !== undefined ? (
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                lineHeight: "14px",
                color: secondaryColor,
                textShadow: shadow,
                fontWeight: 600,
              }}
            >
              {formatMoney(item.secondaryAmount, baseCurrency)}
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
        createdAt: g.createdAt ?? null,
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
        createdAt: d.createdAt ?? null,
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
          createdAt: a.createdAt ?? null,
          type: a.type,
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
          createdAt: t.createdAt ?? null,
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
          createdByUserId: t.createdByUserId ?? null,
          createdByName: t.createdByName ?? null,
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
  const activeTabReady = useMemo(() => {
    if (activeTab === "expense") return expenseReady
    if (activeTab === "income") return incomeReady
    if (activeTab === "transfer") return transferReady
    if (activeTab === "debt") return debtReady
    return goalReady
  }, [activeTab, debtReady, expenseReady, goalReady, incomeReady, transferReady])
  const selectedQuickAddType = useMemo(() => {
    if (activeTab === "debt") {
      return debtAction === "receivable" ? "debt_in" : "debt_out"
    }
    return activeTab
  }, [activeTab, debtAction])
  const emitQuickAddOperationSelected = useCallback((type: string) => {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("quick-add-operation-selected", {
        detail: { type },
      }),
    )
  }, [])

  const quickAddAmountEntryDockStyle = useMemo(
    () =>
      ({
        ...quickAddFooterDockStyle,
        zIndex: 260,
        boxShadow: "0 -12px 28px rgba(15,23,42,0.14)",
      }) as const,
    [quickAddFooterDockStyle],
  )

  const activeFooterStyle = isAmountFocused ? quickAddAmountEntryDockStyle : quickAddFooterDockStyle

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
          createdAt: a.createdAt ?? null,
          type: a.type,
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
          createdAt: t.createdAt ?? null,
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
          createdByUserId: t.createdByUserId ?? null,
          createdByName: t.createdByName ?? null,
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
              createdAt: a.createdAt ?? null,
              type: a.type,
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
              createdAt: t.createdAt ?? null,
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
          createdByUserId: t.createdByUserId ?? null,
          createdByName: t.createdByName ?? null,
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

  const handleActiveTabSubmit = useCallback(() => {
    if (activeTab === "expense") {
      void submitExpense()
      return
    }
    if (activeTab === "income") {
      void submitIncome()
      return
    }
    if (activeTab === "transfer") {
      void submitTransfer()
      return
    }
    if (activeTab === "debt") {
      void submitDebt()
      return
    }
    void submitGoal()
  }, [activeTab, submitDebt, submitExpense, submitGoal, submitIncome, submitTransfer])

  return (
    <div
      ref={scrollRef}
      data-quick-add-root="1"
      data-quick-add-type={selectedQuickAddType}
      className="overview"
      onPointerDownCapture={handleChoicePointerDownCapture}
      onPointerMoveCapture={handleChoicePointerMoveCapture}
      onPointerUpCapture={handleChoicePointerUpCapture}
      onPointerCancelCapture={handleChoicePointerCancelCapture}
      onClickCapture={handleChoiceClickCapture}
      style={{
        background: "#f5f6f8",
        height: "100%",
        padding: 0,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "grid", gap: 10, padding: "12px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, color: "#0f172a" }}>Выберите операцию</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#f5f6f8",
                color: "#2563eb",
                fontWeight: 600,
              }}
            >
              Закрыть
            </button>
          </div>
          <div style={{ borderBottom: "1px solid #e5e7eb" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
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
                    emitQuickAddOperationSelected(tab === "debt" ? (debtAction === "receivable" ? "debt_in" : "debt_out") : tab)
                    setError(null)
                  }}
                  style={{
                    minWidth: 0,
                    height: 33,
                    padding: "0 8px",
                    borderRadius: 10,
                    border: activeTab === tab ? "1px solid #0f172a" : "1px solid #e5e7eb",
                    background: activeTab === tab ? "#0f172a" : "#fff",
                    color: activeTab === tab ? "#fff" : "#0f172a",
                    fontWeight: 600,
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    whiteSpace: "nowrap",
                    lineHeight: 1,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                    <AppIcon name={iconMap[tab]} size={11} />
                    <span>{labelMap[tab]}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ borderBottom: "1px solid #e5e7eb" }} />
      </div>
      <div
        data-quick-add-scroll="1"
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehaviorY: "contain",
          touchAction: "pan-y",
          WebkitOverflowScrolling: "touch",
          paddingBottom: activeTab === "expense" ? 16 : footerHeightPx + 16,
        }}
      >

        {activeTab === "expense" ? (
          <div
            style={{
              display: "grid",
              gap: 14,
              padding: "0 16px 16px",
              width: "100%",
              marginInline: 0,
              justifyItems: "stretch",
            }}
          >
            <div style={{ display: "grid", gap: 8, width: "100%" }}>
              <AmountDateRow
                amount={amount}
                onAmountChange={setAmount}
                date={transferDate}
                onDateChange={setTransferDate}
                onAmountFocus={handleAmountFocus}
                onAmountBlur={handleAmountBlur}
                amountInputRef={amountInputRef}
              />
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "center", gap: 16, width: "100%" }}>
              {selectedAccountTile ? (
                renderTile(
                  {
                    id: selectedAccountTile.id,
                    title: selectedAccountTile.title,
                    icon: "wallet",
                    iconKey: selectedAccountTile.iconKey,
                    color: selectedAccountTile.color,
                    amount: selectedAccountTile.amount,
                    secondaryAmount: selectedAccountTile.secondaryAmount,
                  },
                  true,
                  "account",
                  () => openExpensePicker("account"),
                  expenseCompactTileStyle,
                )
              ) : (
                <button
                  type="button"
                  onClick={() => openExpensePicker("account")}
                  style={{
                    ...expenseCompactTileStyle,
                    borderRadius: 12,
                    border: expenseAccountError ? "1px solid #dc2626" : "1px solid #d1d5db",
                    background: "#fff",
                    display: "grid",
                    placeItems: "center",
                    gap: 2,
                    color: "#0f172a",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Счёт</div>
                  <TapHintIcon size={22} color="#94a3b8" />
                  <div style={{ fontSize: 13, color: "#64748b" }}>Выбрать</div>
                </button>
              )}

              <div
                aria-hidden="true"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,0.45)",
                  background: "rgba(255,255,255,0.92)",
                  color: "#475569",
                  fontSize: 12,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                  pointerEvents: "none",
                  flexShrink: 0,
                }}
              >
                →
              </div>

              {selectedExpenseCategoryTile ? (
                renderTile(
                  {
                    id: selectedExpenseCategoryTile.id,
                    title: selectedExpenseCategoryTile.title,
                    iconKey: selectedExpenseCategoryTile.iconKey,
                    amount: selectedExpenseCategoryTile.amount,
                    budget: selectedExpenseCategoryTile.budget,
                    budgetTone: selectedExpenseCategoryTile.budgetTone,
                  },
                  true,
                  "category",
                  () => openExpensePicker("category"),
                  expenseCompactTileStyle,
                )
              ) : (
                <button
                  type="button"
                  onClick={() => openExpensePicker("category")}
                  style={{
                    ...expenseCompactTileStyle,
                    borderRadius: 12,
                    border: expenseCategoryError ? "1px solid #dc2626" : "1px solid #d1d5db",
                    background: "#fff",
                    display: "grid",
                    placeItems: "center",
                    gap: 2,
                    color: "#0f172a",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Категория</div>
                  <TapHintIcon size={22} color="#94a3b8" />
                  <div style={{ fontSize: 13, color: "#64748b" }}>Выбрать</div>
                </button>
              )}
            </div>

            {(expenseAccountError || expenseCategoryError) ? (
              <div style={{ display: "grid", gap: 4 }}>
                {expenseAccountError ? <div style={{ fontSize: 12, color: "#b91c1c" }}>Выберите счёт</div> : null}
                {expenseCategoryError ? <div style={{ fontSize: 12, color: "#b91c1c" }}>Выберите категорию</div> : null}
              </div>
            ) : null}

            <button
              type="button"
              disabled={isRunning}
              onClick={handleExpenseSave}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "none",
                background: !isRunning ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                color: !isRunning ? "#ffffff" : "rgba(255,255,255,0.7)",
                fontWeight: 700,
                cursor: !isRunning ? "pointer" : "not-allowed",
              }}
            >
              {isRunning ? "Сохранение..." : "Сохранить"}
            </button>
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
                    amount: acc.amount,
                    secondaryAmount: acc.secondaryAmount,
                  },
                  selectedAccountId === acc.id,
                  "account",
                  ),
              )}
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
                    amount: acc.amount,
                    secondaryAmount: acc.secondaryAmount,
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
                          amount: acc.amount,
                          secondaryAmount: acc.secondaryAmount,
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

          </div>
        ) : activeTab === "debt" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setDebtAction("receivable")
                  emitQuickAddOperationSelected("debt_in")
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
                  emitQuickAddOperationSelected("debt_out")
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
                          amount: acc.amount,
                          secondaryAmount: acc.secondaryAmount,
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
                        amount: acc.amount,
                        secondaryAmount: acc.secondaryAmount,
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
                    amount: acc.amount,
                    secondaryAmount: acc.secondaryAmount,
                  },
                  selectedAccountId === acc.id,
                  "account",
                  ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Цель</div>
              {activeGoals.length > 0 ? (
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
                      currency={baseCurrency}
                      showSelectedCheck
                      selectedCheckOnly
                    />
                  </div>
                  {showTransferGoalScrollHint && activeGoals.length > 2 ? (
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
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        border: "1px solid rgba(148,163,184,0.45)",
                        background: "rgba(255,255,255,0.88)",
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

          </div>
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Скоро</div>
        )}
      </div>
      {activeTab !== "expense" ? (
        <div
          data-quick-add-footer="1"
          ref={footerRef}
          style={activeFooterStyle}
        >
          <AmountDateRow
            amount={amount}
            onAmountChange={setAmount}
            date={transferDate}
            onDateChange={setTransferDate}
            onAmountFocus={handleAmountFocus}
            onAmountBlur={handleAmountBlur}
            amountInputRef={amountInputRef}
          />
          {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
          <div style={{ paddingTop: 8 }}>
            <button
              type="button"
              disabled={!activeTabReady || isRunning}
              onClick={handleActiveTabSubmit}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "none",
                background: activeTabReady && !isRunning ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                color: activeTabReady && !isRunning ? "#ffffff" : "rgba(255,255,255,0.7)",
                fontWeight: 700,
                cursor: activeTabReady && !isRunning ? "pointer" : "not-allowed",
              }}
            >
              {isRunning ? "Сохранение..." : "Готово"}
            </button>
          </div>
        </div>
      ) : null}
      {activeTab === "expense" && expensePicker ? (
        <div
          role="dialog"
          aria-modal="true"
          ref={expensePickerOverlayRef}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 260,
            background: "rgba(2,6,23,0.35)",
            opacity: expensePickerClosing ? 0 : 1,
            transition: "opacity 180ms ease-out",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={requestCloseExpensePicker}
        >
          <div
            ref={expensePickerSheetRef}
            style={{
              width: "min(480px, 100%)",
              background: "#fff",
              borderRadius: "16px 16px 0 0",
              borderTop: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 -12px 30px rgba(15,23,42,0.2)",
              height: "min(70dvh, calc(var(--app-height, 100dvh) - 24px))",
              minHeight: "min(70dvh, calc(var(--app-height, 100dvh) - 24px))",
              maxHeight: "min(70dvh, calc(var(--app-height, 100dvh) - 24px))",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 8px)",
              transform: expensePickerClosing
                ? "translateY(100%)"
                : expensePickerDragOffset > 0
                ? `translateY(${expensePickerDragOffset}px)`
                : "translateY(0)",
              transition: expensePickerDragOffset > 0 && !expensePickerClosing ? "none" : "transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              touchAction: "pan-y",
            }}
            onPointerDown={handleExpensePickerPointerDown}
            onPointerMove={handleExpensePickerPointerMove}
            onPointerUp={handleExpensePickerPointerEnd}
            onPointerCancel={handleExpensePickerPointerCancel}
            onClickCapture={handleExpensePickerClickCapture}
            onTransitionEnd={(event) => {
              if (event.propertyName !== "transform") return
              if (!expensePickerClosing) return
              finalizeExpensePickerClose()
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid #e5e7eb",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                {expensePicker === "account" ? "Выберите счёт" : "Выберите категорию"}
              </div>
              <button
                type="button"
                onClick={requestCloseExpensePicker}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  background: "#fff",
                  color: "#0f172a",
                  padding: "6px 10px",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Закрыть
              </button>
            </div>
            <div
              ref={expensePickerContentRef}
              style={{
                padding: 12,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorY: "contain",
                minHeight: 0,
                flex: "1 1 auto",
              }}
            >
              {expensePickerCreateMode ? (
                <div style={{ display: "grid", gap: 12, width: "min(360px, 100%)", marginInline: "auto" }}>
                  <div style={{ fontSize: 13, color: "#475569", textAlign: "center" }}>
                    {expensePickerCreateMode === "account" ? "Новый счёт" : "Новая категория"}
                  </div>
                  <input
                    value={expensePickerCreateName}
                    onChange={(event) => {
                      setExpensePickerCreateName(event.target.value)
                      if (expensePickerCreateError) setExpensePickerCreateError(null)
                    }}
                    placeholder={expensePickerCreateMode === "account" ? "Название счёта" : "Название категории"}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: expensePickerCreateError ? "1px solid #dc2626" : "1px solid #d1d5db",
                      background: "#fff",
                      fontSize: 14,
                      color: "#0f172a",
                    }}
                  />
                  {expensePickerCreateError ? (
                    <div style={{ color: "#b91c1c", fontSize: 12 }}>{expensePickerCreateError}</div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    <button
                      type="button"
                      onClick={closeExpensePickerCreate}
                      disabled={isPickerCreateRunning}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        color: "#334155",
                        fontWeight: 600,
                      }}
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={handleExpensePickerCreateSave}
                      disabled={isPickerCreateRunning}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #0f172a",
                        background: "#0f172a",
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {isPickerCreateRunning ? "Сохранение..." : "Сохранить"}
                    </button>
                  </div>
                </div>
              ) : expensePicker === "account" ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 10,
                    justifyItems: "stretch",
                  }}
                >
                  {accountTiles.map((acc) =>
                    renderTile(
                      {
                        id: acc.id,
                        title: acc.title,
                        icon: "wallet",
                        iconKey: acc.iconKey,
                        color: acc.color,
                        amount: acc.amount,
                        secondaryAmount: acc.secondaryAmount,
                      },
                      selectedAccountId === acc.id,
                      "account",
                      selectExpenseAccount,
                      {
                        width: "100%",
                        minWidth: 0,
                        maxWidth: "100%",
                        minHeight: 124,
                      },
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => openExpensePickerCreate("account")}
                    className="tile-card tile-card--add overview-add-tile"
                    style={{ width: "100%", minWidth: 0, maxWidth: "100%", minHeight: 124 }}
                  >
                    <div className="tile-card__icon">+</div>
                    <div className="tile-card__title">Добавить</div>
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 10,
                    justifyItems: "stretch",
                  }}
                >
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
                      selectExpenseCategory,
                      expenseCompactCategorySheetTileStyle,
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => openExpensePickerCreate("category")}
                    className="tile-card tile-card--add overview-add-tile"
                    style={{ width: "100%", minWidth: 0, maxWidth: "100%", minHeight: 96 }}
                  >
                    <div className="tile-card__icon">+</div>
                    <div className="tile-card__title">Добавить</div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default QuickAddScreen
