import { timedFetch } from "../utils/debugTimings"
import type { ApiAccount } from "./accounts"
import type { CategoryDto } from "./categories"
import type { IncomeSourceDto } from "./incomeSources"
import type { GoalDto } from "./goals"
import type { DebtorDto } from "./debtors"
import type { TransactionDto } from "./transactions"

export type BootstrapResponse = {
  accounts: ApiAccount[]
  categories: CategoryDto[]
  incomeSources: IncomeSourceDto[]
  goals: GoalDto[]
  debtors: DebtorDto[]
  transactions: TransactionDto[]
}

export async function getBootstrap(token: string): Promise<BootstrapResponse> {
  const response = await timedFetch(
    "https://babkin.onrender.com/api/v1/bootstrap",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    { label: "bootstrap" },
  )
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`GET /bootstrap failed: ${response.status} ${response.statusText} ${text}`)
  }
  return response.json()
}
