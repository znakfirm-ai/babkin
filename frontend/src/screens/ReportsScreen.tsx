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

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const large = endAngle - startAngle <= 180 ? "0" : "1"
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`
}

type LabelItem = {
  id: string
  name: string
  percentText: string
  color: string
  mid: number
  mx: number
  my: number
  textX: number
  textYDesired: number
  textY: number
  isRight: boolean
}

const adjustLabelPositions = (items: LabelItem[]): LabelItem[] => {
  const minGap = 16
  const topBound = -90
  const bottomBound = 90

  const layoutSide = (side: LabelItem[], isRight: boolean) => {
    const sorted = [...side].sort((a, b) => a.textYDesired - b.textYDesired)
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        sorted[i].textYDesired = Math.max(sorted[i].textYDesired, topBound)
      } else if (sorted[i].textYDesired - sorted[i - 1].textYDesired < minGap) {
        sorted[i].textYDesired = sorted[i - 1].textYDesired + minGap
      }
    }
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sorted[i].textYDesired > bottomBound) sorted[i].textYDesired = bottomBound
      if (sorted[i + 1].textYDesired - sorted[i].textYDesired < minGap) {
        sorted[i].textYDesired = sorted[i + 1].textYDesired - minGap
      }
    }
    if (sorted.length > 0) {
      if (sorted[sorted.length - 1].textYDesired > bottomBound) sorted[sorted.length - 1].textYDesired = bottomBound
      for (let i = sorted.length - 2; i >= 0; i--) {
        if (sorted[i + 1].textYDesired - sorted[i].textYDesired < minGap) {
          sorted[i].textYDesired = sorted[i + 1].textYDesired - minGap
        }
      }
    }
    return sorted.map((s) => ({
      ...s,
      textY: s.textYDesired,
      isRight,
    }))
  }

  const left = items.filter((l) => !l.isRight)
  const right = items.filter((l) => l.isRight)
  return [...layoutSide(left, false), ...layoutSide(right, true)]
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

  const RING_RADIUS = 60
  const RING_THICKNESS = 8
  const MARKER_GAP = 5

  const slicesWithAngles = useMemo(() => {
    if (expenseData.total <= 0) return []
    const gapDeg = 1
    let angleCursor = 0
    const palette = expenseData.colors
    const labels = expenseData.sliceLabels
    return expenseData.slices.map((value, idx) => {
      const label = labels[idx] ?? "—"
      const color = label === "Остальное" ? "#cbd5e1" : palette[idx % palette.length]
      const sweepDeg = (value / expenseData.total) * 360
      const adjStart = angleCursor + gapDeg / 2
      const adjEnd = angleCursor + sweepDeg - gapDeg / 2
      const midDeg = (adjStart + adjEnd) / 2
      const midRad = ((midDeg - 90) * Math.PI) / 180
      const startRad = ((adjStart - 90) * Math.PI) / 180
      const endRad = ((adjEnd - 90) * Math.PI) / 180
      const outerEdge = RING_RADIUS + RING_THICKNESS / 2
      const markerR = outerEdge + MARKER_GAP
      const mx = Math.cos(midRad) * markerR
      const my = Math.sin(midRad) * markerR
      const percentVal = Math.round((value / expenseData.total) * 100)
      const percentText = percentVal > 0 && percentVal < 1 ? "<1%" : `${percentVal}%`
      angleCursor += sweepDeg
      return {
        id: `${label}-${idx}`,
        value,
        label,
        color,
        percentText,
        startRad,
        endRad,
        midRad,
        mx,
        my,
        isRight: mx >= 0,
      }
    })
  }, [expenseData.colors, expenseData.sliceLabels, expenseData.slices, expenseData.total])

  const dominantInfo = useMemo(() => {
    if (slicesWithAngles.length === 0 || expenseData.total <= 0) return { dominant: null as typeof slicesWithAngles[number] | null, dominantPercent: 0 }
    const dom = slicesWithAngles.reduce((acc, s) => (s.value > acc.value ? s : acc), slicesWithAngles[0])
    const domPercent = (dom.value / expenseData.total) * 100
    return { dominant: dom, dominantPercent: domPercent }
  }, [expenseData.total, slicesWithAngles])

  const dominantMode = dominantInfo.dominantPercent >= 60

  const labeledSlices = useMemo(() => {
    if (expenseData.total <= 0) return []
    const gapForText = 12
    const donutOuter = RING_RADIUS + RING_THICKNESS / 2
    const safePadding = 12
    const cx = 0
    const safeLeft = cx - (donutOuter + safePadding)
    const safeRight = cx + (donutOuter + safePadding)

    const baseSlices = dominantMode
      ? slicesWithAngles.filter((s) => s.id !== dominantInfo.dominant?.id)
      : slicesWithAngles

    const itemsBase: LabelItem[] = baseSlices.map((s) => {
      const textX = s.isRight ? s.mx + gapForText : s.mx - gapForText
      return {
        id: s.id,
        name: s.label,
        percentText: s.percentText,
        color: s.color,
        mid: s.midRad,
        mx: s.mx,
        my: s.my,
        textX,
        textYDesired: s.my,
        textY: s.my,
        isRight: s.isRight,
      }
    })

    const itemsPrepared = itemsBase.map((item) => {
      const clampX =
        item.isRight && item.textX < cx + donutOuter + 18
          ? cx + donutOuter + 18
          : !item.isRight && item.textX > cx - donutOuter - 18
          ? cx - donutOuter - 18
          : item.textX
      const withinSafe = clampX > safeLeft && clampX < safeRight && item.textY > -donutOuter && item.textY < donutOuter
      const finalX =
        withinSafe && item.isRight ? cx + donutOuter + 18 : withinSafe && !item.isRight ? cx - donutOuter - 18 : clampX
      return {
        ...item,
        textX: finalX,
      }
    })

    return adjustLabelPositions(itemsPrepared)
  }, [RING_RADIUS, RING_THICKNESS, slicesWithAngles, expenseData.total, dominantMode, dominantInfo.dominant])

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

            <div style={{ display: "grid", gap: 10, overflow: "auto", minHeight: 0 }}>
          <div style={{ display: "grid", placeItems: "center" }}>
            {expenseData.total > 0 ? (
              <svg
                width="260"
                height="200"
                viewBox="-130 -100 260 200"
                role="img"
                aria-label="Диаграмма расходов"
                style={{ overflow: "visible" }}
              >
                    {(() => {
                      const r = RING_RADIUS
                      const thickness = RING_THICKNESS
                      return slicesWithAngles.map((s) => {
                        const startDeg = (s.startRad * 180) / Math.PI + 90
                        const endDeg = (s.endRad * 180) / Math.PI + 90
                        const path = describeArc(0, 0, r, startDeg, endDeg)
                        return (
                          <path
                            key={s.id}
                            d={path}
                            stroke={s.color}
                            strokeWidth={thickness}
                            fill="none"
                            strokeLinecap="butt"
                          />
                        )
                      })
                    })()}
                    <text x={0} y={-4} textAnchor="middle" fontSize={11} fill="#475569">
                      Итого
                    </text>
                    <text x={0} y={12} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">
                      {formatMoney(expenseData.total, currency ?? "RUB")}
                    </text>
                    {labeledSlices.map((s) => {
                      const labelGap = 12
                      const textX = s.mx >= 0 ? s.mx + labelGap : s.mx - labelGap
                      const textY = s.textY
                      const textAnchor = s.mx >= 0 ? "start" : "end"
                      const truncatedLabel = s.name.length > 11 ? `${s.name.slice(0, 11)}…` : s.name
                      return (
                        <g key={s.id}>
                          <text x={textX} y={textY + 4} textAnchor={textAnchor} fontSize={12} fill="#4b5563">
                            <tspan>{truncatedLabel}</tspan>
                            <tspan fill={s.color}>{` · ${s.percentText}`}</tspan>
                          </text>
                        </g>
                      )
                    })}
                    {dominantMode && dominantInfo.dominant ? (
                      <g key="dominant-label">
                        <text
                          x={RING_RADIUS + RING_THICKNESS / 2 + 22}
                          y={RING_RADIUS + RING_THICKNESS / 2 + 6}
                          textAnchor="start"
                          fontSize={14}
                          fontWeight={700}
                          fill={dominantInfo.dominant.color}
                        >
                          {dominantInfo.dominant.percentText}
                        </text>
                        <text
                          x={RING_RADIUS + RING_THICKNESS / 2 + 22}
                          y={RING_RADIUS + RING_THICKNESS / 2 + 22}
                          textAnchor="start"
                          fontSize={13}
                          fill="#4b5563"
                        >
                          {dominantInfo.dominant.label}
                        </text>
                      </g>
                    ) : null}
                  </svg>
                ) : (
                  <div style={{ color: "#6b7280", fontSize: 14 }}>Нет расходов за период</div>
                )}
              </div>

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
