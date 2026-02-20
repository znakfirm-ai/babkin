import React from "react"
import { useAppStore } from "../store/useAppStore"
import { CURRENCIES, normalizeCurrency } from "../utils/formatMoney"

type Props = {
  onOpenCategories?: () => void
  onOpenIconsPreview?: () => void
}

const SettingsScreen: React.FC<Props> = ({ onOpenCategories, onOpenIconsPreview }) => {
  const { currency, setCurrency } = useAppStore()
  const current = normalizeCurrency(currency)

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Настройки</div>

      <label style={{ display: "grid", gap: 6, maxWidth: 320 }}>
        <span style={{ fontSize: 13, color: "#4b5563" }}>Валюта приложения</span>
        <select
          value={current}
          onChange={(e) => setCurrency(e.target.value)}
          style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={onOpenCategories}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#fff",
          fontSize: 14,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        Категории
      </button>

      <button
        type="button"
        onClick={onOpenIconsPreview}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#fff",
          fontSize: 14,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        Иконки (preview)
      </button>
    </div>
  )
}

export default SettingsScreen
