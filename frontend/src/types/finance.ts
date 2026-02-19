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
  icon?: string | null
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
  accountName?: string | null
  fromAccountName?: string | null
  toAccountName?: string | null

  // для income/expense/debt:
  accountId: string
  fromAccountId?: string
  categoryId?: string
  incomeSourceId?: string

  // для transfer:
  toAccountId?: string

  comment?: string
}
