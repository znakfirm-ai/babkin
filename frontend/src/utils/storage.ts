import type { Account, Category, Debtor, Goal, IncomeSource, Transaction } from "../types/finance"
import { normalizeCurrency } from "./formatMoney"

const STORAGE_KEY = "finance_app_v1"

type AppState = {
  accounts: Account[]
  categories: Category[]
  incomeSources: IncomeSource[]
  transactions: Transaction[]
  goals: Goal[]
  debtors: Debtor[]
  currency: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isMoney = (value: unknown): value is Account["balance"] =>
  isRecord(value) && typeof value.amount === "number" && typeof value.currency === "string"

const isAccount = (value: unknown): value is Account =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  isMoney(value.balance)

const isCategory = (value: unknown): value is Category =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  (value.type === "income" || value.type === "expense") &&
  (value.icon === undefined || value.icon === null || typeof value.icon === "string")

const isIncomeSource = (value: unknown): value is IncomeSource =>
  isRecord(value) && typeof value.id === "string" && typeof value.name === "string"

const isGoal = (value: unknown): value is Goal =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  (value.icon === undefined || value.icon === null || typeof value.icon === "string") &&
  typeof value.targetAmount === "number" &&
  typeof value.currentAmount === "number" &&
  (value.status === "active" || value.status === "completed")

const isDebtor = (value: unknown): value is Debtor =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  (value.icon === undefined || value.icon === null || typeof value.icon === "string") &&
  typeof value.issuedDate === "string" &&
  typeof value.loanAmount === "number" &&
  typeof value.dueDate === "string" &&
  typeof value.returnAmount === "number" &&
  (value.status === "active" || value.status === "completed")

const isTransaction = (value: unknown): value is Transaction => {
  if (!isRecord(value)) return false

  const validType = value.type === "income" || value.type === "expense" || value.type === "transfer" || value.type === "debt"

  const hasBaseFields =
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.accountId === "string" &&
    isMoney(value.amount)

  if (!validType || !hasBaseFields) return false

  if (value.type === "transfer") {
    return typeof value.toAccountId === "string"
  }

  if (value.type === "income") {
    return typeof value.incomeSourceId === "string"
  }

  return true
}

const isAppState = (value: unknown): value is AppState => {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.accounts) || !Array.isArray(value.categories) || !Array.isArray(value.transactions) || !Array.isArray(value.incomeSources) || !Array.isArray(value.goals) || typeof value.currency !== "string")
    return false
  const debtorsValid = value.debtors === undefined || (Array.isArray(value.debtors) && value.debtors.every(isDebtor))
  if (!debtorsValid) return false

  return (
    value.accounts.every(isAccount) &&
    value.categories.every(isCategory) &&
    value.incomeSources.every(isIncomeSource) &&
    value.transactions.every(isTransaction) &&
    value.goals.every(isGoal)
  )
}

const cloneState = (state: AppState): AppState => ({
  accounts: state.accounts.map((a) => ({ ...a, balance: { ...a.balance } })),
  categories: state.categories.map((c) => ({ ...c })),
  incomeSources: state.incomeSources.map((s) => ({ ...s })),
  transactions: state.transactions.map((t) => ({ ...t, amount: { ...t.amount } })),
  goals: state.goals.map((g) => ({ ...g })),
  debtors: state.debtors.map((d) => ({ ...d })),
  currency: state.currency,
})

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") return null
  return window.localStorage ?? null
}

const clearBrokenKey = (storage: Storage) => {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function loadFromStorage(defaultState: AppState): AppState {
  const storage = getStorage()
  if (!storage) return cloneState(defaultState)

  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return cloneState(defaultState)

  try {
    const parsed = JSON.parse(raw) as unknown
    if (isAppState(parsed)) {
      const normalized = {
        ...parsed,
        debtors: Array.isArray(parsed.debtors) ? parsed.debtors : [],
        currency: normalizeCurrency(parsed.currency),
      }
      return cloneState(normalized)
    }

    clearBrokenKey(storage)
    console.warn("Persisted data invalid, reset to defaults")
    return cloneState(defaultState)
  } catch {
    clearBrokenKey(storage)
    console.warn("Persisted data invalid, reset to defaults")
    return cloneState(defaultState)
  }
}

export function saveToStorage(state: AppState) {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    console.warn("Failed to save data to localStorage")
  }
}

export { STORAGE_KEY }
