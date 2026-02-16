export type IncomeSourceDto = {
  id: string
  name: string
}

export type GetIncomeSourcesResponse = {
  incomeSources: IncomeSourceDto[]
}

export async function getIncomeSources(token: string): Promise<GetIncomeSourcesResponse> {
  const res = await fetch("https://babkin.onrender.com/api/v1/income-sources", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET /income-sources failed: ${res.status} ${res.statusText} ${text}`)
  }
  return res.json()
}

export async function createIncomeSource(token: string, name: string): Promise<IncomeSourceDto> {
  const res = await fetch("https://babkin.onrender.com/api/v1/income-sources", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`POST /income-sources failed: ${res.status} ${res.statusText} ${text}`)
  }
  const data = (await res.json()) as { incomeSource: IncomeSourceDto }
  return data.incomeSource
}

export async function renameIncomeSource(token: string, id: string, name: string): Promise<IncomeSourceDto> {
  const res = await fetch(`https://babkin.onrender.com/api/v1/income-sources/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`PATCH /income-sources failed: ${res.status} ${res.statusText} ${text}`)
  }
  const data = (await res.json()) as { incomeSource: IncomeSourceDto }
  return data.incomeSource
}

export async function deleteIncomeSource(token: string, id: string): Promise<void> {
  const res = await fetch(`https://babkin.onrender.com/api/v1/income-sources/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`DELETE /income-sources failed: ${res.status} ${res.statusText} ${text}`)
  }
}
