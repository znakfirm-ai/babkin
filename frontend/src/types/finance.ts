export type Money = {
  amount: number // в рублях
  currency: string
}

export type Account = {
  id: string
  name: string
  balance: Money
}

export type Category = {
  id: string
  name: string
  type: "income" | "expense"
}

export type IncomeSource = {
  id: string
  name: string
  icon?: string
}

export type TransactionType = "income" | "expense" | "transfer" | "debt"

export type Transaction = {
  id: string
  type: TransactionType
  date: string // ISO (YYYY-MM-DD)
  amount: Money

  // для income/expense/debt:
  accountId: string
  categoryId?: string
  incomeSourceId?: string

  // для transfer:
  toAccountId?: string

  comment?: string
}
