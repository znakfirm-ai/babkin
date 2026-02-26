import type { Debtor } from "../types/finance"
import { FinanceIcon, isFinanceIconKey } from "../shared/icons/financeIcons"
import { formatMoneyIntl } from "../utils/formatMoney"

type DebtorListProps = {
  debtors: Debtor[]
  emptyText?: string
  currency: string
  onSelectDebtor?: (debtor: Debtor) => void
}

export const DebtorList: React.FC<DebtorListProps> = ({ debtors, emptyText = "Пока нет должников", currency, onSelectDebtor }) => {
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
        const paidAmount = 0
        const hasPayoff = debtor.returnAmount > 0
        const percent = hasPayoff ? Math.round((paidAmount / debtor.returnAmount) * 100) : null
        const progress = hasPayoff ? Math.min(100, Math.max(0, (paidAmount / debtor.returnAmount) * 100)) : 0
        const isLast = idx === debtors.length - 1
        const formattedPaid = formatMoneyIntl(paidAmount, currency)
        const formattedPayoff = hasPayoff ? formatMoneyIntl(debtor.returnAmount, currency) : "—"
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
              border: "none",
              textAlign: "left",
              background: "transparent",
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
              <span style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>{dueDateLabel}</span>
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
              <span>{`${formattedPaid} (${percent === null ? "—" : `${percent}%`})`}</span>
              <span>{formattedPayoff}</span>
            </div>
          </button>
        )
      })}
    </>
  )
}
