import { useState } from "react"
import type { Account, Category, IncomeSource, Transaction } from "../types/finance"
import { loadFromStorage, saveToStorage } from "../utils/storage"

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

type AppState = {
  accounts: Account[]
  categories: Category[]
  incomeSources: IncomeSource[]
  transactions: Transaction[]
}

const defaultState: AppState = {
  accounts: [],
  categories: [
    { id: "cat_food", name: "Еда", type: "expense" },
  ],
  incomeSources: [
    { id: "src_salary", name: "Зарплата" },
    { id: "src_business", name: "Бизнес" },
  ],
  transactions: [],
}

const createDefaultState = (): AppState => ({
  accounts: [],
  categories: defaultState.categories.map((c) => ({ ...c })),
  incomeSources: defaultState.incomeSources.map((s) => ({ ...s })),
  transactions: [],
})

let state: AppState = loadFromStorage(createDefaultState())

export function useAppStore() {
  const [, forceUpdate] = useState(0)

  function addTransaction(input: Omit<Transaction, "id">) {
    const tx: Transaction = { id: uid(), ...input }
    state.transactions.unshift(tx)

    // пересчёт баланса
    if (tx.type === "income" || tx.type === "expense") {
      const acc = state.accounts.find((a) => a.id === tx.accountId)
      if (acc) {
        if (tx.type === "income") acc.balance.amount += tx.amount.amount
        if (tx.type === "expense") acc.balance.amount -= tx.amount.amount
      }
    }

    if (tx.type === "transfer") {
      const from = state.accounts.find((a) => a.id === tx.accountId)
      const to = state.accounts.find((a) => a.id === tx.toAccountId)
      if (from && to && tx.toAccountId && tx.toAccountId !== tx.accountId) {
        from.balance.amount -= tx.amount.amount
        to.balance.amount += tx.amount.amount
      }
    }

    saveToStorage(state)

    forceUpdate((x) => x + 1)
  }

  function removeTransaction(id: string) {
    const idx = state.transactions.findIndex((t) => t.id === id)
    if (idx === -1) return
    const tx = state.transactions[idx]

    if (tx.type === "income" || tx.type === "expense") {
      const acc = state.accounts.find((a) => a.id === tx.accountId)
      if (acc) {
        if (tx.type === "income") acc.balance.amount -= tx.amount.amount
        if (tx.type === "expense") acc.balance.amount += tx.amount.amount
      }
    }

    if (tx.type === "transfer") {
      const from = state.accounts.find((a) => a.id === tx.accountId)
      const to = state.accounts.find((a) => a.id === tx.toAccountId)
      if (from && to && tx.toAccountId && tx.toAccountId !== tx.accountId) {
        from.balance.amount += tx.amount.amount
        to.balance.amount -= tx.amount.amount
      }
    }

    state.transactions.splice(idx, 1)
    saveToStorage(state)
    forceUpdate((x) => x + 1)
  }

  function setAccounts(accounts: Account[]) {
    state.accounts = accounts.map((a) => ({ ...a, balance: { ...a.balance } }))
    saveToStorage(state)
    forceUpdate((x) => x + 1)
  }

  return {
    accounts: state.accounts,
    categories: state.categories,
    incomeSources: state.incomeSources,
    transactions: state.transactions,
    addTransaction,
    removeTransaction,
    setAccounts,
  }
}
