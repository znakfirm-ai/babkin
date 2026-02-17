import { useEffect, useMemo, useRef, useState } from "react"
import { useAppStore } from "../store/useAppStore"
import { formatMoney } from "../utils/formatMoney"
import { fetchSummary } from "../api/analytics"
import { format } from "../utils/date"

type Props = {
  onBack: () => void
}

type Period = "today" | "week" | "month" | "custom"

const SummaryReportScreen: React.FC<Props> = ({ onBack }) => {
  const [period, setPeriod] = useState<Period>("today")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorText, setErrorText] = useState<string | null>(null)
  const [data, setData] = useState<{ totalIncome: string; totalExpense: string; net: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { transactions, currency } = useAppStore()

  const today = useMemo(() => format(new Date()), [])

  useEffect(() => {
    const now = new Date()
    if (period === "today") {
      const d = format(now)
      setFrom(d)
      setTo(d)
      return
    }
    if (period === "week") {
      const fromDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
      setFrom(format(fromDate))
      setTo(format(now))
      return
    }
    if (period === "month") {
      const fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
      setFrom(format(fromDate))
      setTo(format(now))
      return
    }
  }, [period])

  const load = async (customFrom?: string, customTo?: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    const f = customFrom ?? from
    const t = customTo ?? to
    if (!f || !t) {
      setErrorText("Не выбран период")
      setStatus("error")
      return
    }
    if (!token) {
      setErrorText("Нет токена")
      setStatus("error")
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus("loading")
    setErrorText(null)
    try {
      const res = await fetchSummary(token, { from: f, to: t }, controller.signal)
      setData(res)
      setStatus("success")
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus((prev) => (prev === "loading" ? "idle" : prev))
        return
      }
      setErrorText(err instanceof Error ? err.message : "Ошибка загрузки отчёта")
      setStatus("error")
    }
  }

  useEffect(() => {
    if (from && to) {
      void load()
    }
    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  const filteredTx = useMemo(() => {
    if (!from || !to) return []
    const fromDate = new Date(`${from}T00:00:00.000Z`)
    const toExclusive = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
    return transactions
      .filter((t) => {
        const d = new Date(t.date)
        return d >= fromDate && d < toExclusive
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 20)
  }, [from, to, transactions])

  const formatDateShort = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(iso))

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          border: "1px solid #e5e7eb",
          background: "#fff",
          borderRadius: 10,
          padding: "8px 10px",
          cursor: "pointer",
          width: "fit-content",
        }}
      >
        ← Назад
      </button>

      <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Доходы vs Расходы</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["today", "week", "month"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: period === p ? "1px solid #0f172a" : "1px solid #e5e7eb",
              background: period === p ? "#0f172a" : "#fff",
              color: period === p ? "#fff" : "#0f172a",
              cursor: "pointer",
            }}
          >
            {p === "today" ? "Сегодня" : p === "week" ? "Неделя" : "Месяц"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPeriod("custom")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: period === "custom" ? "1px solid #0f172a" : "1px solid #e5e7eb",
            background: period === "custom" ? "#0f172a" : "#fff",
            color: period === "custom" ? "#fff" : "#0f172a",
            cursor: "pointer",
          }}
        >
          Свой
        </button>
      </div>

      {period === "custom" ? (
        <div style={{ display: "grid", gap: 8, maxWidth: 260 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>С</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={today}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>По</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              max={today}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
          </label>
          <button
            type="button"
            onClick={() => load()}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
        }}
      >
        {status === "loading" || status === "idle" ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Загрузка...</div>
        ) : status === "error" ? (
          <div style={{ color: "#b91c1c", fontSize: 13 }}>
            {errorText}
            <button
              type="button"
              onClick={() => load()}
              style={{
                marginLeft: 8,
                padding: "4px 8px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Повторить
            </button>
          </div>
        ) : status === "success" && data ? (
          Number(data.totalIncome) === 0 && Number(data.totalExpense) === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 14 }}>Нет данных за период</div>
          ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Доходы</span>
              <span style={{ color: "#16a34a", fontWeight: 600 }}>{data.totalIncome}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Расходы</span>
              <span style={{ color: "#b91c1c", fontWeight: 600 }}>{data.totalExpense}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Итог</span>
              <span style={{ fontWeight: 700 }}>{data.net}</span>
            </div>
          </div>
          )
        ) : null}
      </div>

      {status === "success" && data ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 600, color: "#0f172a" }}>Операции за период</div>
          {filteredTx.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 14 }}>Нет операций</div>
          ) : (
            filteredTx.map((tx) => {
              const isIncome = tx.type === "income"
              const isExpense = tx.type === "expense"
              const sign = isIncome ? "+" : isExpense ? "-" : ""
              const color = isIncome ? "#16a34a" : isExpense ? "#b91c1c" : "#0f172a"
              return (
                <div
                  key={tx.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #f1f5f9",
                  }}
                >
                  <div style={{ display: "grid", gap: 2 }}>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>
                      {tx.type === "income" ? "Доход" : tx.type === "expense" ? "Расход" : "Перевод"}
                    </span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>{formatDateShort(tx.date)}</span>
                  </div>
                  <div style={{ fontWeight: 700, color }}>
                    {sign}
                    {formatMoney(tx.amount.amount, currency)}
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

export default SummaryReportScreen
