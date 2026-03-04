import React, { useCallback, useState } from "react"
import { useAppStore } from "../store/useAppStore"
import { isDebugTimingsStorageEnabled, setDebugTimingsStorageEnabled } from "../utils/debugTimings"
import { CURRENCIES, normalizeCurrency } from "../utils/formatMoney"

type Props = {
  onOpenCategories?: () => void
  onOpenIconsPreview?: () => void
}

const SettingsScreen: React.FC<Props> = ({ onOpenCategories, onOpenIconsPreview }) => {
  const { currency, setCurrency } = useAppStore()
  const current = normalizeCurrency(currency)
  const [debugTimingsEnabled, setDebugTimingsEnabledState] = useState(() => isDebugTimingsStorageEnabled())
  const handleToggleDebugTimings = useCallback(() => {
    const nextValue = !debugTimingsEnabled
    setDebugTimingsStorageEnabled(nextValue)
    setDebugTimingsEnabledState(nextValue)
  }, [debugTimingsEnabled])

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

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fff",
          padding: 12,
          display: "grid",
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={handleToggleDebugTimings}
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 14,
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            textAlign: "left",
          }}
          aria-pressed={debugTimingsEnabled}
        >
          <span>Debug timings</span>
          <span style={{ fontSize: 12, color: debugTimingsEnabled ? "#0369a1" : "#6b7280" }}>
            {debugTimingsEnabled ? "ON" : "OFF"}
          </span>
        </button>
        {debugTimingsEnabled ? (
          <div style={{ fontSize: 12, color: "#0369a1" }}>Enabled. Restart app to measure cold start.</div>
        ) : null}
      </div>
    </div>
  )
}

export default SettingsScreen
