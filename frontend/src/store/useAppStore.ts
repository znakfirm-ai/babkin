import { useState } from "react"
import type { Account, Category, Transaction } from "../types/finance"

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

type AppState = {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
}

const state: AppState = {
  accounts: [
    { id: "acc_cash", name: "Наличные", balance: { amount: 0, currency: "RUB" } },
  ],
  categories: [
    { id: "cat_food", name: "Еда", type: "expense" },
    { id: "cat_salary", name: "Зарплата", type: "income" },
  ],
  transactions: [],
}

export function useAppStore() {
  const [, forceUpdate] = useState(0)

  function addTransaction(input: Omit<Transaction, "id">) {
    const tx: Transaction = { id: uid(), ...input }
    state.transactions.unshift(tx)
    forceUpdate((x) => x + 1)
  }

  return {
    accounts: state.accounts,
    categories: state.categories,
    transactions: state.transactions,
    addTransaction,
  }
}
