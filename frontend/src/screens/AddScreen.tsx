import React, { useMemo, useState } from "react"
import { useAppStore } from "../store/useAppStore"
import { createCategory } from "../api/categories"

type TxKind = "expense" | "income" | "transfer"

function AddScreen() {
  const { addTransaction, accounts, categories, incomeSources } = useAppStore()

  const [type, setType] = useState<TxKind>("expense")

  // income/expense
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "")
  const [categoryId, setCategoryId] = useState<string>("")
  const [incomeSourceId, setIncomeSourceId] = useState<string>(incomeSources[0]?.id ?? "")

  // transfer
  const [fromAccountId, setFromAccountId] = useState<string>(accounts[0]?.id ?? "")
  const [toAccountId, setToAccountId] = useState<string>(accounts[1]?.id ?? accounts[0]?.id ?? "")

  const [amount, setAmount] = useState("")
  const [comment, setComment] = useState("")

  const filteredCategories = useMemo(() => {
    const catType = "expense"
    return categories.filter((c) => c.type === catType)
  }, [categories])

  const incomeSourceOptions = incomeSources

  const effectiveCategoryId = categoryId || filteredCategories[0]?.id || ""
  const effectiveIncomeSourceId = incomeSourceId || incomeSourceOptions[0]?.id || ""
  const effectiveAccountId = accountId || accounts[0]?.id || ""
  const effectiveFromAccountId = fromAccountId || accounts[0]?.id || ""
  const effectiveToAccountId =
    toAccountId || accounts.find((a) => a.id !== effectiveFromAccountId)?.id || accounts[0]?.id || ""

  const showCategory = type === "expense"
  const showIncomeSource = type === "income"
  const showSingleAccount = type === "income" || type === "expense"
  const showTransferAccounts = type === "transfer"

  const handleMaybeBlur = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, select, button")) return
    const active = document.activeElement as HTMLElement | null
    active?.blur()
  }

  return (
    <div style={{ padding: 20, minHeight: "100%", display: "flex", flexDirection: "column" }} onPointerDown={handleMaybeBlur}>
      <h2>Добавить операцию</h2>

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>
          Тип
          <select
            value={type}
            onChange={(e) => {
              const next = e.target.value as TxKind
              setType(next)
              setCategoryId("")
            }}
            style={{ width: "100%", padding: 12, marginTop: 6, fontSize: 16 }}
          >
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="transfer">Перевод</option>
          </select>
        </label>

        {showSingleAccount ? (
          <label>
            Счёт
            <select
              value={effectiveAccountId}
              onChange={(e) => setAccountId(e.target.value)}
              style={{ width: "100%", padding: 12, marginTop: 6, fontSize: 16 }}
              disabled={accounts.length === 0}
            >
              {accounts.length === 0 ? (
                <option value="">Нет счетов</option>
              ) : (
                accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : null}

        {showTransferAccounts ? (
          <>
            <label>
              Со счёта
              <select
                value={effectiveFromAccountId}
                onChange={(e) => {
                  const nextFrom = e.target.value
                  setFromAccountId(nextFrom)
                  if (nextFrom === effectiveToAccountId) {
                    const alt = accounts.find((a) => a.id !== nextFrom)?.id || ""
                    setToAccountId(alt)
                  }
                }}
                style={{ width: "100%", padding: 12, marginTop: 6, fontSize: 16 }}
                disabled={accounts.length < 2}
              >
                {accounts.length < 2 ? (
                  <option value="">Нужно 2 счёта</option>
                ) : (
                  accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              На счёт
              <select
                value={effectiveToAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
              style={{ width: "100%", padding: 12, marginTop: 6, fontSize: 16 }}
              disabled={accounts.length < 2}
            >
                {accounts.length < 2 ? (
                  <option value="">Нужно 2 счёта</option>
                ) : (
                  accounts
                    .filter((a) => a.id !== effectiveFromAccountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))
                )}
              </select>
            </label>
          </>
        ) : null}

        {showCategory ? (
          <label>
            Категория
            <select
              value={effectiveCategoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{ width: "100%", padding: 12, marginTop: 6, fontSize: 16 }}
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
        ) : null}

        {showIncomeSource ? (
          <label>
            Источник дохода
            <select
              value={effectiveIncomeSourceId}
              onChange={(e) => setIncomeSourceId(e.target.value)}
              style={{ width: "100%", padding: 12, marginTop: 6, fontSize: 16 }}
              disabled={incomeSourceOptions.length === 0}
            >
              {incomeSourceOptions.length === 0 ? (
                <option value="">Нет источников</option>
              ) : (
                incomeSourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : null}

        <label>
          Сумма
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            placeholder="Например, 1500"
            style={{ width: "100%", padding: 12, marginTop: 6, fontSize: 18 }}
          />
        </label>

        <label>
          Комментарий
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Например, продукты / перевод на карту"
            style={{ width: "100%", padding: 12, marginTop: 6, fontSize: 16 }}
          />
        </label>

        <button
          type="button"
          style={{ padding: 12 }}
          onClick={() => {
            const num = Number(amount.replace(",", "."))
            if (!Number.isFinite(num) || num <= 0) return

            const money = { amount: Math.round(num * 100), currency: "RUB" as const }
            const date = new Date().toISOString().slice(0, 10)

            if (type === "transfer") {
              if (!effectiveFromAccountId || !effectiveToAccountId) return
              if (effectiveFromAccountId === effectiveToAccountId) return

              addTransaction({
                type: "transfer",
                date,
                amount: money,
                accountId: effectiveFromAccountId,
                toAccountId: effectiveToAccountId,
                comment: comment.trim() || undefined,
              })
            } else {
              if (!effectiveAccountId) return

              if (type === "income") {
                if (!effectiveIncomeSourceId) return
                addTransaction({
                  type: "income",
                  date,
                  amount: money,
                  accountId: effectiveAccountId,
                  incomeSourceId: effectiveIncomeSourceId,
                  comment: comment.trim() || undefined,
                })
              } else {
                addTransaction({
                  type: "expense",
                  date,
                  amount: money,
                  accountId: effectiveAccountId,
                  categoryId: effectiveCategoryId || undefined,
                  comment: comment.trim() || undefined,
                })
              }
            }

            setAmount("")
            setComment("")
            alert("Сохранено")
          }}
        >
          Сохранить
        </button>
      </div>
    </div>
  )
}

export default AddScreen
