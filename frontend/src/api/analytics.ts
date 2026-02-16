export type SummaryResponse = {
  totalIncome: string
  totalExpense: string
  net: string
}

async function fetchWithRetry(url: string, options: { headers: Record<string, string>; signal?: AbortSignal }): Promise<Response> {
  let attempt = 0
  // retry at most once (total 2 attempts)
  while (true) {
    let res: Response
    try {
      res = await fetch(url, { ...options })
    } catch (err) {
      if (options.signal?.aborted) throw err
      const isNetworkError = err instanceof TypeError
      if (isNetworkError && attempt === 0) {
        attempt += 1
        continue
      }
      if (err instanceof Error) throw err
      throw new Error("Network error")
    }

    if (res.status >= 500 && res.status <= 599 && attempt === 0) {
      attempt += 1
      continue
    }

    return res
  }
}

export async function fetchSummary(
  token: string,
  params: { from: string; to: string },
  signal?: AbortSignal
): Promise<SummaryResponse> {
  const query = new URLSearchParams({ from: params.from, to: params.to })
  const res = await fetchWithRetry(`https://babkin.onrender.com/api/v1/analytics/summary?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
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
  params: { from: string; to: string; top?: number },
  signal?: AbortSignal
): Promise<ExpensesByCategoryResponse> {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    top: String(params.top ?? 50),
  })
  const res = await fetchWithRetry(
    `https://babkin.onrender.com/api/v1/analytics/expenses-by-category?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal,
    }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET /analytics/expenses-by-category failed: ${res.status} ${res.statusText} ${text}`)
  }
  return res.json()
}
