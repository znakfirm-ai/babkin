import { useCallback, useEffect, useState } from "react"
import {
  formatDebugTimingsReport,
  getSnapshot,
  isDebugTimingsEnabled,
  subscribe,
} from "../utils/debugTimings"

const copyText = async (value: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  if (typeof document === "undefined") return
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)
}

export default function DebugTimingsOverlay() {
  const debugEnabled = isDebugTimingsEnabled()
  const [, setVersion] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const snapshot = getSnapshot()

  useEffect(() => {
    if (!debugEnabled) return
    return subscribe(() => {
      setVersion((value) => value + 1)
    })
  }, [debugEnabled])

  const requestRows = snapshot.requests
    .filter((item) => ["accounts", "transactions", "categories", "incomeSources", "goals", "debtors"].includes(item.label))
    .slice(-24)

  const appStart = snapshot.stages.appStart
  const stageRows = (["appStart", "telegramReady", "initBegin", "initEnd"] as const).map((label) => {
    const value = snapshot.stages[label]
    if (value === undefined) return { label, value: "n/a" }
    if (appStart === undefined) return { label, value: `${Math.round(value)}ms` }
    return { label, value: `+${Math.round(value - appStart)}ms` }
  })

  const handleCopy = useCallback(() => {
    void copyText(formatDebugTimingsReport(snapshot))
  }, [snapshot])

  if (!debugEnabled) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          right: 12,
          bottom: "calc(var(--bottom-nav-height, 72px) + env(safe-area-inset-bottom, 0px) + 12px)",
          zIndex: 99,
          border: "1px solid rgba(15,23,42,0.16)",
          background: "#fff",
          color: "#0f172a",
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 700,
          padding: "6px 8px",
          lineHeight: 1,
        }}
      >
        DBG
      </button>
      {isOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(2,6,23,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              width: "min(760px, 100%)",
              maxHeight: "80vh",
              overflowY: "auto",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.1)",
              background: "#ffffff",
              boxShadow: "0 16px 40px rgba(15,23,42,0.2)",
              padding: 14,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Debug timings</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    border: "1px solid rgba(15,23,42,0.15)",
                    borderRadius: 10,
                    background: "#fff",
                    padding: "7px 10px",
                    fontSize: 12,
                  }}
                >
                  Copy timings
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    border: "1px solid rgba(15,23,42,0.15)",
                    borderRadius: 10,
                    background: "#fff",
                    padding: "7px 10px",
                    fontSize: 12,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              {stageRows.map((stage) => (
                <div key={stage.label} style={{ display: "grid", gridTemplateColumns: "160px 1fr", fontSize: 12 }}>
                  <span style={{ color: "#475569" }}>{stage.label}</span>
                  <span style={{ color: "#0f172a", fontWeight: 600 }}>{stage.value}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Network</div>
            <div style={{ display: "grid", gap: 6 }}>
              {requestRows.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 10,
                    padding: "7px 8px",
                    fontSize: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.label} · {item.method} · {item.url}
                    </div>
                    <div style={{ color: "#64748b" }}>
                      start {Math.round(item.startTime)}ms · end {Math.round(item.endTime)}ms
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: item.status === "ok" ? "#0369a1" : "#b91c1c" }}>
                    {item.status} · {Math.round(item.durationMs)}ms
                  </div>
                </div>
              ))}
              {requestRows.length === 0 ? <div style={{ fontSize: 12, color: "#64748b" }}>Нет запросов</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
