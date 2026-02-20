export type GoalDto = {
  id: string
  name: string
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
  const res = await fetch(`https://babkin.onrender.com/api/v1/goals${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
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
