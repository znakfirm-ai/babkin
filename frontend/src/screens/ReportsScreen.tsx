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
  onOpenSummary,
  onOpenExpensesByCategory: _onOpenExpensesByCategory,
  onOpenCategorySheet,
  autoOpenExpensesSheet,
  onConsumeAutoOpenExpenses,
}) => {
  const { transactions, categories, currency } = useAppStore()
  const [monthOffset, setMonthOffset] = useState(0)
  const [weekOffset] = useState(0)
  const [periodMode, setPeriodMode] = useState<"today" | "day" | "week" | "month" | "custom">("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [singleDay, setSingleDay] = useState("")
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false)
  const [isExpensesSheetOpen, setIsExpensesSheetOpen] = useState(false)
  const todayDate = useMemo(() => format(new Date()), [])

  const monthRange = useMemo(() => getMonthRange(monthOffset), [monthOffset])

  const currentRange = useMemo(() => {
    const now = new Date()

    const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

    if (periodMode === "today") {
      const d = dayStart(now)
      return { start: d, end: dayEnd(now), label: format(d) }
    }
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
    const fromDate = customFrom ? new Date(customFrom) : now
    const toDate = customTo ? new Date(customTo) : now
    return { start: dayStart(fromDate), end: dayEnd(toDate), label: "" }
  }, [customFrom, customTo, monthRange, periodMode, singleDay])

  const expenseData = useMemo(() => {
    if (!currentRange.start || !currentRange.end) {
      return { total: 0, slices: [], sliceLabels: [], colors: [], list: [] }
    }
    const totals = new Map<string, number>()
    let total = 0
    transactions.forEach((t) => {
      const date = new Date(t.date)
      if (date < currentRange.start || date > currentRange.end) return
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
  }, [categories, currentRange.end, currentRange.start, transactions])

  const formatDisplayDate = (date: Date) =>
    new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(date)

  const periodDisplayText = useMemo(() => {
    if (!currentRange.start || !currentRange.end) return ""
    if (currentRange.start.getTime() === currentRange.end.getTime()) {
      const text = formatDisplayDate(currentRange.start)
      return text.charAt(0).toUpperCase() + text.slice(1)
    }
    if (periodMode === "month" && currentRange.label) {
      return currentRange.label.charAt(0).toUpperCase() + currentRange.label.slice(1)
    }
    const fromText = formatDisplayDate(currentRange.start)
    const toText = formatDisplayDate(currentRange.end)
    return `${fromText} — ${toText}`
  }, [currentRange.end, currentRange.label, currentRange.start, periodMode])

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

  useEffect(() => {
    if (autoOpenExpensesSheet) {
      setIsExpensesSheetOpen(true)
      onConsumeAutoOpenExpenses?.()
    }
  }, [autoOpenExpensesSheet, onConsumeAutoOpenExpenses])


  return (
    <>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Отчёты</div>

        <button
          type="button"
          onClick={onOpenSummary}
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
          onClick={() => setIsExpensesSheetOpen(true)}
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
                        { key: "today", label: "Сегодня" },
                        { key: "day", label: "День" },
                        { key: "week", label: "Неделя" },
                        { key: "month", label: "Месяц" },
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
                      <button type="button" className="report-banner-btn report-banner-btn--left" aria-label="Влево">
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path d="M9.5 3 4.5 8l5 5" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </button>
                      <button type="button" className="report-banner-btn report-banner-btn--right" aria-label="Вправо">
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path d="m6.5 3 5 5-5 5" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </button>
                      <div className="report-banner-viewport">
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-start",
                            paddingLeft: 23,
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <svg width={180} height={180} viewBox="0 0 180 180" role="img" aria-label="Диаграмма расходов">
                            {donutData.total > 0 && donutData.segments.length > 0 ? (
                              (() => {
                                const radius = 60
                                const strokeWidth = 12
                                const center = 90
                                const circumference = 2 * Math.PI * radius
                                let offset = 0
                                return donutData.segments.map((seg, idx) => {
                                  const share = seg.value / donutData.total
                                  const dash = Math.max(0, circumference * share)
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
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              {legendItems.map((item) => (
                                <div
                                  key={item.title}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    minWidth: 0,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: "50%",
                                      background: item.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span style={{ color: item.color, fontWeight: 600, fontSize: 12, flexShrink: 0 }}>{item.percentText}</span>
                                  <span style={{ fontSize: 12, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {item.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
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
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto", fontSize: 14, color: "#0f172a" }}>
                            <span>{formatMoney(item.sum, currency ?? "RUB")}</span>
                            <span style={{ color: "#6b7280" }}>{item.percentText}</span>
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
    </>
  )
}

export default ReportsScreen
