export type Money = {
  amount: number // храним в минимальных единицах (копейки), чтобы не ловить ошибки округления
  currency: "RUB"
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

export type TransactionType = "income" | "expense" | "transfer" | "debt"

export type Transaction = {
  id: string
  type: TransactionType
  date: string // ISO (YYYY-MM-DD)
  amount: Money
  accountId: string
  categoryId?: string
  comment?: string
}
