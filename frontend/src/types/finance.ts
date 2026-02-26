export type Money = {
  amount: number // в рублях
  currency: string
}

export type Account = {
  id: string
  name: string
  balance: Money
  color?: string
  icon?: string | null
}

export type Category = {
  id: string
  name: string
  type: "income" | "expense"
  icon?: string | null
  budget?: number | null
}

export type IncomeSource = {
  id: string
  name: string
  icon?: string | null
}

export type Goal = {
  id: string
  name: string
  icon?: string | null
  targetAmount: number
  currentAmount: number
  status: "active" | "completed"
}

export type Debtor = {
  id: string
  name: string
  icon?: string | null
  issuedDate: string
  loanAmount: number
  dueDate: string
  returnAmount: number
  status: "active" | "completed"
  direction: "receivable" | "payable"
}

export type TransactionType = "income" | "expense" | "transfer" | "debt" | "adjustment"

export type Transaction = {
  id: string
  type: TransactionType
  date: string // ISO (YYYY-MM-DD)
  amount: Money
  accountName?: string | null
  fromAccountName?: string | null
  toAccountName?: string | null
  goalId?: string | null
  goalName?: string | null
  debtorId?: string | null
  debtorName?: string | null

  // для income/expense/debt:
  accountId: string
  fromAccountId?: string
  categoryId?: string
  incomeSourceId?: string

  // для transfer:
  toAccountId?: string

  comment?: string
}
