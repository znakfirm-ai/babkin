import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma, TransactionKind } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"
import {
  hasDefaultsNormalizationChanges,
  hasDefaultsNormalizationConflicts,
  seedWorkspaceDefaults,
} from "../defaults/workspaceDefaults"

type BootstrapResponse = {
  accounts: Array<{
    id: string
    name: string
    displayName: string | null
    type: string
    currency: string
    balance: number
    color: string | null
    icon: string | null
    iconEmoji: string | null
  }>
  categories: Array<{
    id: string
    name: string
    kind: "income" | "expense"
    icon: string | null
    budget: number | null
    isArchived: boolean
  }>
  incomeSources: Array<{
    id: string
    name: string
    icon: string | null
    isArchived: boolean
  }>
  goals: Array<{
    id: string
    name: string
    icon: string | null
    targetAmount: string
    currentAmount: string
    status: "active" | "completed"
    createdAt: string
    completedAt: string | null
  }>
  debtors: Array<{
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
  }>
  transactions: Array<{
    id: string
    kind: "income" | "expense" | "transfer" | "adjustment"
    amount: number
    happenedAt: string
    createdAt: string
    description: string | null
    note: string | null
    accountId: string | null
    accountName: string | null
    categoryId: string | null
    fromAccountId: string | null
    fromAccountName: string | null
    toAccountId: string | null
    toAccountName: string | null
    incomeSourceId: string | null
    goalId: string | null
    goalName: string | null
    debtorId: string | null
    debtorName: string | null
    createdByUserId: string | null
    createdByName: string | null
  }>
}

const unauthorized = async (reply: FastifyReply, reason: string) => {
  await reply.status(401).send({ error: "Unauthorized", reason })
  return null
}

async function resolveUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const authHeader = request.headers.authorization
  let userId: string | null = null
  let reason: string | null = null

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length)
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string }
      userId = payload.sub
    } catch {
      reason = "invalid_jwt"
      return unauthorized(reply, reason)
    }
  }

  if (!userId) {
    const initDataRaw = request.headers[TELEGRAM_INITDATA_HEADER] as string | undefined
    const hasInitData = Boolean(initDataRaw && initDataRaw.length > 0)
    const authDate = (() => {
      const params = initDataRaw ? new URLSearchParams(initDataRaw) : null
      const ad = params?.get("auth_date")
      return ad ? Number(ad) : undefined
    })()

    if (!env.BOT_TOKEN) {
      reason = "missing_bot_token"
      request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
      return unauthorized(reply, reason)
    }

    const auth = await validateInitData(initDataRaw)
    if (!auth) {
      reason = hasInitData ? "invalid_initdata" : "missing_initdata"
      request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
      return unauthorized(reply, reason)
    }
    userId = auth.userId
  }

  return userId
}

const mapTx = (tx: {
  id: string
  kind: TransactionKind
  amount: Prisma.Decimal
  happened_at: Date
  created_at: Date
  note: string | null
  account_id: string | null
  category_id: string | null
  from_account_id: string | null
  to_account_id: string | null
  income_source_id: string | null
  goal_id: string | null
  debtor_id: string | null
  created_by_user_id: string | null
  account: { id: string; name: string } | null
  from_account: { id: string; name: string } | null
  to_account: { id: string; name: string } | null
  goal: { id: string; name: string } | null
  debtor: { id: string; name: string } | null
  created_by: { id: string; first_name: string | null; username: string | null } | null
}) => ({
  description: tx.note ?? null,
  id: tx.id,
  kind: tx.kind,
  amount: Number(tx.amount),
  happenedAt: tx.happened_at.toISOString(),
  createdAt: tx.created_at.toISOString(),
  note: tx.note ?? null,
  accountId: tx.account_id ?? null,
  accountName: tx.account?.name ?? tx.from_account?.name ?? null,
  categoryId: tx.category_id ?? null,
  fromAccountId: tx.from_account_id ?? null,
  fromAccountName: tx.from_account?.name ?? null,
  toAccountId: tx.to_account_id ?? null,
  toAccountName: tx.to_account?.name ?? null,
  incomeSourceId: tx.income_source_id ?? null,
  goalId: tx.goal_id ?? null,
  goalName: tx.goal?.name ?? null,
  debtorId: tx.debtor_id ?? null,
  debtorName: tx.debtor?.name ?? null,
  createdByUserId: tx.created_by_user_id ?? null,
  createdByName: tx.created_by?.first_name?.trim() || (tx.created_by?.username ? `@${tx.created_by.username}` : null),
})

