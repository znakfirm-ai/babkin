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
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null)
  const [activeBanner, setActiveBanner] = useState(0)
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

  const chartSlices = useMemo(() => {
    if (expenseData.total <= 0) return []
    const palette = expenseData.colors
    const topFour = expenseData.list.slice(0, 4)
    const restSum = Math.max(0, expenseData.total - topFour.reduce((acc, i) => acc + i.sum, 0))
    const base = topFour.map((item, idx) => {
      const share = expenseData.total > 0 ? item.sum / expenseData.total : 0
      return {
        id: item.id,
        label: item.title,
        color: palette[idx % palette.length],
        value: item.sum,
        share,
        percentText: share > 0 && share * 100 < 1 ? "<1%" : `${Math.round(share * 100)}%`,
      }
    })
    const restShare = expenseData.total > 0 ? restSum / expenseData.total : 0
    const restSlice =
      restSum > 0
        ? {
            id: "rest",
            label: "Остальное",
            color: "#cbd5e1",
            value: restSum,
            share: restShare,
            percentText: restShare > 0 && restShare * 100 < 1 ? "<1%" : `${Math.round(restShare * 100)}%`,
          }
        : null
    if (base.length === 1 && !restSlice) {
      return base
    }
    return restSlice ? [...base, restSlice] : base
  }, [expenseData.colors, expenseData.list, expenseData.total])

  const graphHeight = 200
  const donutSize = 190
  const donutCx = donutSize / 2
  const donutCy = graphHeight / 2
  const outerR = 74
  const innerR = 61
  const legendRowHeight = 32
  const legendGap = 6
  const donutBoxWidth = donutSize + 20

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
  const hasData = expenseData.total > 0
  const isSingleCategory = expenseData.list.length === 1

  useEffect(() => {
    if (autoOpenExpensesSheet) {
      setIsExpensesSheetOpen(true)
      onConsumeAutoOpenExpenses?.()
    }
  }, [autoOpenExpensesSheet, onConsumeAutoOpenExpenses])

  const donutContent = (() => {
    const pills = isSingleCategory ? chartSlices.slice(0, 1) : chartSlices.slice(0, 5)
    let cursor = -90
    return (
      <>
        <svg
          width={donutBoxWidth}
          height={graphHeight}
          viewBox={`0 0 ${donutBoxWidth} ${graphHeight}`}
          role="img"
          aria-label="Диаграмма расходов"
          style={{ flex: "0 0 auto", position: "relative", zIndex: 2, pointerEvents: "none" }}
        >
          {hasData ? (
            isSingleCategory ? (
              <>
                <circle cx={donutCx} cy={donutCy} r={outerR} fill={chartSlices[0].color} />
                <circle cx={donutCx} cy={donutCy} r={innerR} fill="#fff" />
              </>
            ) : (
              pills.map((slice) => {
                const sweep = slice.share * 360
                const start = cursor
                const end = cursor + sweep
                cursor += sweep
                const startRad = (Math.PI / 180) * start
                const endRad = (Math.PI / 180) * end
                const largeArc = sweep > 180 ? 1 : 0
                const midAngleRad = (Math.PI / 180) * ((start + end) / 2)
                const isSelected = slice.id === selectedSliceId
                const outer = isSelected ? outerR + 6 : outerR
                const inner = innerR
                const dx = isSelected ? Math.cos(midAngleRad) * 4 : 0
                const dy = isSelected ? Math.sin(midAngleRad) * 4 : 0
                const cx = donutCx + dx
                const cy = donutCy + dy
                const x1 = cx + Math.cos(startRad) * outer
                const y1 = cy + Math.sin(startRad) * outer
                const x2 = cx + Math.cos(endRad) * outer
                const y2 = cy + Math.sin(endRad) * outer
                const arcPath = `M ${x1} ${y1} A ${outer} ${outer} 0 ${largeArc} 1 ${x2} ${y2}`
                const innerX1 = cx + Math.cos(endRad) * inner
                const innerY1 = cy + Math.sin(endRad) * inner
                const innerX2 = cx + Math.cos(startRad) * inner
                const innerY2 = cy + Math.sin(startRad) * inner
                const innerArcPath = `A ${inner} ${inner} 0 ${largeArc} 0 ${innerX2} ${innerY2}`
                const path = `${arcPath} L ${innerX1} ${innerY1} ${innerArcPath} Z`

                return <path key={slice.id} d={path} fill={slice.color} />
              })
            )
          ) : (
            <circle cx={donutCx} cy={donutCy} r={outerR} fill="none" stroke="#e5e7eb" strokeWidth={outerR - innerR} />
          )}
          <circle cx={donutCx} cy={donutCy} r={innerR} fill="#fff" />
          <text x={donutCx} y={donutCy - 6} textAnchor="middle" fontSize={11} fill="#475569">
            {hasData ? "Итого" : "Нет расходов"}
          </text>
          <text x={donutCx} y={donutCy + 12} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">
            {hasData ? formatMoney(expenseData.total, currency ?? "RUB") : "за период"}
          </text>
        </svg>

        {hasData ? (
          <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: legendGap }}>
            <svg width="100%" height={graphHeight} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 1 }}></svg>
            {(isSingleCategory ? chartSlices.slice(0, 1) : chartSlices.slice(0, 5)).map((slice) => (
              <div
                key={slice.id}
                style={{ height: legendRowHeight, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 0, margin: 0, cursor: "pointer" }}
                onClick={() => setSelectedSliceId((prev) => (prev === slice.id ? null : slice.id))}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                  <span style={{ color: slice.color, fontWeight: 600, fontSize: 14, flexShrink: 0 }}>{slice.percentText}</span>
                  <span style={{ fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {slice.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </>
    )
  })()


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
                      style={{
                        position: "relative",
                        width: "100%",
                        minWidth: 0,
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "14px 28px 14px",
                        overflow: "visible",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        justifyContent: "center",
                      }}
                    >
                      <div className="report-banner-viewport">
                        <div className="report-banner-layout">
                          <button
                            type="button"
                            className="report-banner-arrow report-banner-arrow--left"
                            onClick={() => setActiveBanner((prev) => Math.min(1, prev + 1))}
                            style={{
                              opacity: activeBanner === 0 ? 0.65 : 0.65,
                            }}
                          >
                            ◀
                          </button>
                          <div className="report-banner-center">
                            <div
                              className="report-banner-track"
                              style={{ transform: `translateX(-${activeBanner * 100}%)` }}
                            >
                              {[0, 1].map((idx) => (
                                <div className="report-banner-slide" key={idx}>
                                  <div className="report-banner-content report-banner-scaled">
                                    {donutContent}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="report-banner-dots">
                              {[0, 1, 2].map((idx) => {
                                const activeIndex = 2 - activeBanner
                                const isActive = idx === activeIndex
                                return <span key={idx} className={isActive ? "report-banner-dot report-banner-dot--active" : "report-banner-dot"} />
                              })}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="report-banner-arrow report-banner-arrow--right"
                            onClick={() => setActiveBanner((prev) => Math.max(0, prev - 1))}
                            disabled={activeBanner === 0}
                            style={{
                              opacity: activeBanner === 0 ? 0.25 : 0.65,
                            }}
                          >
                            ▶
                          </button>
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
