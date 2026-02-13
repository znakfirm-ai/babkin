import { useState } from "react"

function AddScreen() {
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

        <button type="button" style={{ padding: 12 }}>
          Сохранить (пока не работает)
        </button>
      </div>
    </div>
  )
}

export default AddScreen
