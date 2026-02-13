import { useMemo, useState } from "react"
import { useAppStore } from "../store/useAppStore"

function AddScreen() {
  const { addTransaction, accounts, categories } = useAppStore()

  const [type, setType] = useState<"expense" | "income">("expense")
  const [categoryId, setCategoryId] = useState<string>("")
  const [amount, setAmount] = useState("")
  const [comment, setComment] = useState("")

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => c.type === type)
  }, [categories, type])

  // если тип поменяли — подставим первую категорию этого типа
  const effectiveCategoryId = categoryId || filteredCategories[0]?.id || ""

  return (
    <div style={{ padding: 20 }}>
      <h2>Добавить операцию</h2>

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>
          Тип
          <select
            value={type}
            onChange={(e) => {
              const next = e.target.value as "expense" | "income"
              setType(next)
              setCategoryId("") // сбросим, чтобы выбралось первое подходящее
            }}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          >
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
          </select>
        </label>

        <label>
          Категория
          <select
            value={effectiveCategoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            disabled={filteredCategories.length === 0}
          >
            {filteredCategories.length === 0 ? (
              <option value="">Нет категорий</option>
            ) : (
              filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </label>

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
              type,
              date: new Date().toISOString().slice(0, 10),
              amount: { amount: Math.round(num * 100), currency: "RUB" },
              accountId: accounts[0]?.id ?? "acc_cash",
              categoryId: effectiveCategoryId || undefined,
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
