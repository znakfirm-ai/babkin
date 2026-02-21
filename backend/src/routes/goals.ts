import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

type GoalResponse = {
  id: string
  name: string
  icon: string | null
  targetAmount: string
  currentAmount: string
  status: "active" | "completed"
  createdAt: string
  completedAt: string | null
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

const mapGoal = (g: {
  id: string
  name: string
  icon: string | null
  target_amount: Prisma.Decimal
  current_amount: Prisma.Decimal
  status: "active" | "completed"
  created_at: Date
  completed_at: Date | null
}): GoalResponse => ({
  id: g.id,
  name: g.name,
  icon: g.icon,
  targetAmount: g.target_amount.toString(),
  currentAmount: g.current_amount.toString(),
  status: g.status,
  createdAt: g.created_at.toISOString(),
  completedAt: g.completed_at ? g.completed_at.toISOString() : null,
})

export async function goalsRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/goals", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const status = (request.query as { status?: string }).status
    const goals = await prisma.goals.findMany({
      where: {
        workspace_id: user.active_workspace_id,
        ...(status === "active" || status === "completed" ? { status } : {}),
      },
      orderBy: { created_at: "desc" },
    })

    return reply.send({ goals: goals.map(mapGoal) })
  })

  fastify.post("/goals", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const body = request.body as { name?: string; icon?: string | null; targetAmount?: string | number }
    const name = body?.name?.trim()
    if (!name) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" })
    }

    const parsedAmount = typeof body.targetAmount === "string" ? Number(body.targetAmount) : body.targetAmount
    if (parsedAmount === undefined || parsedAmount === null || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_target_amount" })
    }

    const created = await prisma.goals.create({
      data: {
        workspace_id: user.active_workspace_id,
        name,
        icon: body.icon?.trim() || null,
        target_amount: new Prisma.Decimal(parsedAmount),
      },
    })

    return reply.send({ goal: mapGoal(created) })
  })

  fastify.patch("/goals/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const goalId = (request.params as { id?: string }).id
    if (!goalId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_id" })
    }

    const body = request.body as { name?: string; icon?: string | null; targetAmount?: number; status?: "active" | "completed" }

    const existing = await prisma.goals.findFirst({ where: { id: goalId, workspace_id: user.active_workspace_id } })
    if (!existing) {
      return reply.status(404).send({ error: "Not Found" })
    }

    const data: Prisma.goalsUpdateInput = {}
    if (body.name !== undefined) {
      const nm = body.name.trim()
      if (!nm) return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" })
      data.name = nm
    }
    if (body.icon !== undefined) {
      data.icon = body.icon?.trim() || null
    }
    if (body.targetAmount !== undefined) {
      if (!Number.isFinite(body.targetAmount) || body.targetAmount <= 0) {
        return reply.status(400).send({ error: "Bad Request", reason: "invalid_target_amount" })
      }
      data.target_amount = new Prisma.Decimal(body.targetAmount)
    }
    if (body.status && (body.status === "active" || body.status === "completed")) {
      data.status = body.status
      data.completed_at = body.status === "completed" ? new Date() : null
    }

    const updated = await prisma.goals.update({
      where: { id: goalId },
      data,
    })

    return reply.send({ goal: mapGoal(updated) })
  })

  fastify.post("/goals/:id/contribute", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const goalId = (request.params as { id?: string }).id
    if (!goalId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_goal_id" })
    }

    const body = request.body as { accountId?: string; amount?: number; date?: string; note?: string | null }
    if (!body.accountId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_account_id" })
    }
    const amt = body.amount
    if (amt === undefined || amt === null || !Number.isFinite(amt) || amt <= 0) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_amount" })
    }
    const happenedAt = body.date ? new Date(body.date) : new Date()
    if (Number.isNaN(happenedAt.getTime())) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_date" })
    }

    const workspaceId = user.active_workspace_id

    const [goal, account] = await Promise.all([
      prisma.goals.findFirst({ where: { id: goalId, workspace_id: workspaceId } }),
      prisma.accounts.findFirst({ where: { id: body.accountId, workspace_id: workspaceId, is_archived: false, archived_at: null } }),
    ])
    if (!goal) {
      return reply.status(404).send({ error: "Not Found", reason: "goal_not_found" })
    }
    if (!account) {
      return reply.status(404).send({ error: "Not Found", reason: "account_not_found" })
    }

    const amountDec = new Prisma.Decimal(amt)

    const updatedGoal = await prisma.$transaction(async (tx) => {
      await tx.accounts.update({
        where: { id: account.id },
        data: { balance: { decrement: amountDec } },
      })

      const g = await tx.goals.update({
        where: { id: goal.id },
        data: { current_amount: { increment: amountDec } },
      })

      await tx.transactions.create({
        data: {
          workspace_id: workspaceId,
          kind: "transfer",
          amount: amountDec,
          happened_at: happenedAt,
          account_id: account.id,
          to_account_id: null,
          category_id: null,
          income_source_id: null,
          goal_id: goal.id,
          note: body.note?.trim() || null,
        },
      })

      return g
    })

    return reply.send({ goal: mapGoal(updatedGoal) })
  })
}
