import { useEffect, useMemo, useState } from "react"
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

const ReportsScreen: React.FC<Props> = ({
  onOpenSummary: _onOpenSummary,
  onOpenExpensesByCategory: _onOpenExpensesByCategory,
  onOpenCategorySheet,
  autoOpenExpensesSheet,
  onConsumeAutoOpenExpenses,
  onOpenIncomeSourceSheet,
  autoOpenIncomeSheet,
  onConsumeAutoOpenIncome,
  incomeReportState,
}) => {
  const { transactions, categories, incomeSources, currency } = useAppStore()
  const [monthOffset, setMonthOffset] = useState(0)
  const [weekOffset] = useState(0)
  const [periodMode, setPeriodMode] = useState<"day" | "week" | "month" | "quarter" | "year" | "custom">("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [singleDay, setSingleDay] = useState("")
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false)
  const [isExpensesSheetOpen, setIsExpensesSheetOpen] = useState(false)
  const [isIncomeSheetOpen, setIsIncomeSheetOpen] = useState(false)
  const [isCompareSheetOpen, setIsCompareSheetOpen] = useState(false)
  const [selectedLegendIndex, setSelectedLegendIndex] = useState<number | null>(null)
  const [bannerOffset, setBannerOffset] = useState(0)
  const [activeCompareMonth, setActiveCompareMonth] = useState(() => {
    const now = new Date()
    return now.getFullYear() * 12 + now.getMonth()
  })
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

  const minCompareMonth = 2022 * 12 + 1
  const maxCompareMonth = useMemo(() => {
    const now = new Date()
    return now.getFullYear() * 12 + now.getMonth()
  }, [])
  const leftCompareMonth = activeCompareMonth - 1
  const rightCompareMonth = activeCompareMonth + 1
  const leftDisabled = leftCompareMonth < minCompareMonth
  const rightDisabled = rightCompareMonth > maxCompareMonth
  const monthLabel = (monthIndex: number) => {
    const year = Math.floor(monthIndex / 12)
    const month = monthIndex % 12
    const name = MONTHS[month]
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
  }
  const showYearSeparator =
    (!leftDisabled && leftCompareMonth % 12 === 11 && activeCompareMonth % 12 === 0) ||
    (!rightDisabled && activeCompareMonth % 12 === 11 && rightCompareMonth % 12 === 0)

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
      const catId = (t as { categoryId?: string | null }).categoryId ?? "uncategorized"
      const amt = t.amount?.amount ?? 0
      totals.set(catId, (totals.get(catId) ?? 0) + amt)
      total += amt
    })
    const items = Array.from(totals.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([categoryId, sum]) => {
        const cat = categories.find((c) => c.id === categoryId)
        return {
          id: categoryId,
          title: cat?.name ?? "Без категории",
          iconKey: cat?.icon ?? null,
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
      const sourceId = (t as { incomeSourceId?: string | null }).incomeSourceId ?? null
      const catId = (t as { categoryId?: string | null }).categoryId ?? null
      const groupId = sourceId ?? catId ?? "uncategorized"
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
        const title = src?.name ?? cat?.name ?? "Без источника"
        const iconKey = src?.icon ?? cat?.icon ?? null
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


  return (
    <>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Отчёты</div>

        <button
          type="button"
          onClick={_onOpenSummary}
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            textAlign: "left",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Доходы vs Расходы
        </button>

        <button
          type="button"
          onClick={() => {
            setIsExpensesSheetOpen(true)
            setIsIncomeSheetOpen(false)
            setIsCompareSheetOpen(false)
          }}
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            textAlign: "left",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Расходы по категориям
        </button>

        <button
          type="button"
          onClick={() => {
            setIsIncomeSheetOpen(true)
            setIsExpensesSheetOpen(false)
            setIsCompareSheetOpen(false)
          }}
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            textAlign: "left",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Доходы по категориям
        </button>

        <button
          type="button"
          onClick={() => {
            setIsCompareSheetOpen(true)
            setIsExpensesSheetOpen(false)
            setIsIncomeSheetOpen(false)
          }}
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            textAlign: "left",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Доходы vs Расходы
        </button>
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
                  <button
                    type="button"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #0f172a",
                      background: "#0f172a",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    onClick={() => setIsPeriodMenuOpen((prev) => !prev)}
                  >
                    Период
                  </button>
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
                  {isPeriodMenuOpen ? (
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
                        width: 200,
                        display: "grid",
                        gap: 4,
                        padding: 8,
                      }}
                    >
                      {[
                        { key: "day", label: "День" },
                        { key: "week", label: "Неделя" },
                        { key: "month", label: "Месяц" },
                        { key: "quarter", label: "Квартал" },
                        { key: "year", label: "Год" },
                        { key: "custom", label: "Свой" },
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setPeriodMode(opt.key as typeof periodMode)
                            setIsPeriodMenuOpen(false)
                            if (opt.key === "day") {
                              setSingleDay(todayDate)
                            }
                            if (opt.key === "custom") {
                              setCustomFrom(customFrom || todayDate)
                              setCustomTo(customTo || todayDate)
                            }
                            if (opt.key === "month") {
                              setMonthOffset(0)
                            }
                            setBannerOffset(0)
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: periodMode === opt.key ? "#f1f5f9" : "#fff",
                            cursor: "pointer",
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
                            onOpenCategorySheet?.(item.id, item.title)
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
                  <button
                    type="button"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #0f172a",
                      background: "#0f172a",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    onClick={() => setIsPeriodMenuOpen((prev) => !prev)}
                  >
                    Период
                  </button>
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
                  {isPeriodMenuOpen ? (
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
                        width: 200,
                        display: "grid",
                        gap: 4,
                        padding: 8,
                      }}
                    >
                      {[
                        { key: "day", label: "День" },
                        { key: "week", label: "Неделя" },
                        { key: "month", label: "Месяц" },
                        { key: "quarter", label: "Квартал" },
                        { key: "year", label: "Год" },
                        { key: "custom", label: "Свой" },
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setPeriodMode(opt.key as typeof periodMode)
                            setIsPeriodMenuOpen(false)
                            if (opt.key === "day") {
                              setSingleDay(todayDate)
                            }
                            if (opt.key === "custom") {
                              setCustomFrom(customFrom || todayDate)
                              setCustomTo(customTo || todayDate)
                            }
                            if (opt.key === "month") {
                              setMonthOffset(0)
                            }
                            setBannerOffset(0)
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: periodMode === opt.key ? "#f1f5f9" : "#fff",
                            cursor: "pointer",
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
          onClick={() => setIsCompareSheetOpen(false)}
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
                  onClick={() => setIsCompareSheetOpen(false)}
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
                  <button
                    type="button"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #0f172a",
                      background: "#0f172a",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Период
                  </button>
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
                    {/* заглушка периода */}Период не выбран
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
                      <div style={{ position: "absolute", left: 0, right: 0, top: 20, bottom: 60, pointerEvents: "none" }}>
                        <div style={{ position: "absolute", left: "0%", top: 0, bottom: 0, width: 1, background: "rgba(148,163,184,0.25)" }} />
                        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(148,163,184,0.25)" }} />
                        <div style={{ position: "absolute", left: "100%", top: 0, bottom: 0, width: 1, background: "rgba(148,163,184,0.25)" }} />
                        {showYearSeparator ? (
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: 0,
                              bottom: 0,
                              width: 1,
                              background: "#e5e7eb",
                              transform: "translateX(-50%)",
                              opacity: 0.8,
                            }}
                          />
                        ) : null}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <svg width="100%" height="160" viewBox="0 0 300 160" role="img" aria-label="Сводный график">
                          <path d="M10 110 C60 70 90 90 150 60 C210 35 250 75 290 55" stroke="#9ddfc5" strokeWidth="4" fill="none" />
                          <path d="M10 125 C60 100 90 100 150 90 C210 80 250 100 290 95" stroke="#f7b2a4" strokeWidth="3" fill="none" strokeDasharray="6 6" />
                        </svg>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (leftDisabled) return
                              setActiveCompareMonth(leftCompareMonth)
                            }}
                            disabled={leftDisabled}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: leftDisabled ? "#cbd5e1" : "#475569",
                              cursor: leftDisabled ? "default" : "pointer",
                              fontWeight: leftDisabled ? 500 : 600,
                              fontSize: 13,
                            }}
                          >
                            {monthLabel(leftCompareMonth)}
                          </button>
                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{monthLabel(activeCompareMonth)}</div>
                          <button
                            type="button"
                            onClick={() => {
                              if (rightDisabled) return
                              setActiveCompareMonth(rightCompareMonth)
                            }}
                            disabled={rightDisabled}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: rightDisabled ? "#cbd5e1" : "#475569",
                              cursor: rightDisabled ? "default" : "pointer",
                              fontWeight: rightDisabled ? 500 : 600,
                              fontSize: 13,
                            }}
                          >
                            {monthLabel(rightCompareMonth)}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #0f172a",
                      background: "#0f172a",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Доход
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      color: "#0f172a",
                      fontWeight: 600,
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
                    border: "1px dashed #e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    color: "#94a3b8",
                    fontSize: 14,
                  }}
                >
                  Список появится позже
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
