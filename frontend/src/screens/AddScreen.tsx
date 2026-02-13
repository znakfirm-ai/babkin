import { useState } from "react"
import { useAppStore } from "../store/useAppStore"

function AddScreen() {
  const { addTransaction, accounts } = useAppStore()

  const [amount, setAmount] = useState("")
  const [comment, setComment] = useState("")

  return (
    <div style={{ padding: 20 }}>
      <h2>Добавить операцию</h2>

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>
          Сумма
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            placeholder="Например, 1500"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Комментарий
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Например, продукты"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <button
          type="button"
          style={{ padding: 12 }}
          onClick={() => {
            const num = Number(amount.replace(",", "."))
            if (!Number.isFinite(num) || num <= 0) return

            addTransaction({
              type: "expense",
              date: new Date().toISOString().slice(0, 10),
              amount: { amount: Math.round(num * 100), currency: "RUB" },
              accountId: accounts[0]?.id ?? "acc_cash",
              comment: comment.trim() || undefined,
            })

            setAmount("")
            setComment("")
            alert("Сохранено (в памяти)")
          }}
        >
          Сохранить
        </button>
      </div>
    </div>
  )
}

export default AddScreen
