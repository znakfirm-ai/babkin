import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

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

    const fromDate = new Date(from)
    const toDate = new Date(to)
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_dates" })
    }
    if (fromDate > toDate) {
      return reply.status(400).send({ error: "Bad Request", reason: "from_after_to" })
    }

    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.transactions.aggregate({
        _sum: { amount: true },
        where: {
          workspace_id: user.active_workspace_id,
          kind: "income",
          happened_at: { gte: fromDate, lte: toDate },
        },
      }),
      prisma.transactions.aggregate({
        _sum: { amount: true },
        where: {
          workspace_id: user.active_workspace_id,
          kind: "expense",
          happened_at: { gte: fromDate, lte: toDate },
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
}
