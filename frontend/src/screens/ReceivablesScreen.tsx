type ReceivablesScreenProps = {
  onBack: () => void
}

const ReceivablesScreen: React.FC<ReceivablesScreenProps> = ({ onBack }) => {
  return (
    <div className="overview" style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#0f172a",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Назад
        </button>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Мне должны</div>
      </div>
    </div>
  )
}

export default ReceivablesScreen
