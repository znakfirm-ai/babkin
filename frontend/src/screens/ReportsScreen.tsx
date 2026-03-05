import { useEffect, useMemo, useRef, useState } from "react"
import "../components/TransactionModal.css"
import { useAppStore } from "../store/useAppStore"
import { formatMoney } from "../utils/formatMoney"
import { FinanceIcon, isFinanceIconKey } from "../shared/icons/financeIcons"
import { format } from "../utils/date"

type Props = {
  onOpenSummary: () => void
  onOpenExpensesByCategory?: () => void
  onOpenCategorySheet?: (id: string, title: string) => void
  autoOpenExpensesSheet?: boolean
  onConsumeAutoOpenExpenses?: () => void
  onOpenIncomeSourceSheet?: (
    id: string,
    state: {
      periodMode: "day" | "week" | "month" | "quarter" | "year" | "custom"
      monthOffset: number
      bannerOffset: number
      customFrom: string
      customTo: string
      singleDay: string
    },
  ) => void
  autoOpenIncomeSheet?: boolean
  onConsumeAutoOpenIncome?: () => void
  onOpenCompareDrilldown?: (kind: CompareListMode, id: string, state: CompareReportState) => void
  autoOpenCompareSheet?: boolean
  onConsumeAutoOpenCompare?: () => void
  compareReportState?: CompareReportState | null
  onOpenPayableDebtsSheet?: () => void
  incomeReportState?: {
    periodMode: "day" | "week" | "month" | "quarter" | "year" | "custom"
    monthOffset: number
    bannerOffset: number
    customFrom: string
    customTo: string
    singleDay: string
  } | null
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]
type ComparePeriodMode = "day" | "week" | "month" | "quarter" | "year" | "custom"
type ReportPeriodMode = "day" | "week" | "month" | "quarter" | "year" | "custom"
type CompareListMode = "income" | "expense"
type CompareReportState = {
  periodMode: ComparePeriodMode
  customFrom: string
  customTo: string
  activeBinKey: string | null
  listMode: CompareListMode
  historyOffset: number
}
type CompareBin = {
  key: string
  start: Date
  end: Date
  label: string
  isCurrentMonth: boolean
}
const REPORT_GROUP_GOALS_ID = "__report_goals__"
const REPORT_GROUP_DEBTS_ID = "__report_debts__"
const REPORT_GROUP_UNCATEGORIZED_ID = "uncategorized"
const REPORT_PERIOD_OPTIONS: Array<{ key: ReportPeriodMode; label: string }> = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Год" },
  { key: "custom", label: "Свой" },
]

type ReportPeriodPickerButtonProps = {
  buttonLabel: string
  isOpen: boolean
  selectedPeriod: ReportPeriodMode
  buttonRef: { current: HTMLButtonElement | null }
  popoverWidth: number | null
  onToggle: () => void
  onClose: () => void
  onSelect: (period: ReportPeriodMode) => void
}

