import { timedFetch } from "../utils/debugTimings"

export type GoalDto = {
  id: string
  name: string
  createdAt?: string | null
  icon: string | null
  targetAmount: string
  currentAmount: string
  status: "active" | "completed"
}

export type GetGoalsResponse = {
  goals: GoalDto[]
}

export async function getGoals(token: string, status?: "active" | "completed"): Promise<GetGoalsResponse> {
  const query = status ? `?status=${status}` : ""
  const res = await timedFetch(
    `https://babkin.onrender.com/api/v1/goals${query}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    { label: "goals" },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET /goals failed: ${res.status} ${res.statusText} ${text}`)
  }
  return res.json()
}

export async function createGoal(token: string, input: { name: string; icon?: string | null; targetAmount: number }) {
  const res = await fetch("https://babkin.onrender.com/api/v1/goals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: input.name,
      icon: input.icon ?? null,
      targetAmount: input.targetAmount,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`POST /goals failed: ${res.status} ${res.statusText} ${text}`)
  }
  return (await res.json()) as { goal: GoalDto }
}

export async function updateGoal(
  token: string,
  id: string,
  input: { name?: string; icon?: string | null; targetAmount?: number; status?: "active" | "completed" },
) {
  const res = await fetch(`https://babkin.onrender.com/api/v1/goals/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`PATCH /goals failed: ${res.status} ${res.statusText} ${text}`)
  }
  return (await res.json()) as { goal: GoalDto }
}

export async function contributeGoal(
  token: string,
  goalId: string,
  body: { accountId: string; amount: number; date?: string; description?: string | null; note?: string | null },
) {
  const normalizedDescription = body.description ?? body.note ?? null
  const res = await fetch(`https://babkin.onrender.com/api/v1/goals/${goalId}/contribute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      accountId: body.accountId,
      amount: body.amount,
      date: body.date,
      description: normalizedDescription,
      note: body.note ?? normalizedDescription,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`POST /goals/${goalId}/contribute failed: ${res.status} ${res.statusText} ${text}`)
  }
  return (await res.json()) as { goal: GoalDto }
}

export async function completeGoal(token: string, goalId: string, destinationAccountId?: string) {
  const res = await fetch(`https://babkin.onrender.com/api/v1/goals/${goalId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(destinationAccountId ? { destinationAccountId } : {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`POST /goals/${goalId}/complete failed: ${res.status} ${res.statusText} ${text}`)
  }
  return (await res.json()) as { goal: GoalDto }
}
