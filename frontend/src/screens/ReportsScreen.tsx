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

  const stackedSegments = useMemo(() => {
    if (expenseData.total <= 0) return []
    const palette = expenseData.colors
    const labels = expenseData.sliceLabels
    return expenseData.slices.map((value, idx) => {
      const label = labels[idx] ?? "—"
      const color = label === "Остальное" ? "#cbd5e1" : palette[idx % palette.length]
      const percent = expenseData.total > 0 ? (value / expenseData.total) * 100 : 0
      return {
        id: `${label}-${idx}`,
        label,
        color,
        percent,
      }
    })
  }, [expenseData.colors, expenseData.sliceLabels, expenseData.slices, expenseData.total])

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
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
                    Итого {formatMoney(expenseData.total, currency ?? "RUB")}
                  </div>
                  <div
                    style={{
                      background: "#eef2f7",
                      borderRadius: 10,
                      height: 14,
                      overflow: "hidden",
                      display: "flex",
                    }}
                  >
                    {stackedSegments.map((segment, idx) => {
                      const isLast = idx === stackedSegments.length - 1
                      const borderRadius =
                        stackedSegments.length === 1
                          ? 10
                          : idx === 0
                          ? "10px 0 0 10px"
                          : isLast
                          ? "0 10px 10px 0"
                          : undefined
                      const width = isLast ? undefined : `${segment.percent}%`
                      return (
                        <div
                          key={segment.id}
                          style={{
                            height: "100%",
                            background: segment.color,
                            width,
                            flex: isLast ? 1 : "0 0 auto",
                            borderRadius,
                          }}
                          aria-label={`${segment.label}: ${Math.round(segment.percent)}%`}
                        />
                      )
                    })}
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
