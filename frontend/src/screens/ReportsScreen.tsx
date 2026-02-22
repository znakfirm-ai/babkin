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
                  <div style={{ fontSize: 12, color: "#6b7280" }}>v2 donut+pill layout</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
                    Итого {formatMoney(expenseData.total, currency ?? "RUB")}
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "center" }}>
                    {(() => {
                      const size = 200
                      const cx = size / 2
                      const cy = size / 2
                      const innerR = 42
                      const outerR = 62
                      let cursor = -90
                      const kneeX = cx + 110
                      const pillHeight = 42
                      const pillsGap = 10
                      const pillsStartY = cy - ((pillHeight * 5 + pillsGap * 4) / 2)
                      const pills = chartSlices.slice(0, 5)
                      return (
                        <svg width={size + 160} height={size} viewBox={`0 0 ${size + 160} ${size}`} role="img" aria-label="Диаграмма расходов">
                          {pills.map((slice, idx) => {
                            const share = slice.share
                            const sweep = share * 360
                            const start = cursor
                            const end = cursor + sweep
                            cursor += sweep
                            const startRad = (Math.PI / 180) * start
                            const endRad = (Math.PI / 180) * end
                            const midRad = (Math.PI / 180) * ((start + end) / 2)
                            const largeArc = sweep > 180 ? 1 : 0
                            const x1 = cx + Math.cos(startRad) * outerR
                            const y1 = cy + Math.sin(startRad) * outerR
                            const x2 = cx + Math.cos(endRad) * outerR
                            const y2 = cy + Math.sin(endRad) * outerR
                            const arcPath = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`
                            const innerX1 = cx + Math.cos(endRad) * innerR
                            const innerY1 = cy + Math.sin(endRad) * innerR
                            const innerX2 = cx + Math.cos(startRad) * innerR
                            const innerY2 = cy + Math.sin(startRad) * innerR
                            const innerArcPath = `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerX2} ${innerY2}`
                            const path = `${arcPath} L ${innerX1} ${innerY1} ${innerArcPath} Z`

                            const anchorX = cx + Math.cos(midRad) * outerR
                            const anchorY = cy + Math.sin(midRad) * outerR
                            const pillYCenter = pillsStartY + idx * (pillHeight + pillsGap) + pillHeight / 2
                            const badgeCX = size + 20
                            const badgeCY = pillYCenter
                            return (
                              <g key={slice.id}>
                                <path d={path} fill={slice.color} />
                                <path
                                  d={`M ${anchorX} ${anchorY} L ${kneeX} ${anchorY} L ${badgeCX - 16} ${badgeCY}`}
                                  stroke={slice.color}
                                  strokeWidth={2}
                                  fill="none"
                                  strokeLinecap="round"
                                />
                                <foreignObject x={size} y={pillYCenter - pillHeight / 2} width={160} height={pillHeight}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 10,
                                      background: "#eef2f7",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 14,
                                      padding: "8px 12px",
                                      height: pillHeight,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: "50%",
                                        border: `2px solid ${slice.color}`,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background: "#fff",
                                        color: slice.color,
                                        fontWeight: 700,
                                        fontSize: 12,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {slice.percentText}
                                    </div>
                                    <div style={{ fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {slice.label}
                                    </div>
                                  </div>
                                </foreignObject>
                              </g>
                            )
                          })}
                          <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
                          <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill="#475569">
                            Итого
                          </text>
                          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">
                            {formatMoney(expenseData.total, currency ?? "RUB")}
                          </text>
                        </svg>
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
