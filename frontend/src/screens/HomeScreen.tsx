import { useState } from "react"
import { TransactionModal } from "../components/TransactionModal"
import { useAppStore } from "../store/useAppStore"
import type { Transaction } from "../types/finance"

function formatMoney(amount: number) {
  const rub = amount / 100
  return rub.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽"
}

function HomeScreen() {
  const { transactions, accounts, removeTransaction, addTransaction } = useAppStore()
  const [editingTx, setEditingTx] = useState<Transaction | undefined>(undefined)

  return (
    <>
      <div style={{ padding: 20 }}>
        <h2>Главная</h2>

        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: "12px 0" }}>Счета</h3>
          {accounts.map((a) => (
            <div key={a.id} style={{ marginBottom: 8 }}>
              {a.name}: <strong>{formatMoney(a.balance.amount)}</strong>
            </div>
          ))}
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
