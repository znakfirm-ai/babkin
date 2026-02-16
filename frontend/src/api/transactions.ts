export type TransactionDto = {
  id: string
  kind: "income" | "expense" | "transfer"
  amount: number | string
  happenedAt: string
  note?: string | null
  accountId?: string | null
  categoryId?: string | null
  fromAccountId?: string | null
  toAccountId?: string | null
}

export type GetTransactionsResponse = {
  transactions: TransactionDto[]
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
