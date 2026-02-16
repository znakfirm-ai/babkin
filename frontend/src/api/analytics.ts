export type SummaryResponse = {
  totalIncome: string
  totalExpense: string
  net: string
}

export async function fetchSummary(token: string, params: { from: string; to: string }): Promise<SummaryResponse> {
  const query = new URLSearchParams({ from: params.from, to: params.to })
  const res = await fetch(`https://babkin.onrender.com/api/v1/analytics/summary?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET /analytics/summary failed: ${res.status} ${res.statusText} ${text}`)
  }
  return res.json()
}

export type ExpensesByCategoryItem = {
  categoryId: string
  name: string
  total: string
}

export type ExpensesByCategoryResponse = {
  top: ExpensesByCategoryItem[]
  otherTotal: string
  totalExpense: string
}

export async function fetchExpensesByCategory(
  token: string,
  params: { from: string; to: string; top?: number }
): Promise<ExpensesByCategoryResponse> {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    top: String(params.top ?? 50),
  })
  const res = await fetch(`https://babkin.onrender.com/api/v1/analytics/expenses-by-category?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET /analytics/expenses-by-category failed: ${res.status} ${res.statusText} ${text}`)
  }
  return res.json()
}
