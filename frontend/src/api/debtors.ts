export type DebtorDto = {
  id: string
  name: string
  icon: string | null
  issuedAt: string
  principalAmount: string
  dueAt: string | null
  payoffAmount: string | null
  status: "active" | "completed"
  direction: "receivable" | "payable"
  createdAt: string
  updatedAt: string
}

export type GetDebtorsResponse = {
  debtors: DebtorDto[]
}

export async function getDebtors(
  token: string,
  params?: { status?: "active" | "completed"; direction?: "receivable" | "payable" },
): Promise<GetDebtorsResponse> {
  const search = new URLSearchParams()
  if (params?.status) search.set("status", params.status)
  if (params?.direction) search.set("direction", params.direction)
  const query = search.toString() ? `?${search.toString()}` : ""
  const res = await fetch(`https://babkin.onrender.com/api/v1/debtors${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET /debtors failed: ${res.status} ${res.statusText} ${text}`)
  }
  return res.json()
}

export async function createDebtor(
  token: string,
  input: {
    name: string
    icon?: string | null
    issuedAt: string
    principalAmount: number
    dueAt?: string | null
    payoffAmount?: number | null
    status?: "active" | "completed"
    direction: "receivable" | "payable"
  },
) {
  const res = await fetch("https://babkin.onrender.com/api/v1/debtors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: input.name,
      icon: input.icon ?? null,
      issuedAt: input.issuedAt,
      principalAmount: input.principalAmount,
      dueAt: input.dueAt ?? null,
      payoffAmount: input.payoffAmount ?? null,
      status: input.status ?? "active",
      direction: input.direction,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`POST /debtors failed: ${res.status} ${res.statusText} ${text}`)
  }
  return (await res.json()) as { debtor: DebtorDto }
}

export async function updateDebtor(
  token: string,
  id: string,
  input: {
    name?: string
    icon?: string | null
    issuedAt?: string
    principalAmount?: number
    dueAt?: string | null
    payoffAmount?: number | null
    status?: "active" | "completed"
    direction?: "receivable" | "payable"
  },
) {
  const res = await fetch(`https://babkin.onrender.com/api/v1/debtors/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`PATCH /debtors/${id} failed: ${res.status} ${res.statusText} ${text}`)
  }
  return (await res.json()) as { debtor: DebtorDto }
}

export async function deleteDebtor(token: string, id: string, direction?: "receivable" | "payable") {
  const query = direction ? `?direction=${direction}` : ""
  const res = await fetch(`https://babkin.onrender.com/api/v1/debtors/${id}${query}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`DELETE /debtors/${id} failed: ${res.status} ${res.statusText} ${text}`)
  }
}
