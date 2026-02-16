import { useEffect, useMemo, useState } from "react"
import { fetchExpensesByCategory } from "../api/analytics"
import { format } from "../utils/date"

type Props = {
  onBack: () => void
}

type Period = "today" | "week" | "month" | "custom"

const ExpensesByCategoryScreen: React.FC<Props> = ({ onBack }) => {
  const [period, setPeriod] = useState<Period>("today")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<
    | {
        top: { categoryId: string; name: string; total: string }[]
        otherTotal: string
        totalExpense: string
      }
    | null
  >(null)

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
    if (!token || !f || !t) return
    setIsLoading(true)
    try {
      const res = await fetchExpensesByCategory(token, { from: f, to: t, top: 50 })
      setData(res)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка загрузки отчёта")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (from && to) {
      void load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

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

      <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Расходы по категориям</div>

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
          display: "grid",
          gap: 10,
        }}
      >
        {isLoading ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Загрузка...</div>
        ) : data ? (
          <>
            {data.top.map((item) => (
              <div key={item.categoryId} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{item.name}</span>
                <span style={{ fontWeight: 600 }}>{item.total}</span>
              </div>
            ))}
            {data.otherTotal !== "0.00" ? (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280" }}>
                <span>Остальное</span>
                <span>{data.otherTotal}</span>
              </div>
            ) : null}
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: "1px dashed #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
              }}
            >
              <span>Всего расходы</span>
              <span>{data.totalExpense}</span>
            </div>
          </>
        ) : (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Нет данных</div>
        )}
      </div>
    </div>
  )
}

export default ExpensesByCategoryScreen
