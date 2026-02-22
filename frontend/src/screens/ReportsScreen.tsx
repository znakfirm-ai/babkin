import { useMemo, useState, useRef } from "react"
import { useAppStore } from "../store/useAppStore"
import { formatMoney } from "../utils/formatMoney"
import { FinanceIcon, isFinanceIconKey } from "../shared/icons/financeIcons"

type Props = {
  onOpenSummary: () => void
  onOpenExpensesByCategory?: () => void
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

const ReportsScreen: React.FC<Props> = ({ onOpenSummary }) => {
  const { transactions, categories, currency } = useAppStore()
  const [monthOffset, setMonthOffset] = useState(0)
  const [isExpensesSheetOpen, setIsExpensesSheetOpen] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const { start, end, label } = useMemo(() => getMonthRange(monthOffset), [monthOffset])

  const expenseData = useMemo(() => {
    const totals = new Map<string, number>()
    let total = 0
    transactions.forEach((t) => {
      const date = new Date(t.date)
      if (date < start || date > end) return
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
  }, [categories, end, start, transactions])

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current == null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    const threshold = 40
    if (delta < -threshold) {
      setMonthOffset((prev) => prev - 1)
    } else if (delta > threshold) {
      setMonthOffset((prev) => Math.min(0, prev + 1))
    }
    touchStartX.current = null
  }

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
    const restSlice = {
      id: "rest",
      label: "Остальное",
      color: "#cbd5e1",
      value: restSum,
      share: restShare,
      percentText: restShare > 0 && restShare * 100 < 1 ? "<1%" : `${Math.round(restShare * 100)}%`,
    }
    return [...base, restSlice]
  }, [expenseData.colors, expenseData.list, expenseData.total])

  const graphHeight = 268
  const donutSize = 190
  const donutCx = donutSize / 2
  const donutCy = graphHeight / 2
  const outerR = 74
  const innerR = 61
  const legendRowHeight = 32
  const legendGap = 6
  const legendTotalHeight = legendRowHeight * 5 + legendGap * 4
  const legendStartY = (graphHeight - legendTotalHeight) / 2 + legendRowHeight / 2
  const donutBoxWidth = donutSize + 20
  const legendColumnGap = 14
  const legendStartX = donutBoxWidth + legendColumnGap
  const lineStartX = legendStartX + 2
  const rMid = (outerR + innerR) / 2

  const legendLines = useMemo(() => {
    let cursor = -90
    return chartSlices.slice(0, 5).map((slice, idx) => {
      const sweep = slice.share * 360
      const midAngle = cursor + sweep / 2
      cursor += sweep
      let cosA = Math.cos((midAngle * Math.PI) / 180)
      const sinA = Math.sin((midAngle * Math.PI) / 180)
      if (cosA < 0) cosA = Math.abs(cosA)
      const endX = donutCx + cosA * rMid
      const endY = donutCy + sinA * rMid
      const lineKneeX = endX + 14
      const startY = legendStartY + idx * (legendRowHeight + legendGap)
      return {
        id: slice.id,
        color: slice.color,
        startX: lineStartX,
        startY,
        kneeX: lineKneeX,
        endX,
        endY,
      }
    })
  }, [chartSlices, donutCx, donutCy, legendGap, legendRowHeight, legendStartY, lineStartX, rMid])

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
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 80,
            padding: "0 12px 12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: 16,
              boxShadow: "none",
              maxHeight: "85vh",
              overflow: "hidden",
              display: "grid",
              gap: 12,
            }}
          >
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

            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
            >
              <button
                type="button"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
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
                  fontWeight: 600,
                  fontSize: 15,
                  color: "#0f172a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {label}
              </div>
            </div>

            <div style={{ display: "grid", gap: 12, overflow: "auto", minHeight: 0 }}>
              {expenseData.total > 0 ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
                    Итого {formatMoney(expenseData.total, currency ?? "RUB")}
                  </div>
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      gap: legendColumnGap,
                      alignItems: "center",
                      width: "100%",
                      minWidth: 0,
                      overflow: "visible",
                      height: graphHeight,
                    }}
                  >
                          <svg
                            width="100%"
                            height={graphHeight}
                            style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 1 }}
                          >
                            {/* тестовая линия была для диагностики, удалена */}
                              {legendLines.map((line) => (
                                <path
                                  key={line.id}
                                  d={`M ${line.startX} ${line.startY} L ${line.kneeX} ${line.startY} L ${line.endX} ${line.endY}`}
                                  stroke={line.color}
                                  strokeWidth={2}
                                  fill="none"
                                  strokeLinecap="round"
                                />
                              ))}
                          </svg>
                    {(() => {
                      const pills = chartSlices.slice(0, 5)
                      let cursor = -90
                      return (
                        <>
                          <svg
                            width={donutBoxWidth}
                            height={graphHeight}
                            viewBox={`0 0 ${donutBoxWidth} ${graphHeight}`}
                            role="img"
                            aria-label="Диаграмма расходов"
                            style={{ flex: "0 0 auto", position: "relative", zIndex: 2 }}
                          >
                            {pills.map((slice) => {
                              const sweep = slice.share * 360
                              const start = cursor
                              const end = cursor + sweep
                              cursor += sweep
                              const startRad = (Math.PI / 180) * start
                              const endRad = (Math.PI / 180) * end
                              const largeArc = sweep > 180 ? 1 : 0
                              const x1 = donutCx + Math.cos(startRad) * outerR
                              const y1 = donutCy + Math.sin(startRad) * outerR
                              const x2 = donutCx + Math.cos(endRad) * outerR
                              const y2 = donutCy + Math.sin(endRad) * outerR
                              const arcPath = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`
                              const innerX1 = donutCx + Math.cos(endRad) * innerR
                              const innerY1 = donutCy + Math.sin(endRad) * innerR
                              const innerX2 = donutCx + Math.cos(startRad) * innerR
                              const innerY2 = donutCy + Math.sin(startRad) * innerR
                              const innerArcPath = `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerX2} ${innerY2}`
                              const path = `${arcPath} L ${innerX1} ${innerY1} ${innerArcPath} Z`

                              return <path key={slice.id} d={path} fill={slice.color} />
                            })}
                            <circle cx={donutCx} cy={donutCy} r={innerR} fill="#fff" />
                            <text x={donutCx} y={donutCy - 6} textAnchor="middle" fontSize={11} fill="#475569">
                              Итого
                            </text>
                            <text x={donutCx} y={donutCy + 12} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">
                              {formatMoney(expenseData.total, currency ?? "RUB")}
                            </text>
                          </svg>

                          <div style={{ position: "relative", flex: 1, minWidth: 0, height: graphHeight, display: "flex", flexDirection: "column", justifyContent: "center", gap: legendGap }}>
                            <svg
                              width={lineStartX - (donutSize + 20)}
                              height={graphHeight}
                              style={{ position: "absolute", left: donutSize + 20, top: 0, pointerEvents: "none", overflow: "visible" }}
                            >
                              {legendLines.map((line) => (
                                <path
                                  key={line.id}
                                  d={`M ${line.startX} ${line.startY} L ${line.kneeX} ${line.startY} L ${line.endX} ${line.endY}`}
                                  stroke={line.color}
                                  strokeWidth={2}
                                  fill="none"
                                  strokeLinecap="round"
                                />
                              ))}
                            </svg>
                            {chartSlices.slice(0, 5).map((slice) => {
                              return (
                                <div key={slice.id} style={{ height: legendRowHeight, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 0, margin: 0 }}>
                                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                                    <span style={{ color: slice.color, fontWeight: 600, fontSize: 14, flexShrink: 0 }}>{slice.percentText}</span>
                                    <span style={{ fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {slice.label}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              ) : (
                <div style={{ color: "#6b7280", fontSize: 14 }}>Нет расходов за период</div>
              )}
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 8 }}>
                {expenseData.list.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderBottom: "1px solid #e5e7eb",
                      paddingBottom: 8,
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
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ReportsScreen
