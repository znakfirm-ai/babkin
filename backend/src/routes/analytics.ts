import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

const REPORT_GROUP_GOALS_ID = "__report_goals__"
const REPORT_GROUP_DEBTS_ID = "__report_debts__"
const REPORT_GROUP_UNCATEGORIZED_ID = "uncategorized"

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

export async function analyticsRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/analytics/summary", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const { from, to } = request.query as { from?: string; to?: string }
    if (!from || !to) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_dates" })
    }

    const fromDate = new Date(`${from}T00:00:00.000Z`)
    const toDateStart = new Date(`${to}T00:00:00.000Z`)
    const toExclusive = new Date(toDateStart.getTime() + 24 * 60 * 60 * 1000)

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDateStart.getTime())) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_dates" })
    }
    if (fromDate > toDateStart) {
      return reply.status(400).send({ error: "Bad Request", reason: "from_after_to" })
    }

    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.transactions.aggregate({
        _sum: { amount: true },
        where: {
          workspace_id: user.active_workspace_id,
          kind: "income",
          happened_at: { gte: fromDate, lt: toExclusive },
        },
      }),
      prisma.transactions.aggregate({
        _sum: { amount: true },
        where: {
          workspace_id: user.active_workspace_id,
          kind: "expense",
          happened_at: { gte: fromDate, lt: toExclusive },
        },
      }),
    ])

    const incomeSum = incomeAgg._sum.amount ?? new Prisma.Decimal(0)
    const expenseSum = expenseAgg._sum.amount ?? new Prisma.Decimal(0)

    const net = incomeSum.minus(expenseSum)

    return reply.send({
      totalIncome: incomeSum.toFixed(2),
      totalExpense: expenseSum.toFixed(2),
      net: net.toFixed(2),
    })
  })

  fastify.get("/analytics/expenses-by-category", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const { from, to, top } = request.query as { from?: string; to?: string; top?: string }
    if (!from || !to) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_dates" })
    }

    const fromDate = new Date(`${from}T00:00:00.000Z`)
    const toDateStart = new Date(`${to}T00:00:00.000Z`)
    const toExclusive = new Date(toDateStart.getTime() + 24 * 60 * 60 * 1000)

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDateStart.getTime())) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_dates" })
    }
    if (fromDate > toDateStart) {
      return reply.status(400).send({ error: "Bad Request", reason: "from_after_to" })
    }

    const topN = Math.min(Math.max(Number(top) || 4, 1), 10)

    const grouped = await prisma.transactions.groupBy({
      by: ["category_id", "goal_id", "debtor_id"],
      where: {
        workspace_id: user.active_workspace_id,
        kind: "expense",
        happened_at: { gte: fromDate, lt: toExclusive },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    })

    const aggregatedByGroup = new Map<string, Prisma.Decimal>()
    grouped.forEach((group) => {
      const amount = group._sum.amount ?? new Prisma.Decimal(0)
      if (amount.lte(0)) return
      const groupId = group.goal_id
        ? REPORT_GROUP_GOALS_ID
        : group.debtor_id
        ? REPORT_GROUP_DEBTS_ID
        : group.category_id ?? REPORT_GROUP_UNCATEGORIZED_ID
      const prev = aggregatedByGroup.get(groupId) ?? new Prisma.Decimal(0)
      aggregatedByGroup.set(groupId, prev.plus(amount))
    })

    const merged = Array.from(aggregatedByGroup.entries()).sort((a, b) => b[1].minus(a[1]).toNumber())
    const totalExpenseDec = merged.reduce((acc, [, amount]) => acc.plus(amount), new Prisma.Decimal(0))
    const topGroups = merged.slice(0, topN)
    const otherGroups = merged.slice(topN)

    const categoryIds = topGroups
      .map(([groupId]) => groupId)
      .filter(
        (groupId): groupId is string =>
          groupId !== REPORT_GROUP_GOALS_ID && groupId !== REPORT_GROUP_DEBTS_ID && groupId !== REPORT_GROUP_UNCATEGORIZED_ID
      )

    const names = categoryIds.length
      ? await prisma.categories.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : []
    const nameMap = new Map(names.map((c) => [c.id, c.name]))

    const topPayload = topGroups.map(([groupId, amount]) => ({
      categoryId: groupId,
      name:
        groupId === REPORT_GROUP_GOALS_ID
          ? "Цели"
          : groupId === REPORT_GROUP_DEBTS_ID
          ? "Долги / Кредиты"
          : nameMap.get(groupId) ?? "Без категории",
      total: amount.toFixed(2),
    }))

    const otherTotalDec = otherGroups.reduce((acc, [, amount]) => acc.plus(amount), new Prisma.Decimal(0))

    return reply.send({
      top: topPayload,
      otherTotal: otherTotalDec.toFixed(2),
      totalExpense: totalExpenseDec.toFixed(2),
    })
  })
}
