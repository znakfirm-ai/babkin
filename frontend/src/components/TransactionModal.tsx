import React, { useMemo, useState } from "react"
import type { Transaction } from "../types/finance"
import { useAppStore } from "../store/useAppStore"
import "./TransactionModal.css"

type Props = {
  transaction?: Transaction
  onClose: () => void
  onSave: (data: Omit<Transaction, "id">, originalId?: string) => void
}

type TxKind = "expense" | "income" | "transfer"

export function TransactionModal({ transaction, onClose, onSave }: Props) {
  const { accounts, categories, incomeSources } = useAppStore()

  const initialType: TxKind = transaction?.type === "transfer" ? "transfer" : transaction?.type === "income" ? "income" : "expense"

  const [type, setType] = useState<TxKind>(initialType)

  const [accountId, setAccountId] = useState<string>(transaction?.accountId ?? accounts[0]?.id ?? "")
  const [categoryId, setCategoryId] = useState<string>(transaction?.categoryId ?? "")
  const [incomeSourceId, setIncomeSourceId] = useState<string>(transaction?.incomeSourceId ?? incomeSources[0]?.id ?? "")

  const [fromAccountId, setFromAccountId] = useState<string>(transaction?.accountId ?? accounts[0]?.id ?? "")
  const [toAccountId, setToAccountId] = useState<string>(transaction?.toAccountId ?? accounts[1]?.id ?? accounts[0]?.id ?? "")

  const [amount, setAmount] = useState(() => {
    if (!transaction) return ""
    return (transaction.amount.amount / 100).toString()
  })
  const [comment, setComment] = useState(transaction?.comment ?? "")

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

  const handleSave = () => {
    const num = Number(amount.replace(",", "."))
    if (!Number.isFinite(num) || num <= 0) return

    const money = { amount: Math.round(num * 100), currency: "RUB" as const }
    const date = transaction?.date ?? new Date().toISOString().slice(0, 10)

    if (type === "transfer") {
      if (!effectiveFromAccountId || !effectiveToAccountId) return
      if (effectiveFromAccountId === effectiveToAccountId) return

      onSave(
        {
          type: "transfer",
          date,
          amount: money,
          accountId: effectiveFromAccountId,
          toAccountId: effectiveToAccountId,
          comment: comment.trim() || undefined,
        },
        transaction?.id
      )
    } else {
      if (!effectiveAccountId) return

      if (type === "income") {
        if (!effectiveIncomeSourceId) return
        onSave(
          {
            type: "income",
            date,
            amount: money,
            accountId: effectiveAccountId,
            incomeSourceId: effectiveIncomeSourceId,
            comment: comment.trim() || undefined,
          },
          transaction?.id
        )
      } else {
        onSave(
          {
            type: "expense",
            date,
            amount: money,
            accountId: effectiveAccountId,
            categoryId: effectiveCategoryId || undefined,
            comment: comment.trim() || undefined,
          },
          transaction?.id
        )
      }
    }
  }

  const handleMaybeBlur = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, select, button")) return
    const active = document.activeElement as HTMLElement | null
    active?.blur()
  }

  return (
    <div className="tx-modal__backdrop" onClick={onClose}>
      <div
        className="tx-modal"
        onPointerDown={handleMaybeBlur}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <div className="tx-modal__header">
          <div className="tx-modal__title">{transaction ? "Редактировать операцию" : "Добавить операцию"}</div>
          <button className="tx-modal__close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="tx-modal__body">
          <label className="tx-modal__field">
            Тип
            <select
              value={type}
              onChange={(e) => {
                const next = e.target.value as TxKind
                setType(next)
                setCategoryId("")
              }}
            >
              <option value="expense">Расход</option>
              <option value="income">Доход</option>
              <option value="transfer">Перевод</option>
            </select>
          </label>

          {showSingleAccount ? (
            <label className="tx-modal__field">
              Счёт
              <select value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
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
              <label className="tx-modal__field">
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

              <label className="tx-modal__field">
                На счёт
                <select value={effectiveToAccountId} onChange={(e) => setToAccountId(e.target.value)} disabled={accounts.length < 2}>
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
            <label className="tx-modal__field">
              Категория
              <select value={effectiveCategoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={filteredCategories.length === 0}>
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
            <label className="tx-modal__field">
              Источник дохода
              <select
                value={effectiveIncomeSourceId}
                onChange={(e) => setIncomeSourceId(e.target.value)}
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

          <label className="tx-modal__field">
            Сумма
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder="Например, 1500"
            />
          </label>

          <label className="tx-modal__field">
            Комментарий
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Например, продукты / перевод на карту"
            />
          </label>
        </div>

        <div className="tx-modal__footer">
          <button type="button" className="tx-modal__button tx-modal__button--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="tx-modal__button tx-modal__button--primary" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}
