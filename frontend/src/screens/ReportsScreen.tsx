type Props = {
  onOpenSummary: () => void
  onOpenExpensesByCategory: () => void
}

const ReportsScreen: React.FC<Props> = ({ onOpenSummary, onOpenExpensesByCategory }) => {
  return (
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
        onClick={onOpenExpensesByCategory}
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
  )
}

export default ReportsScreen
