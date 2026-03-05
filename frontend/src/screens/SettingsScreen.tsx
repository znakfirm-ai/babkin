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
  const listCardStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    textAlign: "left",
    cursor: "pointer",
    display: "grid",
    gap: 6,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
    position: "relative",
  }
  const listTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "#0f172a" }
  const listSubtitleStyle: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.35,
    color: "#64748b",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    paddingRight: 20,
  }
  const chevronStyle: React.CSSProperties = {
    fontSize: 16,
    color: "#94a3b8",
    lineHeight: 1,
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Настройки</div>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ ...listCardStyle, cursor: "default" }}>
          <span style={listTitleStyle}>Валюта приложения</span>
          <span style={listSubtitleStyle}>Базовая валюта для отображения сумм в приложении.</span>
        <select
          value={current}
          onChange={(e) => setCurrency(e.target.value)}
            style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14, marginTop: 2 }}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </select>
        </label>

        <button type="button" onClick={onOpenCategories} style={listCardStyle}>
          <span style={listTitleStyle}>Категории</span>
          <span style={listSubtitleStyle}>Управление списком категорий расходов и доходов.</span>
          <span style={chevronStyle}>›</span>
        </button>

        <button type="button" onClick={onOpenIconsPreview} style={listCardStyle}>
          <span style={listTitleStyle}>Иконки (preview)</span>
          <span style={listSubtitleStyle}>Предпросмотр доступных иконок интерфейса.</span>
          <span style={chevronStyle}>›</span>
        </button>

        <div style={{ ...listCardStyle, cursor: "default" }}>
          <span style={listTitleStyle}>Debug timings</span>
          <span style={listSubtitleStyle}>Отладочные тайминги старта приложения.</span>
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
    </div>
  )
}

export default SettingsScreen