const ReportPeriodPickerButton: React.FC<ReportPeriodPickerButtonProps> = ({
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
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #0f172a",
          background: "#0f172a",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          minWidth: 96,
        }}
        onClick={onToggle}
      >
        {buttonLabel}
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>▾</span>
      </button>
      {isOpen ? (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 4 }} onClick={onClose} />
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
              zIndex: 5,
              width: popoverWidth ?? "100%",
              display: "grid",
              gap: 4,
              padding: 8,
            }}
          >
            {REPORT_PERIOD_OPTIONS.map((option) => (
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

const resolveReportGroupId = (tx: { goalId?: string | null; debtorId?: string | null; categoryId?: string | null; incomeSourceId?: string | null }) => {
  if (tx.goalId) return REPORT_GROUP_GOALS_ID
  if (tx.debtorId) return REPORT_GROUP_DEBTS_ID
  return tx.incomeSourceId ?? tx.categoryId ?? REPORT_GROUP_UNCATEGORIZED_ID
}

const getMonthRange = (offset: number) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const target = new Date(year, month + offset, 1, 0, 0, 0, 0)
  const start = new Date(target.getFullYear(), target.getMonth(), 1, 0, 0, 0, 0)
  const end =
    offset === 0
      ? now
      : new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end, label: `${MONTHS[target.getMonth()]} ${target.getFullYear()}` }
}

const toDayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
const toDayEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const parseIsoDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
const formatDdMm = (date: Date) => `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`
const getWeekStartMonday = (date: Date) => {
  const start = toDayStart(date)
  const weekDay = start.getDay() === 0 ? 7 : start.getDay()
  return addDays(start, 1 - weekDay)
}
const buildCompareBins = (mode: ComparePeriodMode, customFrom: string, customTo: string, now: Date, historyOffset: number): CompareBin[] => {
  const buildSequence = (count: number, resolver: (offset: number) => CompareBin) =>
    Array.from({ length: count }, (_, idx) => resolver(historyOffset + (count - 1 - idx)))

  if (mode === "day") {
    const baseStart = toDayStart(now)
    return buildSequence(5, (offset) => {
      const start = addDays(baseStart, -offset)
      const end = toDayEnd(start)
      return {
        key: `day:${toIsoDate(start)}`,
        start,
        end,
        label: formatDdMm(start),
        isCurrentMonth: false,
      }
    })
  }
  if (mode === "week") {
    const baseStart = getWeekStartMonday(now)
    return buildSequence(5, (offset) => {
      const start = addDays(baseStart, -offset * 7)
      const end = toDayEnd(addDays(start, 6))
      return {
        key: `week:${toIsoDate(start)}`,
        start,
        end,
        label: `${formatDdMm(start)}-${formatDdMm(end)}`,
        isCurrentMonth: false,
      }
    })
  }
  if (mode === "month") {
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth()
    const baseStart = new Date(nowYear, nowMonth, 1, 0, 0, 0, 0)
    return buildSequence(5, (offset) => {
      const start = new Date(baseStart.getFullYear(), baseStart.getMonth() - offset, 1, 0, 0, 0, 0)
      const end = toDayEnd(new Date(start.getFullYear(), start.getMonth() + 1, 0))
      const monthName = MONTHS[start.getMonth()]
      const label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}`
      return {
        key: `month:${start.getFullYear()}-${start.getMonth() + 1}`,
        start,
        end,
        label,
        isCurrentMonth: start.getFullYear() === nowYear && start.getMonth() === nowMonth,
      }
    })
  }
  if (mode === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    const baseStart = new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0)
    return buildSequence(5, (offset) => {
      const start = new Date(baseStart.getFullYear(), baseStart.getMonth() - offset * 3, 1, 0, 0, 0, 0)
      const end = toDayEnd(new Date(start.getFullYear(), start.getMonth() + 3, 0))
      return {
        key: `quarter:${toIsoDate(start)}`,
        start,
        end,
        label: `${formatDdMm(start)}-${formatDdMm(end)}`,
        isCurrentMonth: false,
      }
    })
  }
  if (mode === "year") {
    return buildSequence(5, (offset) => {
      const year = now.getFullYear() - offset
      const start = new Date(year, 0, 1, 0, 0, 0, 0)
      const end = toDayEnd(new Date(year, 11, 31))
      return {
        key: `year:${year}`,
        start,
        end,
        label: String(year),
        isCurrentMonth: false,
      }
    })
  }

  const customFromDate = parseIsoDate(customFrom)
  const customToDate = parseIsoDate(customTo)
  const fallbackStart = toDayStart(now)
  const fallbackEnd = toDayEnd(now)
  const selectedStartRaw = customFromDate ?? fallbackStart
  const selectedEndRaw = customToDate ?? fallbackEnd
  const selectedStart = selectedStartRaw <= selectedEndRaw ? toDayStart(selectedStartRaw) : toDayStart(selectedEndRaw)
  const selectedEnd = selectedStartRaw <= selectedEndRaw ? toDayEnd(selectedEndRaw) : toDayEnd(selectedStartRaw)
  const intervalDays = Math.max(1, Math.floor((selectedEnd.getTime() - selectedStart.getTime()) / (24 * 60 * 60 * 1000)) + 1)

  return buildSequence(5, (offset) => {
    const start = toDayStart(addDays(selectedStart, -offset * intervalDays))
    const end = toDayEnd(addDays(start, intervalDays - 1))
    return {
      key: `custom:${toIsoDate(start)}:${toIsoDate(end)}`,
      start,
      end,
      label: `${formatDdMm(start)}-${formatDdMm(end)}`,
      isCurrentMonth: false,
    }
  })
}

const ReportsScreen: React.FC<Props> = ({
  onOpenExpensesByCategory: _onOpenExpensesByCategory,
  onOpenCategorySheet,
  autoOpenExpensesSheet,
  onConsumeAutoOpenExpenses,
  onOpenIncomeSourceSheet,
  autoOpenIncomeSheet,
  onConsumeAutoOpenIncome,
  onOpenCompareDrilldown,
  autoOpenCompareSheet,
  onConsumeAutoOpenCompare,
  compareReportState,
  onOpenPayableDebtsSheet,
  incomeReportState,
}) => {
  const { transactions, categories, incomeSources, currency } = useAppStore()
  const [monthOffset, setMonthOffset] = useState(0)
  const [weekOffset] = useState(0)
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [singleDay, setSingleDay] = useState("")
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false)
  const [hasPeriodSelection, setHasPeriodSelection] = useState(false)
  const periodButtonRef = useRef<HTMLButtonElement | null>(null)
  const [periodPopoverWidth, setPeriodPopoverWidth] = useState<number | null>(null)
  const [isExpensesSheetOpen, setIsExpensesSheetOpen] = useState(false)
  const [isIncomeSheetOpen, setIsIncomeSheetOpen] = useState(false)
  const [isCompareSheetOpen, setIsCompareSheetOpen] = useState(false)
  const [selectedLegendIndex, setSelectedLegendIndex] = useState<number | null>(null)
  const [bannerOffset, setBannerOffset] = useState(0)
  const [comparePeriodMode, setComparePeriodMode] = useState<ComparePeriodMode>("month")
  const [isComparePeriodMenuOpen, setIsComparePeriodMenuOpen] = useState(false)
  const [hasComparePeriodSelection, setHasComparePeriodSelection] = useState(false)
  const comparePeriodButtonRef = useRef<HTMLButtonElement | null>(null)
  const [comparePeriodPopoverWidth, setComparePeriodPopoverWidth] = useState<number | null>(null)
  const [compareCustomFrom, setCompareCustomFrom] = useState("")
  const [compareCustomTo, setCompareCustomTo] = useState("")
  const [compareActiveBinKey, setCompareActiveBinKey] = useState<string | null>(null)
  const [compareListMode, setCompareListMode] = useState<CompareListMode>("income")
  const [compareHistoryOffset, setCompareHistoryOffset] = useState(0)
  const compareIncomeLineColor = "#9ddfc5"
  const compareExpenseLineColor = "#f7b2a4"
  const todayDate = useMemo(() => format(new Date()), [])

  const monthRange = useMemo(() => getMonthRange(monthOffset), [monthOffset])

  const currentRange = useMemo(() => {
    const now = new Date()

    const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

    if (periodMode === "day") {
      const picked = singleDay ? new Date(singleDay) : now
      return { start: dayStart(picked), end: dayEnd(picked), label: format(picked) }
    }
    if (periodMode === "week") {
      const dow = now.getDay() === 0 ? 7 : now.getDay()
      const baseStart = dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dow - 1)))
      const start = dayStart(new Date(baseStart.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000))
      const end = dayEnd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6))
      return { start, end, label: "" }
    }
    if (periodMode === "month") {
      const { start, end, label } = monthRange
      return { start, end, label }
    }
    if (periodMode === "quarter") {
      const month = now.getMonth()
      const qStartMonth = Math.floor(month / 3) * 3
      const start = new Date(now.getFullYear(), qStartMonth, 1, 0, 0, 0, 0)
      const end = new Date(now.getFullYear(), qStartMonth + 3, 0, 23, 59, 59, 999)
      const qNum = Math.floor(month / 3) + 1
      return { start, end, label: `${qNum} кв. ${now.getFullYear()}` }
    }
    if (periodMode === "year") {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
      const end = new Date(now.getFullYear(), 12, 0, 23, 59, 59, 999)
      return { start, end, label: `${now.getFullYear()}` }
    }
    const fromDate = customFrom ? new Date(customFrom) : now
    const toDate = customTo ? new Date(customTo) : now
    return { start: dayStart(fromDate), end: dayEnd(toDate), label: "" }
  }, [customFrom, customTo, monthRange, periodMode, singleDay])

  const minDate = useMemo(() => new Date(2022, 1, 1, 0, 0, 0, 0), [])
  const baseMonthRange = monthRange
  const minBannerOffset = useMemo(() => {
    const base = baseMonthRange.start
    const diffMonths = (base.getFullYear() - minDate.getFullYear()) * 12 + (base.getMonth() - minDate.getMonth())
    return -diffMonths
  }, [baseMonthRange.start, minDate])

  const getShiftedRange = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000
    const addDays = (date: Date, days: number) => new Date(date.getTime() + days * dayMs)
    const diffDaysInclusive = (start: Date, end: Date) => Math.floor((end.getTime() - start.getTime()) / dayMs) + 1

    return (offset: number) => {
      if (periodMode === "month") {
        return getMonthRange(monthOffset + offset)
      }
      if (!currentRange.start || !currentRange.end) return currentRange

      if (periodMode === "week") {
        const start = addDays(currentRange.start, offset * 7)
        const end = addDays(start, 6)
        return { start, end, label: "" }
      }

      if (periodMode === "day") {
        const start = addDays(currentRange.start, offset)
        const end = addDays(currentRange.end, offset)
        return { start, end, label: "" }
      }

      if (periodMode === "custom") {
        const days = diffDaysInclusive(currentRange.start, currentRange.end)
        const start = addDays(currentRange.start, offset * days)
        const end = addDays(currentRange.end, offset * days)
        return { start, end, label: "" }
      }

      if (periodMode === "quarter") {
        const baseStart = currentRange.start
        const qStartMonth = Math.floor(baseStart.getMonth() / 3) * 3
        const base = new Date(baseStart.getFullYear(), qStartMonth, 1, 0, 0, 0, 0)
        const shifted = new Date(base.getFullYear(), base.getMonth() + offset * 3, 1, 0, 0, 0, 0)
        const start = shifted
        const end = new Date(shifted.getFullYear(), shifted.getMonth() + 3, 0, 23, 59, 59, 999)
        const qNum = Math.floor(shifted.getMonth() / 3) + 1
        return { start, end, label: `${qNum} кв. ${shifted.getFullYear()}` }
      }

      if (periodMode === "year") {
        const baseStart = currentRange.start
        const base = new Date(baseStart.getFullYear(), 0, 1, 0, 0, 0, 0)
        const shifted = new Date(base.getFullYear() + offset, 0, 1, 0, 0, 0, 0)
        const start = shifted
        const end = new Date(shifted.getFullYear(), 12, 0, 23, 59, 59, 999)
        return { start, end, label: `${shifted.getFullYear()}` }
      }

      return currentRange
    }
  }, [currentRange, monthOffset, periodMode])

  const effectiveRange = useMemo(() => {
    if (periodMode === "month") {
      const safeOffset = Math.max(minBannerOffset, Math.min(0, bannerOffset))
      return getShiftedRange(safeOffset)
    }
    return getShiftedRange(bannerOffset)
  }, [bannerOffset, getShiftedRange, minBannerOffset, periodMode])

  const canPrevBanner = useMemo(() => {
    const prevRange = getShiftedRange(bannerOffset - 1)
    return prevRange.start ? prevRange.start >= minDate : false
  }, [bannerOffset, getShiftedRange, minDate])

  const canNextBanner = bannerOffset < 0

  const comparePeriodOptions = REPORT_PERIOD_OPTIONS
  const periodLabelByKey = useMemo(
    () =>
      REPORT_PERIOD_OPTIONS.reduce<Record<ReportPeriodMode, string>>((acc, option) => {
        acc[option.key] = option.label
        return acc
      }, {} as Record<ReportPeriodMode, string>),
    [],
  )
  const comparePeriodLabelByKey = useMemo(
    () =>
      comparePeriodOptions.reduce<Record<ComparePeriodMode, string>>((acc, option) => {
        acc[option.key] = option.label
        return acc
      }, {} as Record<ComparePeriodMode, string>),
    [comparePeriodOptions],
  )

  const compareMinDate = useMemo(() => new Date(2022, 1, 1, 0, 0, 0, 0), [])
  const compareBins = useMemo(
    () =>
      buildCompareBins(comparePeriodMode, compareCustomFrom, compareCustomTo, new Date(), compareHistoryOffset).filter(
        (bin) => bin.end >= compareMinDate,
      ),
    [compareCustomFrom, compareCustomTo, compareHistoryOffset, compareMinDate, comparePeriodMode],
  )
  const compareMainBins = useMemo(() => compareBins.slice(-4), [compareBins])
  const canComparePrev = useMemo(() => {
    const nextBins = buildCompareBins(comparePeriodMode, compareCustomFrom, compareCustomTo, new Date(), compareHistoryOffset + 1).filter(
      (bin) => bin.end >= compareMinDate,
    )
    return nextBins.length >= 5
  }, [compareCustomFrom, compareCustomTo, compareHistoryOffset, compareMinDate, comparePeriodMode])
  const canCompareNext = compareHistoryOffset > 0

  useEffect(() => {
    if (compareMainBins.length === 0) {
      if (compareActiveBinKey !== null) setCompareActiveBinKey(null)
      return
    }
    const hasActiveKey = compareActiveBinKey !== null && compareMainBins.some((bin) => bin.key === compareActiveBinKey)
    if (!hasActiveKey) {
      setCompareActiveBinKey(compareMainBins[compareMainBins.length - 1]?.key ?? null)
    }
  }, [compareActiveBinKey, compareMainBins])

  const compareActiveBin = useMemo(() => {
    if (compareMainBins.length === 0) return null
    if (!compareActiveBinKey) return compareMainBins[compareMainBins.length - 1] ?? null
    return compareMainBins.find((bin) => bin.key === compareActiveBinKey) ?? compareMainBins[compareMainBins.length - 1] ?? null
  }, [compareActiveBinKey, compareMainBins])

  const compareSeries = useMemo(() => {
    return compareBins.map((bin) => {
      let income = 0
      let expense = 0
      transactions.forEach((transaction) => {
        const date = new Date(transaction.date)
        if (date < bin.start || date > bin.end) return
        const kind = (transaction as { type?: string }).type ?? (transaction as { kind?: string }).kind
        if (kind !== "income" && kind !== "expense") return
        if (kind === "expense" && (transaction as { kind?: string }).kind === "adjustment") return
        const amount = transaction.amount?.amount ?? 0
        if (kind === "income") income += amount
        else expense += amount
      })
      return { ...bin, income, expense }
    })
  }, [compareBins, transactions])

  const compareMainSeries = useMemo(() => compareSeries.slice(-4), [compareSeries])
  const comparePreviewSeries = useMemo(
    () => (compareSeries.length > compareMainSeries.length ? compareSeries[0] : null),
    [compareMainSeries.length, compareSeries],
  )

  const compareChartMax = useMemo(() => {
    const values = compareSeries.flatMap((item) => [item.income, item.expense])
    return Math.max(...(values.length ? values : [0]), 0)
  }, [compareSeries])

  const periodButtonLabel = hasPeriodSelection ? periodLabelByKey[periodMode] : "Период"
  const comparePeriodButtonLabel = hasComparePeriodSelection ? comparePeriodLabelByKey[comparePeriodMode] : "Период"
  const togglePeriodMenu = () => {
    if (!isPeriodMenuOpen) {
      const buttonWidth = periodButtonRef.current?.getBoundingClientRect().width
      if (buttonWidth) {
        setPeriodPopoverWidth(buttonWidth)
      }
    }
    setIsPeriodMenuOpen((prev) => !prev)
  }
  const closePeriodMenu = () => setIsPeriodMenuOpen(false)
  const selectPeriodMode = (nextMode: ReportPeriodMode) => {
    setPeriodMode(nextMode)
    setHasPeriodSelection(true)
    setIsPeriodMenuOpen(false)
    if (nextMode === "day") {
      setSingleDay(todayDate)
    }
    if (nextMode === "custom") {
      setCustomFrom(customFrom || todayDate)
      setCustomTo(customTo || todayDate)
    }
    if (nextMode === "month") {
      setMonthOffset(0)
    }
    setBannerOffset(0)
  }
  const toggleComparePeriodMenu = () => {
    if (!isComparePeriodMenuOpen) {
      const buttonWidth = comparePeriodButtonRef.current?.getBoundingClientRect().width
      if (buttonWidth) {
        setComparePeriodPopoverWidth(buttonWidth)
      }
    }
    setIsComparePeriodMenuOpen((prev) => !prev)
  }
  const closeComparePeriodMenu = () => setIsComparePeriodMenuOpen(false)
  const selectComparePeriodMode = (nextMode: ComparePeriodMode) => {
    setComparePeriodMode(nextMode)
    setHasComparePeriodSelection(true)
    setIsComparePeriodMenuOpen(false)
    setCompareActiveBinKey(null)
    setCompareHistoryOffset(0)
    if (nextMode === "custom") {
      const nextFrom = compareCustomFrom || todayDate
      const nextTo = compareCustomTo || todayDate
      setCompareCustomFrom(nextFrom)
      setCompareCustomTo(nextTo)
    }
  }
  const applyCompareCustomDate = (target: "from" | "to", value: string) => {
    const nextValue = value || todayDate
    const fromValue = target === "from" ? nextValue : compareCustomFrom || todayDate
    const toValue = target === "to" ? nextValue : compareCustomTo || todayDate
    if (fromValue <= toValue) {
      setCompareCustomFrom(fromValue)
      setCompareCustomTo(toValue)
    } else if (target === "from") {
      setCompareCustomFrom(fromValue)
      setCompareCustomTo(fromValue)
    } else {
      setCompareCustomFrom(toValue)
      setCompareCustomTo(toValue)
    }
    setCompareActiveBinKey(null)
    setCompareHistoryOffset(0)
  }

  const compareIncomeList = useMemo(() => {
    if (!compareActiveBin) return []
    const totals = new Map<string, number>()
    transactions.forEach((transaction) => {
      const date = new Date(transaction.date)
      if (date < compareActiveBin.start || date > compareActiveBin.end) return
      const kind = (transaction as { type?: string }).type ?? (transaction as { kind?: string }).kind
      if (kind !== "income") return
      const sourceId = (transaction as { incomeSourceId?: string | null }).incomeSourceId ?? REPORT_GROUP_UNCATEGORIZED_ID
      const amount = transaction.amount?.amount ?? 0
      totals.set(sourceId, (totals.get(sourceId) ?? 0) + amount)
    })
    return Array.from(totals.entries())
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => ({
        id,
        title: incomeSources.find((source) => source.id === id)?.name ?? "Без источника",
        iconKey: incomeSources.find((source) => source.id === id)?.icon ?? null,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [compareActiveBin, incomeSources, transactions])

  const compareExpenseList = useMemo(() => {
    if (!compareActiveBin) return []
    const totals = new Map<string, number>()
    transactions.forEach((transaction) => {
      const date = new Date(transaction.date)
      if (date < compareActiveBin.start || date > compareActiveBin.end) return
      const kind = (transaction as { type?: string }).type ?? (transaction as { kind?: string }).kind
      if (kind !== "expense") return
      if ((transaction as { kind?: string }).kind === "adjustment") return
      const categoryId = (transaction as { categoryId?: string | null }).categoryId ?? REPORT_GROUP_UNCATEGORIZED_ID
      const amount = transaction.amount?.amount ?? 0
      totals.set(categoryId, (totals.get(categoryId) ?? 0) + amount)
    })
    return Array.from(totals.entries())
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => ({
        id,
        title: categories.find((category) => category.id === id)?.name ?? "Без категории",
        iconKey: categories.find((category) => category.id === id)?.icon ?? null,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [categories, compareActiveBin, transactions])
  const compareIncomeTotal = useMemo(() => compareIncomeList.reduce((sum, item) => sum + item.amount, 0), [compareIncomeList])
  const compareExpenseTotal = useMemo(() => compareExpenseList.reduce((sum, item) => sum + item.amount, 0), [compareExpenseList])
  const compareDrilldownState = useMemo<CompareReportState>(
    () => ({
      periodMode: comparePeriodMode,
      customFrom: compareCustomFrom,
      customTo: compareCustomTo,
      activeBinKey: compareActiveBinKey,
      listMode: compareListMode,
      historyOffset: compareHistoryOffset,
    }),
    [compareActiveBinKey, compareCustomFrom, compareCustomTo, compareHistoryOffset, compareListMode, comparePeriodMode],
  )
  const compareActiveList = compareListMode === "income" ? compareIncomeList : compareExpenseList
  const compareActiveTotal = compareListMode === "income" ? compareIncomeTotal : compareExpenseTotal
  const shiftCompareBackFromPreview = () => {
    if (!canComparePrev) return
    const previewKey = comparePreviewSeries?.key ?? null
    setCompareHistoryOffset((prev) => prev + 1)
    setCompareActiveBinKey(previewKey)
  }
  const shiftCompareForwardFromRightEdge = () => {
    const rightEdgeKey = compareMainSeries[compareMainSeries.length - 1]?.key ?? null
    if (canCompareNext) {
      const targetOffset = Math.max(0, compareHistoryOffset - 1)
      setCompareHistoryOffset(targetOffset)
      setCompareActiveBinKey(rightEdgeKey)
      return
    }
    setCompareActiveBinKey(rightEdgeKey)
  }
  const openCompareReportDefault = () => {
    setComparePeriodMode("month")
    setHasComparePeriodSelection(false)
    setCompareHistoryOffset(0)
    setCompareActiveBinKey(null)
    setCompareCustomFrom(todayDate)
    setCompareCustomTo(todayDate)
    setCompareListMode("income")
    setIsComparePeriodMenuOpen(false)
    setIsCompareSheetOpen(true)
    setIsExpensesSheetOpen(false)
    setIsIncomeSheetOpen(false)
  }
  const openExpenseReport = () => {
    setIsExpensesSheetOpen(true)
    setIsIncomeSheetOpen(false)
    setIsCompareSheetOpen(false)
    setIsComparePeriodMenuOpen(false)
  }
  const openIncomeReport = () => {
    setIsIncomeSheetOpen(true)
    setIsExpensesSheetOpen(false)
    setIsCompareSheetOpen(false)
    setIsComparePeriodMenuOpen(false)
  }
  const reportListItems = [
    {
      key: "income",
      title: "Доходы",
      description: "Поступления по категориям за выбранный период. Показывает структуру доходов и их источники.",
      onClick: openIncomeReport,
    },
    {
      key: "expense",
      title: "Расходы",
      description: "Траты по категориям за выбранный период. Помогает анализировать расходы и принимать взвешенные решения.",
      onClick: openExpenseReport,
    },
    {
      key: "compare",
      title: "Доходы и Расходы",
      description:
        "Сравнение за выбранный период на одном графике. Показывает соотношение доходов и расходов, а также их категории.",
      onClick: openCompareReportDefault,
    },
  ] as const

  const expenseData = useMemo(() => {
    if (!effectiveRange.start || !effectiveRange.end) {
      return { total: 0, slices: [], sliceLabels: [], colors: [], list: [] }
    }
    const totals = new Map<string, number>()
    let total = 0
    transactions.forEach((t) => {
      const date = new Date(t.date)
      if (date < effectiveRange.start || date > effectiveRange.end) return
      const kind = (t as { type?: string }).type ?? (t as { kind?: string }).kind
      if (kind !== "expense") return
      if ((t as { kind?: string }).kind === "adjustment") return
      const catId = resolveReportGroupId({
        goalId: (t as { goalId?: string | null }).goalId ?? null,
        debtorId: (t as { debtorId?: string | null }).debtorId ?? null,
        categoryId: (t as { categoryId?: string | null }).categoryId ?? null,
      })
      const amt = t.amount?.amount ?? 0
      totals.set(catId, (totals.get(catId) ?? 0) + amt)
      total += amt
    })
    const items = Array.from(totals.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([categoryId, sum]) => {
        const cat = categories.find((c) => c.id === categoryId)
        const isGoals = categoryId === REPORT_GROUP_GOALS_ID
        const isDebts = categoryId === REPORT_GROUP_DEBTS_ID
        return {
          id: categoryId,
          title: isGoals ? "Цели" : isDebts ? "Долги / Кредиты" : cat?.name ?? "Без категории",
          iconKey: isDebts ? "debt" : cat?.icon ?? null,
          sum,
        }
      })

    const top = items.slice(0, 6)
    const restSum = items.slice(6).reduce((acc, i) => acc + i.sum, 0)
    const slices = [...top.map((i) => i.sum), restSum > 0 ? restSum : 0].filter((v) => v > 0)
    const sliceLabels = [...top.map((i) => i.title), restSum > 0 ? "Остальное" : null].filter(Boolean) as string[]
    const colors = ["#0f172a", "#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9"]

    const list = items.map((i) => {
      const percent = total > 0 ? (i.sum / total) * 100 : 0
      const percentText = percent > 0 && percent < 1 ? "<1%" : `${Math.round(Math.min(100, percent))}%`
      return { ...i, percentText }
    })
    return { total, slices, sliceLabels, colors, list }
  }, [categories, effectiveRange.end, effectiveRange.start, transactions])

  const formatDisplayDate = (date: Date) =>
    new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(date)

  const periodDisplayText = useMemo(() => {
    if (!effectiveRange.start || !effectiveRange.end) return ""
    if (effectiveRange.start.getTime() === effectiveRange.end.getTime()) {
      const text = formatDisplayDate(effectiveRange.start)
      return text.charAt(0).toUpperCase() + text.slice(1)
    }
    if (periodMode === "month" && effectiveRange.label) {
      return effectiveRange.label.charAt(0).toUpperCase() + effectiveRange.label.slice(1)
    }
    if (periodMode === "quarter" && effectiveRange.label) {
      const fmt = new Intl.DateTimeFormat("ru-RU", { month: "long" })
      const startName = fmt.format(effectiveRange.start).toLowerCase()
      const endName = fmt.format(effectiveRange.end).toLowerCase()
      const year = effectiveRange.start.getFullYear()
      return `${startName}–${endName} ${year}`
    }
    if (periodMode === "year" && effectiveRange.label) {
      return effectiveRange.label
    }
    const fromText = formatDisplayDate(effectiveRange.start)
    const toText = formatDisplayDate(effectiveRange.end)
    return `${fromText} — ${toText}`
  }, [effectiveRange.end, effectiveRange.label, effectiveRange.start, periodMode])

  useEffect(() => {
    setBannerOffset(0)
  }, [periodMode, monthOffset])

  const donutData = useMemo(() => {
    const palette = ["#9CC3FF", "#B9E4C9", "#FFD6A5", "#D9C2FF"]
    const top = expenseData.list.slice(0, 4)
    const restSum = expenseData.list.slice(4).reduce((acc, i) => acc + i.sum, 0)
    const segments = top.map((item, idx) => ({ color: palette[idx % palette.length], value: item.sum }))
    if (restSum > 0) segments.push({ color: "#E5E7EB", value: restSum })
    return { segments, total: expenseData.total }
  }, [expenseData.list, expenseData.total])

  const legendItems = useMemo(() => {
    const palette = ["#9CC3FF", "#B9E4C9", "#FFD6A5", "#D9C2FF"]
    const top = expenseData.list.slice(0, 4)
    const restSum = expenseData.list.slice(4).reduce((acc, i) => acc + i.sum, 0)
    const items = top.map((item, idx) => ({
      title: item.title,
      value: item.sum,
      color: palette[idx % palette.length],
    }))
    if (restSum > 0) {
      items.push({ title: "Остальное", value: restSum, color: "#E5E7EB" })
    }
    return items.map((item) => {
      const percent = donutData.total > 0 ? (item.value / donutData.total) * 100 : 0
      const percentText = percent > 0 && percent < 1 ? "<1%" : `${Math.round(Math.min(100, percent))}%`
      return { ...item, percentText }
    })
  }, [donutData.total, expenseData.list])

  const topLegendColorById = useMemo(() => {
    const palette = ["#9CC3FF", "#B9E4C9", "#FFD6A5", "#D9C2FF"]
    return expenseData.list.slice(0, 4).reduce<Record<string, string>>((acc, item, idx) => {
      acc[item.id] = palette[idx % palette.length]
      return acc
    }, {})
  }, [expenseData.list])

  const incomeData = useMemo(() => {
    if (!effectiveRange.start || !effectiveRange.end) {
      return { total: 0, segments: [], list: [] }
    }
    const totals = new Map<string, number>()
    let total = 0
    transactions.forEach((t) => {
      const date = new Date(t.date)
      if (date < effectiveRange.start || date > effectiveRange.end) return
      const kind = (t as { type?: string }).type ?? (t as { kind?: string }).kind
      if (kind !== "income") return
      const groupId = resolveReportGroupId({
        goalId: (t as { goalId?: string | null }).goalId ?? null,
        debtorId: (t as { debtorId?: string | null }).debtorId ?? null,
        incomeSourceId: (t as { incomeSourceId?: string | null }).incomeSourceId ?? null,
        categoryId: (t as { categoryId?: string | null }).categoryId ?? null,
      })
      const amt = t.amount?.amount ?? 0
      totals.set(groupId, (totals.get(groupId) ?? 0) + amt)
      total += amt
    })
    const items = Array.from(totals.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([groupId, sum]) => {
        const src = incomeSources.find((s) => s.id === groupId)
        const cat = categories.find((c) => c.id === groupId)
        const isGoals = groupId === REPORT_GROUP_GOALS_ID
        const isDebts = groupId === REPORT_GROUP_DEBTS_ID
        const isUncategorized = groupId === REPORT_GROUP_UNCATEGORIZED_ID
        const title = isGoals ? "Цели" : isDebts ? "Долги / Кредиты" : src?.name ?? cat?.name ?? (isUncategorized ? "Без источника" : "Без источника")
        const iconKey = isDebts ? "debt" : src?.icon ?? cat?.icon ?? null
        return { id: groupId, title, iconKey, sum }
      })

    const top = items.slice(0, 6)
    const restSum = items.slice(6).reduce((acc, i) => acc + i.sum, 0)
    const slices = [...top.map((i) => i.sum), restSum > 0 ? restSum : 0].filter((v) => v > 0)
    const sliceLabels = [...top.map((i) => i.title), restSum > 0 ? "Остальное" : null].filter(Boolean) as string[]
    const colors = ["#9CC3FF", "#B9E4C9", "#FFD6A5", "#D9C2FF", "#E5E7EB"]

    const list = items.map((i) => {
      const percent = total > 0 ? (i.sum / total) * 100 : 0
      const percentText = percent > 0 && percent < 1 ? "<1%" : `${Math.round(Math.min(100, percent))}%`
      return { ...i, percentText }
    })

    const segments = slices.map((value, idx) => ({ color: colors[idx % colors.length], value }))

    return { total, segments, list, sliceLabels }
  }, [categories, effectiveRange.end, effectiveRange.start, incomeSources, transactions])

  const incomeLegendItems = useMemo(() => {
    const palette = ["#9CC3FF", "#B9E4C9", "#FFD6A5", "#D9C2FF"]
    const top = incomeData.list.slice(0, 4)
    const restSum = incomeData.list.slice(4).reduce((acc, i) => acc + i.sum, 0)
    const items = top.map((item, idx) => ({
      title: item.title,
      value: item.sum,
      color: palette[idx % palette.length],
    }))
    if (restSum > 0) {
      items.push({ title: "Остальное", value: restSum, color: "#E5E7EB" })
    }
    return items.map((item) => {
      const percent = incomeData.total > 0 ? (item.value / incomeData.total) * 100 : 0
      const percentText = percent > 0 && percent < 1 ? "<1%" : `${Math.round(Math.min(100, percent))}%`
      return { ...item, percentText }
    })
  }, [incomeData.list, incomeData.total])

  const topIncomeLegendColorById = useMemo(() => {
    const palette = ["#9CC3FF", "#B9E4C9", "#FFD6A5", "#D9C2FF"]
    return incomeData.list.slice(0, 4).reduce<Record<string, string>>((acc, item, idx) => {
      acc[item.id] = palette[idx % palette.length]
      return acc
    }, {})
  }, [incomeData.list])

  useEffect(() => {
    if (autoOpenExpensesSheet) {
      setIsExpensesSheetOpen(true)
      setIsIncomeSheetOpen(false)
      onConsumeAutoOpenExpenses?.()
    }
  }, [autoOpenExpensesSheet, onConsumeAutoOpenExpenses])

  useEffect(() => {
    if (autoOpenIncomeSheet) {
      if (incomeReportState) {
        setPeriodMode(incomeReportState.periodMode)
        setMonthOffset(incomeReportState.monthOffset)
        setBannerOffset(incomeReportState.bannerOffset)
        setCustomFrom(incomeReportState.customFrom)
        setCustomTo(incomeReportState.customTo)
        setSingleDay(incomeReportState.singleDay)
      }
      setIsIncomeSheetOpen(true)
      setIsExpensesSheetOpen(false)
      onConsumeAutoOpenIncome?.()
    }
  }, [autoOpenIncomeSheet, incomeReportState, onConsumeAutoOpenIncome])

  useEffect(() => {
    if (autoOpenCompareSheet) {
      openCompareReportDefault()
      if (compareReportState?.listMode) {
        setCompareListMode(compareReportState.listMode)
      }
      onConsumeAutoOpenCompare?.()
    }
  }, [autoOpenCompareSheet, compareReportState?.listMode, onConsumeAutoOpenCompare, openCompareReportDefault])


  return (
    <>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Отчёты</div>

        <div style={{ display: "grid", gap: 10 }}>
          {reportListItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
                textAlign: "left",
                cursor: "pointer",
                display: "grid",
                gap: 6,
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 20 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{item.title}</span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.35,
                  color: "#64748b",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {item.description}
              </span>
              <span style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1, position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}>
                ›
              </span>
            </button>
          ))}
        </div>
      </div>

      {isExpensesSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsExpensesSheetOpen(false)}
          className="tx-modal__backdrop"
          style={{ padding: "0 12px calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="tx-modal"
            style={{
              maxWidth: 640,
              width: "100%",
              padding: "16px",
              margin: "0 auto",
              borderRadius: "18px 18px 20px 20px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
              maxHeight: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
            }}
          >
            <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Расходы по категориям</div>
                <button
                  type="button"
                  onClick={() => setIsExpensesSheetOpen(false)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Закрыть
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    justifyContent: "space-between",
                    position: "relative",
                  }}
                >
                  <ReportPeriodPickerButton
                    buttonLabel={periodButtonLabel}
                    isOpen={isPeriodMenuOpen}
                    selectedPeriod={periodMode}
                    buttonRef={periodButtonRef}
                    popoverWidth={periodPopoverWidth}
                    onToggle={togglePeriodMenu}
                    onClose={closePeriodMenu}
                    onSelect={selectPeriodMode}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 500,
                      fontSize: 14,
                      color: "#6b7280",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "right",
                    }}
                  >
                    {periodDisplayText}
                  </div>
                </div>

                {periodMode === "day" ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="date"
                      value={singleDay || todayDate}
                      onChange={(e) => setSingleDay(e.target.value)}
                      style={{
                        flex: "0 0 auto",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontSize: 14,
                      }}
                    />
                  </div>
                ) : null}

                {periodMode === "custom" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>с</span>
                      <input
                        type="date"
                        value={customFrom || todayDate}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        style={{
                          width: "100%",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: "8px 10px",
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>по</span>
                      <input
                        type="date"
                        value={customTo || todayDate}
                        onChange={(e) => setCustomTo(e.target.value)}
                        style={{
                          width: "100%",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: "8px 10px",
                          fontSize: 14,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: 8, minHeight: 0, flex: "0 0 auto" }}>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      className="report-banner-card"
                      style={{
                        position: "relative",
                        width: "100%",
                        minWidth: 0,
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "14px 15px 14px",
                        overflow: "visible",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        justifyContent: "center",
                      }}
                    >
                      <button
                        type="button"
                        className="report-banner-btn report-banner-btn--left"
                        aria-label="Влево"
                        onClick={() => {
                          if (!canPrevBanner) return
                          setBannerOffset((prev) => Math.max(minBannerOffset, prev - 1))
                        }}
                        disabled={!canPrevBanner}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path d="M9.5 3 4.5 8l5 5" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="report-banner-btn report-banner-btn--right"
                        aria-label="Вправо"
                        onClick={() => {
                          if (!canNextBanner) return
                          setBannerOffset((prev) => Math.min(0, prev + 1))
                        }}
                        disabled={!canNextBanner}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path d="m6.5 3 5 5-5 5" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </button>
                      <div className="report-banner-viewport">
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-start",
                            paddingLeft: 17,
                            gap: 0,
                            alignItems: "center",
                          }}
                        >
                          <svg width={180} height={180} viewBox="0 0 180 180" role="img" aria-label="Диаграмма расходов">
                            {donutData.total > 0 && donutData.segments.length > 0 ? (
                              (() => {
                                const radius = 60
                                const center = 90
                                const circumference = 2 * Math.PI * radius
                                let offset = 0
                                return donutData.segments.map((seg, idx) => {
                                  const share = seg.value / donutData.total
                                  const dash = Math.max(0, circumference * share)
                                  const strokeWidth = selectedLegendIndex === idx ? 18 : 12
                                  const circle = (
                                    <circle
                                      key={idx}
                                      cx={center}
                                      cy={center}
                                      r={radius}
                                      fill="none"
                                      stroke={seg.color}
                                      strokeWidth={strokeWidth}
                                      strokeDasharray={`${dash} ${circumference - dash}`}
                                      strokeDashoffset={-offset}
                                      strokeLinecap="butt"
                                    />
                                  )
                                  offset += dash
                                  return circle
                                })
                              })()
                            ) : (
            <circle cx={90} cy={90} r={60} fill="none" stroke="#E5E7EB" strokeWidth={12} />
                            )}
                            <circle cx={90} cy={90} r={44} fill="#fff" />
                            <text x={90} y={84} textAnchor="middle" fontSize={11} fill="#475569">
                              {donutData.total > 0 ? "Итого" : "Нет расходов"}
                            </text>
                            <text x={90} y={104} textAnchor="middle" fontSize={12} fontWeight={600} fill="#0f172a">
                              {donutData.total > 0 ? formatMoney(donutData.total, currency ?? "RUB") : ""}
                            </text>
                          </svg>
                          {donutData.total > 0 && legendItems.length > 0 ? (
                            <div
                              style={{
                                height: 180,
                                minWidth: 0,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                marginLeft: -14,
                                gap: 12,
                              }}
                            >
                              {legendItems.map((item, idx) => {
                                const isSelected = selectedLegendIndex === idx
                                return (
                                <div
                                  key={item.title}
                                  onClick={() => {
                                    if (donutData.total === 0) return
                                    setSelectedLegendIndex((prev) => (prev === idx ? null : idx))
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    minWidth: 0,
                                    cursor: donutData.total > 0 ? "pointer" : "default",
                                    background: isSelected ? "#f1f5f9" : "transparent",
                                    borderRadius: 8,
                                    padding: isSelected ? "4px 6px" : "0 0",
                                  }}
                                >
                                  <span
                                    style={{
                                      color: item.color,
                                      fontWeight: 600,
                                      fontSize: 12,
                                      width: 38,
                                      textAlign: "right",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {item.percentText}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      color: "#0f172a",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      flex: 1,
                                    }}
                                  >
                                    {item.title}
                                  </span>
                                </div>
                              )})}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {(() => {
                        const indicatorSegments = 4
                        const atMin = !canPrevBanner
                        const rawPos = 3 + bannerOffset
                        const minPos = atMin ? 0 : 1
                        const activePos = Math.max(minPos, Math.min(3, rawPos))
                        return (
                          <div className="report-banner-dots">
                            {Array.from({ length: indicatorSegments }, (_, i) => (
                              <span key={i} className={i === activePos ? "report-banner-seg report-banner-seg--active" : "report-banner-seg"} />
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 8 }}>
                    {expenseData.list.length === 0 ? (
                      <div style={{ color: "#6b7280", fontSize: 14 }}>Нет операций за период</div>
                    ) : (
                      expenseData.list.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (item.id === REPORT_GROUP_DEBTS_ID) {
                              onOpenPayableDebtsSheet?.()
                            } else {
                              onOpenCategorySheet?.(item.id, item.title)
                            }
                            setIsExpensesSheetOpen(false)
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            borderBottom: "1px solid #e5e7eb",
                            paddingBottom: 8,
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" }}>
                              {item.iconKey && isFinanceIconKey(item.iconKey) ? <FinanceIcon iconKey={item.iconKey} size={14} /> : null}
                            </span>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14, color: "#0f172a" }}>
                              {item.title}
                            </span>
                          </div>
                          {(() => {
                            const percentColor = topLegendColorById[item.id] ?? "#6b7280"
                            return (
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto", fontSize: 14, color: "#0f172a" }}>
                                <span>{formatMoney(item.sum, currency ?? "RUB")}</span>
                                <span style={{ color: percentColor }}>·</span>
                                <span style={{ color: percentColor }}>{item.percentText}</span>
                              </div>
                            )
                          })()}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isIncomeSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsIncomeSheetOpen(false)}
          className="tx-modal__backdrop"
          style={{ padding: "0 12px calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="tx-modal"
            style={{
              maxWidth: 640,
              width: "100%",
              padding: "16px",
              margin: "0 auto",
              borderRadius: "18px 18px 20px 20px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
              maxHeight: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
            }}
          >
            <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Доходы по категориям</div>
                <button
                  type="button"
                  onClick={() => setIsIncomeSheetOpen(false)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Закрыть
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    justifyContent: "space-between",
                    position: "relative",
                  }}
                >
                  <ReportPeriodPickerButton
                    buttonLabel={periodButtonLabel}
                    isOpen={isPeriodMenuOpen}
                    selectedPeriod={periodMode}
                    buttonRef={periodButtonRef}
                    popoverWidth={periodPopoverWidth}
                    onToggle={togglePeriodMenu}
                    onClose={closePeriodMenu}
                    onSelect={selectPeriodMode}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 500,
                      fontSize: 14,
                      color: "#6b7280",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "right",
                    }}
                  >
                    {periodDisplayText}
                  </div>
                </div>

                {periodMode === "day" ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="date"
                      value={singleDay || todayDate}
                      onChange={(e) => setSingleDay(e.target.value)}
                      style={{
                        flex: "0 0 auto",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontSize: 14,
                      }}
                    />
                  </div>
                ) : null}

                {periodMode === "custom" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>с</span>
                      <input
                        type="date"
                        value={customFrom || todayDate}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        style={{
                          width: "100%",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: "8px 10px",
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>по</span>
                      <input
                        type="date"
                        value={customTo || todayDate}
                        onChange={(e) => setCustomTo(e.target.value)}
                        style={{
                          width: "100%",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: "8px 10px",
                          fontSize: 14,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: 8, minHeight: 0, flex: "0 0 auto" }}>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      className="report-banner-card"
                      style={{
                        position: "relative",
                        width: "100%",
                        minWidth: 0,
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "14px 15px 14px",
                        overflow: "visible",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        justifyContent: "center",
                      }}
                    >
                      <button
                        type="button"
                        className="report-banner-btn report-banner-btn--left"
                        aria-label="Влево"
                        onClick={() => {
                          if (!canPrevBanner) return
                          setBannerOffset((prev) => Math.max(minBannerOffset, prev - 1))
                        }}
                        disabled={!canPrevBanner}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path d="M9.5 3 4.5 8l5 5" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="report-banner-btn report-banner-btn--right"
                        aria-label="Вправо"
                        onClick={() => {
                          if (!canNextBanner) return
                          setBannerOffset((prev) => Math.min(0, prev + 1))
                        }}
                        disabled={!canNextBanner}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path d="m6.5 3 5 5-5 5" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </button>
                      <div className="report-banner-viewport">
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-start",
                            paddingLeft: 17,
                            gap: 0,
                            alignItems: "center",
                          }}
                        >
                          <svg width={180} height={180} viewBox="0 0 180 180" role="img" aria-label="Диаграмма доходов">
                            {incomeData.total > 0 && incomeData.segments.length > 0 ? (
                              (() => {
                                const radius = 60
                                const center = 90
                                const circumference = 2 * Math.PI * radius
                                let offset = 0
                                return incomeData.segments.map((seg, idx) => {
                                  const share = seg.value / incomeData.total
                                  const dash = Math.max(0, circumference * share)
                                  const strokeWidth = selectedLegendIndex === idx ? 18 : 12
                                  const circle = (
                                    <circle
                                      key={idx}
                                      cx={center}
                                      cy={center}
                                      r={radius}
                                      fill="none"
                                      stroke={seg.color}
                                      strokeWidth={strokeWidth}
                                      strokeDasharray={`${dash} ${circumference - dash}`}
                                      strokeDashoffset={-offset}
                                      strokeLinecap="butt"
                                    />
                                  )
                                  offset += dash
                                  return circle
                                })
                              })()
                            ) : (
            <circle cx={90} cy={90} r={60} fill="none" stroke="#E5E7EB" strokeWidth={12} />
                            )}
                            <circle cx={90} cy={90} r={44} fill="#fff" />
                            <text x={90} y={84} textAnchor="middle" fontSize={11} fill="#475569">
                              {incomeData.total > 0 ? "Итого" : "Нет доходов"}
                            </text>
                            <text x={90} y={104} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0f172a">
                              {incomeData.total > 0 ? formatMoney(incomeData.total, currency ?? "RUB") : ""}
                            </text>
                          </svg>
                          {incomeData.total > 0 && incomeLegendItems.length > 0 ? (
                            <div
                              style={{
                                height: 180,
                                minWidth: 0,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                marginLeft: -14,
                                gap: 12,
                              }}
                            >
                              {incomeLegendItems.map((item, idx) => {
                                const isSelected = selectedLegendIndex === idx
                                return (
                                <div
                                  key={item.title}
                                  onClick={() => {
                                    if (incomeData.total === 0) return
                                    setSelectedLegendIndex((prev) => (prev === idx ? null : idx))
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    minWidth: 0,
                                    padding: isSelected ? "4px 6px" : "0 0",
                                    cursor: incomeData.total > 0 ? "pointer" : "default",
                                    background: isSelected ? "#f1f5f9" : "transparent",
                                    borderRadius: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      color: item.color,
                                      fontWeight: 600,
                                      fontSize: 12,
                                      width: 38,
                                      textAlign: "right",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {item.percentText}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      color: "#0f172a",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      flex: 1,
                                    }}
                                  >
                                    {item.title}
                                  </span>
                                </div>
                              )})}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {(() => {
                        const indicatorSegments = 4
                        const atMin = !canPrevBanner
                        const rawPos = 3 + bannerOffset
                        const minPos = atMin ? 0 : 1
                        const activePos = Math.max(minPos, Math.min(3, rawPos))
                        return (
                          <div className="report-banner-dots">
                            {Array.from({ length: indicatorSegments }, (_, i) => (
                              <span key={i} className={i === activePos ? "report-banner-seg report-banner-seg--active" : "report-banner-seg"} />
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 8 }}>
                    {incomeData.list.length === 0 ? (
                      <div style={{ color: "#6b7280", fontSize: 14 }}>Нет доходов за период</div>
                    ) : (
                          incomeData.list.map((item) => (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (incomeData.total === 0) return
                                if (!item.id || item.id === "uncategorized") return
                                onOpenIncomeSourceSheet?.(item.id, {
                                  periodMode,
                                  monthOffset,
                                  bannerOffset,
                                  customFrom,
                                  customTo,
                                  singleDay,
                                })
                                setIsIncomeSheetOpen(false)
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                borderBottom: "1px solid #e5e7eb",
                                paddingBottom: 8,
                                cursor: incomeData.total > 0 ? "pointer" : "default",
                              }}
                            >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" }}>
                              {item.iconKey && isFinanceIconKey(item.iconKey) ? <FinanceIcon iconKey={item.iconKey} size={14} /> : null}
                            </span>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14, color: "#0f172a" }}>
                              {item.title}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto", fontSize: 14, color: "#0f172a" }}>
                            <span>{formatMoney(item.sum, currency ?? "RUB")}</span>
                            <span style={{ color: topIncomeLegendColorById[item.id] ?? "#6b7280" }}>·</span>
                            <span style={{ color: topIncomeLegendColorById[item.id] ?? "#6b7280" }}>{item.percentText}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCompareSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setIsCompareSheetOpen(false)
            setIsComparePeriodMenuOpen(false)
          }}
          className="tx-modal__backdrop"
          style={{ padding: "0 12px calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="tx-modal"
            style={{
              maxWidth: 640,
              width: "100%",
              padding: "16px",
              margin: "0 auto",
              borderRadius: "18px 18px 20px 20px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
              maxHeight: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
            }}
          >
            <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Доходы vs Расходы</div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCompareSheetOpen(false)
                    setIsComparePeriodMenuOpen(false)
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Закрыть
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    justifyContent: "space-between",
                    position: "relative",
                  }}
                >
                  <ReportPeriodPickerButton
                    buttonLabel={comparePeriodButtonLabel}
                    isOpen={isComparePeriodMenuOpen}
                    selectedPeriod={comparePeriodMode}
                    buttonRef={comparePeriodButtonRef}
                    popoverWidth={comparePeriodPopoverWidth}
                    onToggle={toggleComparePeriodMenu}
                    onClose={closeComparePeriodMenu}
                    onSelect={selectComparePeriodMode}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 500,
                      fontSize: 14,
                      color: "#6b7280",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "right",
                    }}
                  >
                    {comparePeriodMode === "custom" ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%" }}>
                        <input
                          type="date"
                          value={compareCustomFrom || todayDate}
                          onChange={(event) => {
                            setIsComparePeriodMenuOpen(false)
                            applyCompareCustomDate("from", event.target.value)
                          }}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            background: "#fff",
                            padding: "8px 9px",
                            fontSize: 13,
                            color: "#475569",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        />
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                        <input
                          type="date"
                          value={compareCustomTo || todayDate}
                          onChange={(event) => {
                            setIsComparePeriodMenuOpen(false)
                            applyCompareCustomDate("to", event.target.value)
                          }}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            background: "#fff",
                            padding: "8px 9px",
                            fontSize: 13,
                            color: "#475569",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8, minHeight: 0, flex: "0 0 auto" }}>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      className="report-banner-card"
                      style={{
                        position: "relative",
                        width: "100%",
                        minWidth: 0,
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "20px 15px 18px",
                        overflow: "visible",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        justifyContent: "center",
                        minHeight: 240,
                      }}
                    >
                      <div style={{ position: "absolute", right: 20, top: 12, fontSize: 11, color: "#94a3b8" }}>
                        {compareActiveBin ? compareActiveBin.end.getFullYear() : ""}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <svg width="100%" height="160" viewBox="0 0 300 160" role="img" aria-label="Сводный график">
                          {(() => {
                            const plotLeft = 78
                            const plotRight = 288
                            const chartWidth = plotRight - plotLeft
                            const chartTop = 10
                            const chartBottom = 130
                            const chartHeight = chartBottom - chartTop
                            const mainCount = compareMainSeries.length
                            if (mainCount === 0) return null
                            const mainStep = mainCount > 1 ? chartWidth / (mainCount - 1) : chartWidth
                            const xMain = Array.from({ length: mainCount }, (_, index) => plotLeft + mainStep * index)
                            const hasPreview = Boolean(comparePreviewSeries)
                            const xPreview = xMain[0] - mainStep
                            const chartSeries = hasPreview && comparePreviewSeries ? [comparePreviewSeries, ...compareMainSeries] : compareMainSeries
                            const chartX = hasPreview ? [xPreview, ...xMain] : xMain
                            const xRightMain = xMain[mainCount - 1]
                            const labelY = 152
                            const activeMainIdxRaw = compareMainSeries.findIndex((bin) => bin.key === compareActiveBin?.key)
                            const activeMainIdx = activeMainIdxRaw >= 0 ? activeMainIdxRaw : Math.max(compareMainSeries.length - 1, 0)
                            const activeIdx = activeMainIdx + (hasPreview ? 1 : 0)
                            const maxVal = compareChartMax > 0 ? compareChartMax : 1
                            const toY = (v: number) => chartBottom - (v / maxVal) * chartHeight
                            const guideLines = xMain.map((xPos) => ({
                              x: xPos,
                              opacity: 0.25,
                            }))
                            const previewGuideLine = hasPreview ? { x: xPreview, opacity: 0.2 } : null
                            const previewLabelClipLeft = 0
                            const previewLabelClipRight = Math.max(previewLabelClipLeft, xMain[0] - 8)
                            const previewLabelClipY = labelY - 8
                            const previewLabelClipHeight = 16
                            const hasPreviewLabelClip = hasPreview && previewLabelClipRight > previewLabelClipLeft
                            const axisLabels = chartSeries.map((bin, idx) => ({
                              key: bin.key,
                              label: bin.label,
                              x: chartX[idx],
                              isPreview: hasPreview && idx === 0,
                              isActive: bin.key === compareActiveBin?.key,
                            }))
                            const incomePoints = chartSeries.map((bin, idx) => ({
                              x: chartX[idx],
                              y: toY(bin.income),
                              val: bin.income,
                              idx,
                            }))
                            const expensePoints = chartSeries.map((bin, idx) => ({
                              x: chartX[idx],
                              y: toY(bin.expense),
                              val: bin.expense,
                              idx,
                            }))
                            const toSmoothPath = (pts: { x: number; y: number }[]) => {
                              if (pts.length < 2) return ""
                              const tension = 0.5
                              const crToBezier = (p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) => {
                                const t = tension
                                const bp1 = { x: p1.x + ((p2.x - p0.x) / 6) * t, y: p1.y + ((p2.y - p0.y) / 6) * t }
                                const bp2 = { x: p2.x - ((p3.x - p1.x) / 6) * t, y: p2.y - ((p3.y - p1.y) / 6) * t }
                                return { bp1, bp2 }
                              }
                              const p = [
                                pts[0],
                                pts[0],
                                ...pts.slice(1, -1),
                                pts[pts.length - 1],
                                pts[pts.length - 1],
                              ]
                              let d = `M${pts[0].x} ${pts[0].y}`
                              for (let i = 1; i < p.length - 2; i += 1) {
                                const { bp1, bp2 } = crToBezier(p[i - 1], p[i], p[i + 1], p[i + 2])
                                d += ` C${bp1.x} ${bp1.y} ${bp2.x} ${bp2.y} ${p[i + 1].x} ${p[i + 1].y}`
                              }
                              return d
                            }
                            const incomePath = toSmoothPath(incomePoints)
                            const expensePath = toSmoothPath(expensePoints)
                            const incomeColor = compareIncomeLineColor
                            const expenseColor = compareExpenseLineColor
                            const activeIncome = incomePoints[activeIdx]
                            const activeExpense = expensePoints[activeIdx]
                            const svgWidth = 300
                            const svgHeight = 160
                            const badgeSafePadding = 25
                            const badgeGap = 5
                            const badgeStackGap = 7
                            const badgeDividerGap = 8
                            const badgeHeight = 20
                            const badgeHorizontalPadding = 9
                            const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
                            const estimateBadgeWidth = (label: string) => Math.max(54, Math.round(label.length * 6.4 + badgeHorizontalPadding * 2))
                            const badgeMinX = badgeSafePadding
                            const badgeMaxY = svgHeight - badgeSafePadding - badgeHeight
                            type BadgeLayout = { x: number; y: number; width: number; height: number; label: string; color: string }
                            type BadgeHorizontalSide = "left" | "right"
                            const buildBadgeLayout = (
                              point: { x: number; y: number },
                              label: string,
                              color: string,
                              horizontalSide: BadgeHorizontalSide,
                            ): BadgeLayout => {
                              const width = estimateBadgeWidth(label)
                              const maxX = svgWidth - badgeSafePadding - width
                              const baseX = horizontalSide === "left" ? point.x - badgeGap - width : point.x + badgeGap
                              const baseY = point.y - badgeHeight / 2
                              return {
                                x: clamp(baseX, badgeMinX, maxX),
                                y: clamp(baseY, badgeSafePadding, badgeMaxY),
                                width,
                                height: badgeHeight,
                                label,
                                color,
                              }
                            }
                            const intersects = (a: BadgeLayout, b: BadgeLayout) =>
                              !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)
                            const applyDividerConstraint = (badge: BadgeLayout, side: BadgeHorizontalSide, lineX: number): BadgeLayout => {
                              const safeMaxX = svgWidth - badgeSafePadding - badge.width
                              let nextX = badge.x
                              if (side === "left") {
                                const dividerMaxX = lineX - badgeDividerGap - badge.width
                                nextX = Math.min(nextX, dividerMaxX)
                                nextX = clamp(nextX, badgeMinX, safeMaxX)
                                if (nextX + badge.width > lineX - badgeDividerGap) {
                                  nextX = lineX - badgeDividerGap - badge.width
                                }
                                return { ...badge, x: nextX }
                              }
                              const dividerMinX = lineX + badgeDividerGap
                              nextX = Math.max(nextX, dividerMinX)
                              nextX = clamp(nextX, badgeMinX, safeMaxX)
                              if (nextX < dividerMinX) {
                                nextX = dividerMinX
                              }
                              return { ...badge, x: nextX }
                            }
                            const buildStackedLayouts = (incomeBase: BadgeLayout, expenseBase: BadgeLayout): { income: BadgeLayout; expense: BadgeLayout } => {
                              const maxTopY = badgeMaxY - (badgeHeight + badgeStackGap)
                              const topY = clamp(Math.min(incomeBase.y, expenseBase.y), badgeSafePadding, maxTopY)
                              return {
                                income: {
                                  ...incomeBase,
                                  y: topY,
                                },
                                expense: {
                                  ...expenseBase,
                                  y: topY + badgeHeight + badgeStackGap,
                                },
                              }
                            }
                            let incomeBadge: BadgeLayout | null = null
                            let expenseBadge: BadgeLayout | null = null
                            if (activeIncome && activeExpense) {
                              const incomeLabel = `+ ${formatMoney(activeIncome.val, currency ?? "RUB")}`
                              const expenseLabel = `- ${formatMoney(activeExpense.val, currency ?? "RUB")}`
                              const activeComparePoint = chartSeries[activeIdx]
                              const currentRightmostKey = compareMainSeries[compareMainSeries.length - 1]?.key ?? null
                              const isCurrentIntervalPoint = Boolean(activeComparePoint && activeComparePoint.key === currentRightmostKey)
                              const markerLineX = activeIncome.x
                              const incomeBaseRaw = buildBadgeLayout(activeIncome, incomeLabel, incomeColor, isCurrentIntervalPoint ? "left" : "right")
                              const expenseBaseRaw = buildBadgeLayout(activeExpense, expenseLabel, expenseColor, "left")
                              const incomeBase = isCurrentIntervalPoint
                                ? incomeBaseRaw
                                : applyDividerConstraint(incomeBaseRaw, "right", markerLineX)
                              const expenseBase = isCurrentIntervalPoint
                                ? expenseBaseRaw
                                : applyDividerConstraint(expenseBaseRaw, "left", markerLineX)
                              if (!intersects(incomeBase, expenseBase)) {
                                incomeBadge = incomeBase
                                expenseBadge = expenseBase
                              } else {
                                const stacked = buildStackedLayouts(incomeBase, expenseBase)
                                if (isCurrentIntervalPoint) {
                                  incomeBadge = stacked.income
                                  expenseBadge = stacked.expense
                                } else {
                                  incomeBadge = applyDividerConstraint(stacked.income, "right", markerLineX)
                                  expenseBadge = applyDividerConstraint(stacked.expense, "left", markerLineX)
                                }
                              }
                            }
                            return (
                              <>
                                {hasPreviewLabelClip ? (
                                  <defs>
                                    <clipPath id="compare-preview-label-clip">
                                      <rect
                                        x={previewLabelClipLeft}
                                        y={previewLabelClipY}
                                        width={previewLabelClipRight - previewLabelClipLeft}
                                        height={previewLabelClipHeight}
                                      />
                                    </clipPath>
                                  </defs>
                                ) : null}
                                {previewGuideLine ? (
                                  <line
                                    x1={previewGuideLine.x}
                                    y1={chartTop - 10}
                                    x2={previewGuideLine.x}
                                    y2={chartBottom + 10}
                                    stroke="rgba(148,163,184,1)"
                                    strokeWidth={1}
                                    opacity={previewGuideLine.opacity}
                                  />
                                ) : null}
                                {previewGuideLine ? (
                                  <rect
                                    x={previewGuideLine.x - 20}
                                    y={chartTop - 12}
                                    width={40}
                                    height={labelY - chartTop + 20}
                                    fill="transparent"
                                    style={{ cursor: canComparePrev ? "pointer" : "default" }}
                                    onClick={shiftCompareBackFromPreview}
                                  />
                                ) : null}
                                {guideLines.map((line) => (
                                  <line
                                    key={line.x}
                                    x1={line.x}
                                    y1={chartTop - 10}
                                    x2={line.x}
                                    y2={chartBottom + 10}
                                    stroke="rgba(148,163,184,1)"
                                    strokeWidth={1}
                                    opacity={line.opacity}
                                  />
                                ))}
                                <path d={incomePath} stroke={incomeColor} strokeWidth="4" fill="none" />
                                <path d={expensePath} stroke={expenseColor} strokeWidth="3" fill="none" strokeDasharray="6 6" />
                                {incomePoints.map((p) => (
                                  <circle
                                    key={`i-${p.idx}`}
                                    cx={p.x}
                                    cy={p.y}
                                    r={p.idx === activeIdx ? 5 : 3}
                                    fill={incomeColor}
                                    opacity={p.idx === activeIdx ? 0.9 : 0.7}
                                  />
                                ))}
                                {expensePoints.map((p) => (
                                  <circle
                                    key={`e-${p.idx}`}
                                    cx={p.x}
                                    cy={p.y}
                                    r={p.idx === activeIdx ? 5 : 3}
                                    fill={expenseColor}
                                    opacity={p.idx === activeIdx ? 0.9 : 0.7}
                                  />
                                ))}
                                {incomeBadge && expenseBadge ? (
                                  <>
                                    <g>
                                      <rect
                                        x={incomeBadge.x}
                                        y={incomeBadge.y}
                                        width={incomeBadge.width}
                                        height={incomeBadge.height}
                                        rx={7}
                                        fill="rgba(248,250,252,0.82)"
                                        stroke="rgba(148,163,184,0.24)"
                                      />
                                      <text
                                        x={incomeBadge.x + incomeBadge.width / 2}
                                        y={incomeBadge.y + incomeBadge.height / 2}
                                        textAnchor="middle"
                                        dy="0.35em"
                                        fontSize={11}
                                        fill={incomeBadge.color}
                                        fontWeight={600}
                                      >
                                        {incomeBadge.label}
                                      </text>
                                    </g>
                                    <g>
                                      <rect
                                        x={expenseBadge.x}
                                        y={expenseBadge.y}
                                        width={expenseBadge.width}
                                        height={expenseBadge.height}
                                        rx={7}
                                        fill="rgba(248,250,252,0.82)"
                                        stroke="rgba(148,163,184,0.24)"
                                      />
                                      <text
                                        x={expenseBadge.x + expenseBadge.width / 2}
                                        y={expenseBadge.y + expenseBadge.height / 2}
                                        textAnchor="middle"
                                        dy="0.35em"
                                        fontSize={11}
                                        fill={expenseBadge.color}
                                        fontWeight={600}
                                      >
                                        {expenseBadge.label}
                                      </text>
                                    </g>
                                  </>
                                ) : null}
                                {axisLabels.map((label) => (
                                  label.isPreview && hasPreviewLabelClip ? (
                                    <g
                                      key={`axis-label-${label.key}`}
                                      clipPath="url(#compare-preview-label-clip)"
                                      style={{ cursor: canComparePrev ? "pointer" : "default" }}
                                      onClick={shiftCompareBackFromPreview}
                                      opacity={canComparePrev ? 1 : 0.55}
                                    >
                                      <text
                                        x={label.x}
                                        y={labelY}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={9}
                                        fill="#94a3b8"
                                        fontWeight={500}
                                      >
                                        {label.label}
                                      </text>
                                    </g>
                                  ) : (
                                    <text
                                      key={`axis-label-${label.key}`}
                                      x={label.x}
                                      y={labelY}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fontSize={9}
                                      fill={label.isPreview ? "#94a3b8" : label.isActive ? "#0f172a" : "#475569"}
                                      fontWeight={label.isPreview ? 500 : label.isActive ? 700 : 500}
                                      cursor={label.isPreview ? "default" : "pointer"}
                                      onClick={
                                        label.isPreview
                                          ? undefined
                                          : () => {
                                              setCompareActiveBinKey(label.key)
                                            }
                                      }
                                    >
                                      {label.label}
                                    </text>
                                  )
                                ))}
                                <rect
                                  x={xRightMain - 20}
                                  y={chartTop - 12}
                                  width={40}
                                  height={labelY - chartTop + 20}
                                  fill="transparent"
                                  style={{ cursor: canCompareNext ? "pointer" : "default" }}
                                  onClick={shiftCompareForwardFromRightEdge}
                                />
                              </>
                            )
                          })()}
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setCompareListMode("income")}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: compareListMode === "income" ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: compareListMode === "income" ? "#0f172a" : "#fff",
                      color: compareListMode === "income" ? "#fff" : "#0f172a",
                      fontWeight: compareListMode === "income" ? 700 : 600,
                      cursor: "pointer",
                    }}
                  >
                    Доход
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareListMode("expense")}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: compareListMode === "expense" ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: compareListMode === "expense" ? "#0f172a" : "#fff",
                      color: compareListMode === "expense" ? "#fff" : "#0f172a",
                      fontWeight: compareListMode === "expense" ? 700 : 600,
                      cursor: "pointer",
                    }}
                  >
                    Расход
                  </button>
                </div>

                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: "8px 12px",
                    maxHeight: 300,
                    overflowY: "auto",
                    display: "block",
                  }}
                >
                  {compareActiveList.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: 14 }}>Нет данных за выбранный период</div>
                  ) : (
                    compareActiveList.map((item) => {
                      const percent = compareActiveTotal > 0 ? Math.round((item.amount / compareActiveTotal) * 100) : 0
                      const isIncomeMode = compareListMode === "income"
                      const percentColor = isIncomeMode ? compareIncomeLineColor : compareExpenseLineColor
                      const isOpenable = item.id !== REPORT_GROUP_UNCATEGORIZED_ID && !!onOpenCompareDrilldown
                      return (
                      <button
                        key={`${compareListMode}-${item.id}`}
                        type="button"
                        onClick={() => {
                          if (!isOpenable) return
                          onOpenCompareDrilldown?.(compareListMode, item.id, compareDrilldownState)
                          setIsCompareSheetOpen(false)
                          setIsComparePeriodMenuOpen(false)
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "9px 2px",
                          border: "none",
                          borderBottom: "1px solid #e5e7eb",
                          borderRadius: 0,
                          background: "transparent",
                          textAlign: "left",
                          cursor: isOpenable ? "pointer" : "default",
                          width: "100%",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                          <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" }}>
                            {item.iconKey && isFinanceIconKey(item.iconKey) ? <FinanceIcon iconKey={item.iconKey} size={14} /> : null}
                          </span>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: "#0f172a",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.title}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, fontSize: 14, lineHeight: "normal", fontWeight: 400, color: "#0f172a" }}>
                          <span>{formatMoney(item.amount, currency ?? "RUB")}</span>
                          <span style={{ color: percentColor, fontWeight: 600 }}>· {percent}%</span>
                        </div>
                      </button>
                    )})
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ReportsScreen