export async function bootstrapRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/bootstrap", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }
    const workspaceId = user.active_workspace_id

    const defaultsNormalizationReport = await seedWorkspaceDefaults(prisma, workspaceId)
    if (hasDefaultsNormalizationChanges(defaultsNormalizationReport)) {
      request.log.info(
        { workspaceId, defaultsNormalizationReport },
        "Workspace defaults normalized",
      )
    }
    if (hasDefaultsNormalizationConflicts(defaultsNormalizationReport)) {
      request.log.warn(
        { workspaceId, defaultsNormalizationReport },
        "Workspace defaults normalization skipped conflicting legacy records",
      )
    }

    const accounts = await prisma.accounts.findMany({
      where: { workspace_id: workspaceId, archived_at: null, is_archived: false },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        display_name: true,
        type: true,
        currency: true,
        balance: true,
        color: true,
        icon: true,
        icon_emoji: true,
      },
    })

    const categories = await prisma.categories.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: { id: true, name: true, kind: true, icon: true, budget: true, is_archived: true },
    })

    const incomeSources = await prisma.income_sources.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: { id: true, name: true, icon: true, is_archived: true },
    })

    const goals = await prisma.goals.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
    })

    const debtors = await prisma.debtors.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ direction: "asc" }, { sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
    })

    const transactions = await prisma.transactions.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { happened_at: "desc" },
      include: {
        created_by: { select: { id: true, first_name: true, username: true } },
        account: { select: { id: true, name: true } },
        from_account: { select: { id: true, name: true } },
        to_account: { select: { id: true, name: true } },
        goal: { select: { id: true, name: true } },
        debtor: { select: { id: true, name: true } },
      },
    })

    const payload: BootstrapResponse = {
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        displayName: account.display_name,
        type: account.type,
        currency: account.currency,
        balance: Number(account.balance),
        color: account.color,
        icon: account.icon ?? null,
        iconEmoji: account.icon_emoji ?? null,
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
        icon: category.icon,
        budget: category.budget ? Number(category.budget) : null,
        isArchived: category.is_archived,
      })),
      incomeSources: incomeSources.map((source) => ({
        id: source.id,
        name: source.name,
        icon: source.icon ?? null,
        isArchived: source.is_archived,
      })),
      goals: goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        icon: goal.icon,
        targetAmount: goal.target_amount.toString(),
        currentAmount: goal.current_amount.toString(),
        status: goal.status,
        createdAt: goal.created_at.toISOString(),
        completedAt: goal.completed_at ? goal.completed_at.toISOString() : null,
      })),
      debtors: debtors.map((debtor) => ({
        id: debtor.id,
        name: debtor.name,
        icon: debtor.icon,
        issuedAt: debtor.issued_at.toISOString(),
        principalAmount: debtor.principal_amount.toString(),
        dueAt: debtor.due_at ? debtor.due_at.toISOString() : null,
        payoffAmount: debtor.payoff_amount ? debtor.payoff_amount.toString() : null,
        status: debtor.status,
        direction: debtor.direction === "PAYABLE" ? "payable" : "receivable",
        createdAt: debtor.created_at.toISOString(),
        updatedAt: debtor.updated_at.toISOString(),
      })),
      transactions: transactions.map(mapTx),
    }

    return reply.send(payload)
  })
}
