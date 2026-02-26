export type DebtorDto = {
  id: string
  name: string
  icon: string | null
  issuedAt: string
  principalAmount: string
  dueAt: string | null
  payoffAmount: string | null
  status: "active" | "completed"
  createdAt: string
  updatedAt: string
}

export type GetDebtorsResponse = {
  debtors: DebtorDto[]
}

export async function getDebtors(token: string, status?: "active" | "completed"): Promise<GetDebtorsResponse> {
  const query = status ? `?status=${status}` : ""
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

export async function deleteDebtor(token: string, id: string) {
  const res = await fetch(`https://babkin.onrender.com/api/v1/debtors/${id}`, {
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
