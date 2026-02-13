import { useMemo, useState } from "react"
import { TransactionModal } from "../components/TransactionModal"
import { useAppStore } from "../store/useAppStore"
import type { Transaction } from "../types/finance"
import { AppIcon } from "../components/AppIcon"
import type { IconName } from "../components/AppIcon"

function formatMoney(amount: number) {
  const rub = amount / 100
  return rub.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽"
}

function HomeScreen() {
  const { transactions, accounts, categories, removeTransaction, addTransaction } = useAppStore()
  const [editingTx, setEditingTx] = useState<Transaction | undefined>(undefined)
  const stories = useMemo<{ id: string; title: string; icon: IconName; active?: boolean }[]>(
    () => [
      { id: "story-accounts", title: "Счета", icon: "wallet", active: true },
      { id: "story-income", title: "Доходы", icon: "arrowUp" },
      { id: "story-expense", title: "Расходы", icon: "arrowDown" },
      { id: "story-goals", title: "Цели", icon: "goal" },
      { id: "story-trip", title: "Путешествия", icon: "plane" },
      { id: "story-car", title: "Авто", icon: "car" },
      { id: "story-home", title: "Дом", icon: "home" },
    ],
    []
  )

  const currentMonthTag = useMemo(() => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    return `${now.getFullYear()}-${month}`
  }, [])

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>()
    transactions.forEach((tx) => {
      if (tx.type !== "expense") return
      if (tx.date.slice(0, 7) !== currentMonthTag) return
      const key = tx.categoryId ?? "uncategorized"
      map.set(key, (map.get(key) ?? 0) + tx.amount.amount)
    })
    return map
  }, [transactions, currentMonthTag])

  const accountTiles = useMemo(
    () =>
      accounts.map((a) => ({
        id: a.id,
        title: a.name,
        amount: a.balance.amount,
        icon: "👛",
        type: "account" as const,
        size: "lg" as const,
      })),
    [accounts]
  )

  const categoryTiles = useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        title: c.name,
        amount: expenseByCategory.get(c.id) ?? 0,
        icon: "🏷️",
        type: "category" as const,
      })),
    [categories, expenseByCategory]
  )

  const computeSize = (amount: number, max: number) => {
    if (max <= 0) return "md"
    const ratio = amount / max
    if (ratio >= 0.66) return "lg"
    if (ratio >= 0.33) return "md"
    return "sm"
  }

  const maxCategoryAmount = useMemo(() => Math.max(0, ...categoryTiles.map((c) => c.amount)), [categoryTiles])

  const renderTile = (item: {
    id: string
    title: string
    amount: number
    icon: string
    isAdd?: boolean
    type?: "account" | "category"
    size?: "sm" | "md" | "lg"
  }) => {
    const size =
      item.size ??
      (item.type === "category" ? computeSize(item.amount, maxCategoryAmount) : item.type === "account" ? "lg" : "md")
    const typeClass = item.type ? `tile-card--${item.type}` : ""
    return (
      <div key={item.id} className={`tile-card ${item.isAdd ? "tile-card--add" : ""} ${typeClass} tile--${size}`}>
        <div className="tile-card__icon">{item.icon}</div>
        <div className="tile-card__title">{item.title}</div>
        {!item.isAdd && <div className="tile-card__amount">{formatMoney(item.amount)}</div>}
      </div>
    )
  }

  return (
    <>
      <div className="home-screen">
        <h2>Главная</h2>

        <div className="home-stories">
          {stories.map((story) => (
            <div
              key={story.id}
              className={`home-story-card ${story.active ? "home-story-card--active" : ""}`}
              role="button"
              tabIndex={0}
            >
              <div className="home-story-card__icon-wrapper">
                <AppIcon name={story.icon} size={18} />
              </div>
              <div className="home-story-card__title">{story.title}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div>
            <h3 style={{ margin: "12px 0" }}>Счета</h3>
            <div className="account-row">
              {accountTiles.map(renderTile)}
              {renderTile({ id: "add-account", title: "Добавить", amount: 0, icon: "+", isAdd: true })}
            </div>
          </div>

          <div>
            <h3 style={{ margin: "12px 0" }}>Категории</h3>
            <div className="tile-grid">
              {categoryTiles.map(renderTile)}
              {renderTile({ id: "add-category", title: "Добавить", amount: 0, icon: "+", isAdd: true })}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "12px 0" }}>Операции</h3>

          {transactions.length === 0 ? (
            <p>Пока нет операций</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {transactions.map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 12,
                    display: "grid",
                    gap: 6,
                    cursor: "pointer",
                  }}
                  onClick={() => setEditingTx(t)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{t.type}</strong>
                    <strong>{formatMoney(t.amount.amount)}</strong>
                  </div>
                  <div style={{ opacity: 0.7 }}>{t.date}</div>
                  {t.comment ? <div>{t.comment}</div> : null}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeTransaction(t.id)
                      }}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "6px 10px",
                        cursor: "pointer",
                      }}
                    >
                      🗑 Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingTx ? (
        <TransactionModal
          transaction={editingTx}
          onClose={() => setEditingTx(undefined)}
          onSave={(data, originalId) => {
            if (originalId) removeTransaction(originalId)
            addTransaction(data)
            setEditingTx(undefined)
          }}
        />
      ) : null}
    </>
  )
}

export default HomeScreen
