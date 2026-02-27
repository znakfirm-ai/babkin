import type { Debtor } from "../types/finance"
import { FinanceIcon, isFinanceIconKey } from "../shared/icons/financeIcons"
import { formatMoneyIntl } from "../utils/formatMoney"

type DebtorListProps = {
  debtors: Debtor[]
  emptyText?: string
  currency: string
  direction?: "receivable" | "payable"
  selectedDebtorId?: string | null
  onSelectDebtor?: (debtor: Debtor) => void
  selectedBorder?: boolean
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toSafeNumber = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

type DueDateTone = "default" | "amber" | "red"

const parseLocalDate = (value: string | null | undefined): Date | null => {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

const getDueDateTone = (dueDate: string | null | undefined): DueDateTone => {
  const due = parseLocalDate(dueDate)
  if (!due) return "default"
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayDiff = Math.floor((due.getTime() - today.getTime()) / 86400000)
  if (dayDiff <= 0) return "red"
  if (dayDiff < 7) return "amber"
  return "default"
}

const firstPositiveNumber = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = toSafeNumber(value)
    if (parsed > 0) return parsed
  }
  return 0
}

const pickReceivableTotal = (debtor: Debtor): number => {
  const payoffAmount = toFiniteNumber(debtor.payoffAmount)
  if (payoffAmount !== null && payoffAmount > 0) return payoffAmount
  const fallbackCandidates = [
    toFiniteNumber(debtor.amountToReturn),
    toFiniteNumber(debtor.returnAmount),
    toFiniteNumber(debtor.amount),
    toFiniteNumber(debtor.loanAmount),
  ]
  const fallback = fallbackCandidates.find((value) => value !== null && value > 0)
  return fallback ?? 0
}

const pickPayableTotal = (debtor: Debtor): number => {
  const raw = debtor as Record<string, unknown>
  return firstPositiveNumber(
    debtor.payoffAmount,
    debtor.amountToReturn,
    debtor.returnAmount,
    raw.payoff,
    raw.toReturnAmount,
    raw.payoff_amount,
    raw.amount_to_return,
  )
}

export const DebtorList: React.FC<DebtorListProps> = ({
  debtors,
  emptyText = "Пока нет должников",
  currency,
  direction = "receivable",
  selectedDebtorId,
  onSelectDebtor,
  selectedBorder = true,
}) => {
  if (debtors.length === 0) {
    return (
      <div style={{ padding: "12px 4px", fontSize: 14, color: "#6b7280" }}>
        {emptyText}
      </div>
    )
  }

  return (
    <>
      {debtors.map((debtor, idx) => {
        const isSelected = selectedDebtorId === debtor.id
        const isReceivable = direction === "receivable"
        const payablePaid = Math.max(0, toSafeNumber(debtor.paidAmount))
        const payableTotal = pickPayableTotal(debtor)
        const payablePercent = payableTotal > 0 ? clamp01(payablePaid / payableTotal) : 0
        const paidAmount = isReceivable ? Math.max(0, toFiniteNumber(debtor.paidAmount) ?? 0) : payablePaid
        const totalAmount = isReceivable ? pickReceivableTotal(debtor) : payableTotal
        const percentValue = isReceivable ? (totalAmount > 0 ? clamp01(paidAmount / totalAmount) : 0) : payablePercent
        const percent = Math.round(percentValue * 100)
        const progress = clamp01(percentValue) * 100
        const isLast = idx === debtors.length - 1
        const formattedPaid = formatMoneyIntl(paidAmount, currency)
        const percentLabel = `${percent}%`
        const formattedPayoff = formatMoneyIntl(totalAmount, currency)
        const dueDateTone = isReceivable ? getDueDateTone(debtor.dueDate) : "default"
        const dueDateColor = dueDateTone === "red" ? "#dc2626" : dueDateTone === "amber" ? "#b45309" : "#475569"
        const dueDateLabel = (() => {
          if (!debtor.dueDate) return "До —"
          const parsed = new Date(`${debtor.dueDate}T00:00:00`)
          if (Number.isNaN(parsed.getTime())) return "До —"
          const formatted = new Intl.DateTimeFormat("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(parsed)
          return `До ${formatted}`
        })()

        return (
          <button
            key={debtor.id}
            type="button"
            onClick={() => onSelectDebtor?.(debtor)}
            style={{
              display: "grid",
              gap: 8,
              padding: 8,
              borderRadius: 12,
              border: isSelected && selectedBorder ? "1px solid #0f172a" : "1px solid transparent",
              textAlign: "left",
              background: isSelected ? "#f8fafc" : "transparent",
              width: "100%",
              borderBottom: isLast ? "none" : "1px solid #e5e7eb",
              cursor: onSelectDebtor ? "pointer" : "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" }}>
                  {debtor.icon && isFinanceIconKey(debtor.icon) ? <FinanceIcon iconKey={debtor.icon} size="md" /> : null}
                </span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{debtor.name}</span>
              </span>
              <span style={{ fontSize: 12, color: dueDateColor, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {isSelected ? (
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      background: "#0f172a",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                ) : null}
                {dueDateLabel}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "#0f172a",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569" }}>
              <span>{`${formattedPaid} (${percentLabel})`}</span>
              <span>{formattedPayoff}</span>
            </div>
          </button>
        )
      })}
    </>
  )
}
