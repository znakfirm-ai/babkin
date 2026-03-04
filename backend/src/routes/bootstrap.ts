import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma, TransactionKind } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

const DEFAULT_CATEGORIES = [
  { name: "Еда", kind: "expense" as const },
  { name: "Транспорт", kind: "expense" as const },
  { name: "Дом", kind: "expense" as const },
  { name: "Развлечения", kind: "expense" as const },
  { name: "Здоровье", kind: "expense" as const },
  { name: "Покупки", kind: "expense" as const },
  { name: "Зарплата", kind: "income" as const },
  { name: "Бизнес", kind: "income" as const },
  { name: "Подарки", kind: "income" as const },
]

const DEFAULT_INCOME_SOURCES = [{ name: "Зарплата" }, { name: "Бизнес" }]

type BootstrapResponse = {
  accounts: Array<{
    id: string
    name: string
    type: string
    currency: string
    balance: number
    color: string | null
    icon: string | null
  }>
  categories: Array<{
    id: string
    name: string
    kind: "income" | "expense"
    icon: string | null
    budget: number | null
  }>
  incomeSources: Array<{
    id: string
    name: string
    icon: string | null
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
  note: string | null
  account_id: string | null
  category_id: string | null
  from_account_id: string | null
  to_account_id: string | null
  income_source_id: string | null
  goal_id: string | null
  debtor_id: string | null
  account: { id: string; name: string } | null
  from_account: { id: string; name: string } | null
  to_account: { id: string; name: string } | null
  goal: { id: string; name: string } | null
  debtor: { id: string; name: string } | null
}) => ({
  id: tx.id,
  kind: tx.kind,
  amount: Number(tx.amount),
  happenedAt: tx.happened_at.toISOString(),
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

    const accounts = await prisma.accounts.findMany({
      where: { workspace_id: workspaceId, archived_at: null, is_archived: false },
      select: { id: true, name: true, type: true, currency: true, balance: true, color: true, icon: true },
    })

    const existingCategories = await prisma.categories.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true, name: true, kind: true, icon: true, budget: true },
    })
    if (existingCategories.length === 0) {
      await prisma.categories.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({
          workspace_id: workspaceId,
          name: c.name,
          kind: c.kind,
          icon: null,
        })),
        skipDuplicates: true,
      })
    }
    const categories =
      existingCategories.length > 0
        ? existingCategories
        : await prisma.categories.findMany({
            where: { workspace_id: workspaceId },
            select: { id: true, name: true, kind: true, icon: true, budget: true },
          })

    const existingIncomeSources = await prisma.income_sources.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true, name: true, icon: true },
    })
    if (existingIncomeSources.length === 0) {
      await prisma.income_sources.createMany({
        data: DEFAULT_INCOME_SOURCES.map((source) => ({
          workspace_id: workspaceId,
          name: source.name,
          icon: null,
        })),
        skipDuplicates: true,
      })
    }
    const incomeSources =
      existingIncomeSources.length > 0
        ? existingIncomeSources
        : await prisma.income_sources.findMany({
            where: { workspace_id: workspaceId },
            select: { id: true, name: true, icon: true },
          })

    const goals = await prisma.goals.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: "desc" },
    })

    const debtors = await prisma.debtors.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: "desc" },
    })

    const transactions = await prisma.transactions.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { happened_at: "desc" },
      include: {
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
        type: account.type,
        currency: account.currency,
        balance: Number(account.balance),
        color: account.color,
        icon: account.icon ?? null,
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
        icon: category.icon,
        budget: category.budget ? Number(category.budget) : null,
      })),
      incomeSources: incomeSources.map((source) => ({
        id: source.id,
        name: source.name,
        icon: source.icon ?? null,
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
