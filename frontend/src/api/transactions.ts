export type TransactionDto = {
  id: string
  kind: "income" | "expense" | "transfer"
  amount: number | string
  happenedAt: string
  note?: string | null
  accountId?: string | null
  accountName?: string | null
  categoryId?: string | null
  fromAccountId?: string | null
  fromAccountName?: string | null
  toAccountId?: string | null
  toAccountName?: string | null
  incomeSourceId?: string | null
  goalId?: string | null
  goalName?: string | null
  debtorId?: string | null
  debtorName?: string | null
}

export type GetTransactionsResponse = {
  transactions: TransactionDto[]
}

export type CreateTransactionBody = {
  kind: "income" | "expense" | "transfer"
  amount: number
  accountId?: string
  categoryId?: string | null
  fromAccountId?: string
  toAccountId?: string
  incomeSourceId?: string | null
  goalId?: string | null
  debtorId?: string | null
  happenedAt?: string
  note?: string | null
}

export async function getTransactions(token: string): Promise<GetTransactionsResponse> {
  const res = await fetch("https://babkin.onrender.com/api/v1/transactions", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET /transactions failed: ${res.status} ${res.statusText} ${text}`)
  }
  return res.json()
}

export async function createTransaction(token: string, body: CreateTransactionBody): Promise<void> {
  const res = await fetch("https://babkin.onrender.com/api/v1/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`POST /transactions failed: ${res.status} ${res.statusText} ${text}`)
  }
}

export async function deleteTransaction(token: string, id: string): Promise<void> {
  const res = await fetch(`https://babkin.onrender.com/api/v1/transactions/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`DELETE /transactions/${id} failed: ${res.status} ${res.statusText} ${text}`)
  }
}
