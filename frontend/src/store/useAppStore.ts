import { useState } from "react"
import type { Account, Category, Transaction } from "../types/finance"

export function useAppStore() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])

  return {
    accounts,
    setAccounts,
    categories,
    setCategories,
    transactions,
    setTransactions,
  }
}
