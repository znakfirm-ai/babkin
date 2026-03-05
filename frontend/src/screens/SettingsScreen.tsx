import React, { useCallback, useMemo, useState } from "react"
import "../components/TransactionModal.css"
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
  const [isCurrencySheetOpen, setIsCurrencySheetOpen] = useState(false)
  const [currencySearch, setCurrencySearch] = useState("")
  const [pendingCurrencyCode, setPendingCurrencyCode] = useState<string | null>(null)

  const handleToggleDebugTimings = useCallback(() => {
    const nextValue = !debugTimingsEnabled
    setDebugTimingsStorageEnabled(nextValue)
    setDebugTimingsEnabledState(nextValue)
  }, [debugTimingsEnabled])

  const openCurrencySheet = useCallback(() => {
    setPendingCurrencyCode(current)
    setCurrencySearch("")
    setIsCurrencySheetOpen(true)
  }, [current])

  const closeCurrencySheet = useCallback(() => {
    setIsCurrencySheetOpen(false)
  }, [])

  const applyCurrencySelection = useCallback(() => {
    if (!pendingCurrencyCode) return
    setCurrency(pendingCurrencyCode)
    setIsCurrencySheetOpen(false)
  }, [pendingCurrencyCode, setCurrency])

  const selectedCurrencyCode = pendingCurrencyCode ?? current

  const currentCurrencyMeta = useMemo(
    () => CURRENCIES.find((item) => item.code === current) ?? CURRENCIES[0],
    [current],
  )

  const currencySubtitle = currentCurrencyMeta.symbol
    ? `${currentCurrencyMeta.code} (${currentCurrencyMeta.symbol}) — ${currentCurrencyMeta.label}`
    : `${currentCurrencyMeta.code} — ${currentCurrencyMeta.label}`

  const normalizedCurrencySearch = currencySearch.trim().toLowerCase()
  const filteredCurrencies = useMemo(() => {
    if (!normalizedCurrencySearch) return CURRENCIES
    return CURRENCIES.filter(
      (item) =>
        item.code.toLowerCase().includes(normalizedCurrencySearch) ||
        item.label.toLowerCase().includes(normalizedCurrencySearch),
    )
  }, [normalizedCurrencySearch])

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
    <>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Настройки</div>

        <div style={{ display: "grid", gap: 10 }}>
          <button type="button" onClick={openCurrencySheet} style={listCardStyle}>
            <span style={listTitleStyle}>Валюта приложения</span>
            <span style={listSubtitleStyle}>{currencySubtitle}</span>
            <span style={chevronStyle}>›</span>
          </button>

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

      {isCurrencySheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeCurrencySheet}
          className="tx-modal__backdrop"
          style={{ padding: "0 12px calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="tx-modal"
            style={{
              maxWidth: 640,
              width: "100%",
              padding: "16px",
              margin: "0 auto",
              borderRadius: "18px 18px 20px 20px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
              maxHeight: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
            }}
          >
            <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Валюта приложения</div>
                <button
                  type="button"
                  onClick={closeCurrencySheet}
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

              <input
                value={currencySearch}
                onChange={(event) => setCurrencySearch(event.target.value)}
                placeholder="Поиск валюты"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontSize: 15,
                  outline: "none",
                  boxShadow: "none",
                  WebkitAppearance: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              />

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: "#fff",
                  height: 320,
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {filteredCurrencies.map((item, index) => {
                  const isSelected = selectedCurrencyCode === item.code
                  const trailing = item.symbol ? `${item.code} • ${item.symbol}` : item.code
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setPendingCurrencyCode(item.code)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: "none",
                        borderBottom: index === filteredCurrencies.length - 1 ? "none" : "1px solid #f1f5f9",
                        background: isSelected ? "#f8fafc" : "#fff",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: "1px solid " + (isSelected ? "#0f172a" : "#cbd5e1"),
                          background: isSelected ? "#0f172a" : "#fff",
                          color: "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          flex: "0 0 auto",
                        }}
                        aria-hidden="true"
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.label}
                      </span>
                      <span style={{ flex: "0 0 auto", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{trailing}</span>
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={applyCurrencySelection}
                disabled={!pendingCurrencyCode}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: pendingCurrencyCode ? "#0f172a" : "#e5e7eb",
                  color: pendingCurrencyCode ? "#fff" : "#6b7280",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: pendingCurrencyCode ? "pointer" : "not-allowed",
                }}
              >
                Выбрать валюту
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default SettingsScreen
