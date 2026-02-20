import React from "react"
import { FinanceIcon, FINANCE_ICON_SECTIONS } from "../shared/icons/financeIcons"

type Props = {
  onBack: () => void
}

const IconPreviewScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div
      className="app-shell"
      style={{
        padding: 16,
        minHeight: "100dvh",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Иконки (preview)</div>
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
          }}
        >
          Назад
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 20,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          paddingBottom: "calc(var(--bottom-nav-height,56px) + env(safe-area-inset-bottom,0px))",
        }}
      >
        {FINANCE_ICON_SECTIONS.map((section) => (
          <div key={section.id} style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{section.title}</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
                gap: 12,
              }}
            >
              {section.keys.map((key) => (
                <div
                  key={key}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    gap: 6,
                    padding: 12,
                    borderRadius: 12,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    textAlign: "center",
                  }}
                >
                  <FinanceIcon iconKey={key} size="lg" />
                  <div style={{ fontSize: 11, color: "#6b7280", wordBreak: "break-word" }}>{key}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default IconPreviewScreen
