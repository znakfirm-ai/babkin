import { Prisma, PrismaClient } from "@prisma/client"

type PrismaLikeClient = PrismaClient | Prisma.TransactionClient

export async function recalculateGoalsCurrentAmount(
  client: PrismaLikeClient,
  workspaceId: string,
): Promise<void> {
  const activeGoals = await client.goals.findMany({
    where: { workspace_id: workspaceId, status: "active" },
    select: { id: true },
  })

  if (activeGoals.length === 0) return

  const activeAccountRows = await client.accounts.findMany({
    where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
    select: { id: true },
  })
  const activeAccountIds = new Set(activeAccountRows.map((account) => account.id))
  const activeGoalIds = activeGoals.map((goal) => goal.id)

  const goalTransactions = await client.transactions.findMany({
    where: {
      workspace_id: workspaceId,
      kind: "transfer",
      goal_id: { in: activeGoalIds },
    },
    select: {
      goal_id: true,
      amount: true,
      from_account_id: true,
      to_account_id: true,
    },
  })

  const currentByGoalId = new Map<string, Prisma.Decimal>()
  for (const goal of activeGoals) {
    currentByGoalId.set(goal.id, new Prisma.Decimal(0))
  }

  for (const transaction of goalTransactions) {
    if (!transaction.goal_id) continue
    const current = currentByGoalId.get(transaction.goal_id) ?? new Prisma.Decimal(0)
    if (transaction.from_account_id && !transaction.to_account_id) {
      if (!activeAccountIds.has(transaction.from_account_id)) continue
      currentByGoalId.set(transaction.goal_id, current.plus(transaction.amount))
      continue
    }
    if (!transaction.from_account_id && transaction.to_account_id) {
      if (!activeAccountIds.has(transaction.to_account_id)) continue
      currentByGoalId.set(transaction.goal_id, current.minus(transaction.amount))
    }
  }

  for (const goalId of activeGoalIds) {
    const calculated = currentByGoalId.get(goalId) ?? new Prisma.Decimal(0)
    const clamped = calculated.lessThan(0) ? new Prisma.Decimal(0) : calculated
    await client.goals.update({
      where: { id: goalId },
      data: { current_amount: clamped },
    })
  }
}
