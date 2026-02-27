import type { Goal } from "../types/finance"
import { FinanceIcon, isFinanceIconKey } from "../shared/icons/financeIcons"
import { formatMoneyIntl } from "../utils/formatMoney"

type GoalListProps = {
  goals: Goal[]
  onSelectGoal: (goal: Goal) => void
  emptyText?: string
  selectedGoalId?: string | null
  currency: string
  showSelectedCheck?: boolean
  selectedCheckOnly?: boolean
}

export const GoalList: React.FC<GoalListProps> = ({
  goals,
  onSelectGoal,
  emptyText = "Пока нет целей",
  selectedGoalId = null,
  currency,
  showSelectedCheck = false,
  selectedCheckOnly = false,
}) => {
  if (goals.length === 0) {
    return (
      <div style={{ padding: "12px 4px", fontSize: 14, color: "#6b7280" }}>
        {emptyText}
      </div>
    )
  }

  return (
    <>
      {goals.map((goal, idx) => {
        const percent =
          goal.targetAmount > 0 ? Math.min(100, Math.max(0, (goal.currentAmount / goal.targetAmount) * 100)) : 0
        const percentText = percent > 0 && percent < 1 ? "<1%" : `${Math.round(percent)}%`
        const isLast = idx === goals.length - 1
        const isSelected = selectedGoalId === goal.id
        const formattedCurrent = formatMoneyIntl(goal.currentAmount, currency)
        const formattedTarget = formatMoneyIntl(goal.targetAmount, currency)
        return (
          <button
            key={goal.id}
            type="button"
            onClick={() => onSelectGoal(goal)}
            style={{
              display: "grid",
              gap: 8,
              padding: 8,
              borderRadius: 12,
              border: "none",
              textAlign: "left",
              background: isSelected && !selectedCheckOnly ? "rgba(15,23,42,0.06)" : "transparent",
              width: "100%",
              borderBottom: isLast ? "none" : "1px solid #e5e7eb",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" }}>
                  {goal.icon && isFinanceIconKey(goal.icon) ? <FinanceIcon iconKey={goal.icon} size="md" /> : null}
                </span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{goal.name}</span>
              </span>
              <span style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {showSelectedCheck && isSelected ? (
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
                {`Выполнено: ${percentText}`}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  background: "#0f172a",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569" }}>
              <span>{formattedCurrent}</span>
              <span>{formattedTarget}</span>
            </div>
          </button>
        )
      })}
    </>
  )
}
