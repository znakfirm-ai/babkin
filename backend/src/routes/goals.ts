import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"
import { hasEntityNameConflict, isEntityNameTooLong } from "../utils/entityNameValidation"

const GOAL_NAME_MAX_LENGTH = 20

type GoalResponse = {
  id: string
  name: string
  sortOrder: number
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
  sort_order: number
  icon: string | null
  target_amount: Prisma.Decimal
  current_amount: Prisma.Decimal
  status: "active" | "completed"
  created_at: Date
  completed_at: Date | null
}): GoalResponse => ({
  id: g.id,
  name: g.name,
  sortOrder: g.sort_order,
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
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
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
    if (isEntityNameTooLong(name, GOAL_NAME_MAX_LENGTH)) {
      return reply.status(400).send({ error: "Bad Request", code: "GOAL_NAME_TOO_LONG" })
    }

    const sameWorkspaceGoals = await prisma.goals.findMany({
      where: { workspace_id: user.active_workspace_id, status: "active" },
      select: { id: true, name: true },
    })
    if (hasEntityNameConflict(sameWorkspaceGoals, name)) {
      return reply.status(409).send({ error: "Conflict", code: "GOAL_NAME_EXISTS" })
    }

    const parsedAmount = typeof body.targetAmount === "string" ? Number(body.targetAmount) : body.targetAmount
    if (parsedAmount === undefined || parsedAmount === null || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_target_amount" })
    }

    const created = await prisma.goals.create({
      data: {
        workspace_id: user.active_workspace_id,
        name,
        sort_order: ((await prisma.goals.aggregate({
          where: { workspace_id: user.active_workspace_id },
          _max: { sort_order: true },
        }))._max.sort_order ?? -1) + 1,
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
    const targetStatus = body.status === "active" || body.status === "completed" ? body.status : existing.status
    if (body.name !== undefined) {
      const nm = body.name.trim()
      if (!nm) return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" })
      if (isEntityNameTooLong(nm, GOAL_NAME_MAX_LENGTH)) {
        return reply.status(400).send({ error: "Bad Request", code: "GOAL_NAME_TOO_LONG" })
      }
      if (targetStatus === "active") {
        const sameWorkspaceGoals = await prisma.goals.findMany({
          where: { workspace_id: user.active_workspace_id, status: "active" },
          select: { id: true, name: true },
        })
        if (hasEntityNameConflict(sameWorkspaceGoals, nm, goalId)) {
          return reply.status(409).send({ error: "Conflict", code: "GOAL_NAME_EXISTS" })
        }
      }
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
    if (body.name === undefined && targetStatus === "active") {
      const sameWorkspaceGoals = await prisma.goals.findMany({
        where: { workspace_id: user.active_workspace_id, status: "active" },
        select: { id: true, name: true },
      })
      if (hasEntityNameConflict(sameWorkspaceGoals, existing.name, goalId)) {
        return reply.status(409).send({ error: "Conflict", code: "GOAL_NAME_EXISTS" })
      }
    }

    const updated = await prisma.goals.update({
      where: { id: goalId },
      data,
    })

    return reply.send({ goal: mapGoal(updated) })
  })

  fastify.post("/goals/:id/complete", async (request, reply) => {
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

    const body = (request.body as { destinationAccountId?: string } | undefined) ?? {}

    const workspaceId = user.active_workspace_id
    const goal = await prisma.goals.findFirst({ where: { id: goalId, workspace_id: workspaceId } })
    if (!goal) {
      return reply.status(404).send({ error: "Not Found", reason: "goal_not_found" })
    }

    const goalTransactions = await prisma.transactions.findMany({
      where: {
        workspace_id: workspaceId,
        goal_id: goal.id,
        kind: "transfer",
      },
      select: {
        amount: true,
        from_account_id: true,
        to_account_id: true,
      },
      orderBy: {
        happened_at: "asc",
      },
    })
    const activeAccountRows = await prisma.accounts.findMany({
      where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
      select: { id: true },
    })
    const activeAccountIds = new Set(activeAccountRows.map((account) => account.id))

    const returnByAccount = new Map<string, Prisma.Decimal>()
    const trackReturn = (accountId: string, delta: Prisma.Decimal) => {
      const previous = returnByAccount.get(accountId) ?? new Prisma.Decimal(0)
      returnByAccount.set(accountId, previous.plus(delta))
    }

    goalTransactions.forEach((transaction) => {
      if (transaction.from_account_id && !transaction.to_account_id) {
        if (!activeAccountIds.has(transaction.from_account_id)) return
        trackReturn(transaction.from_account_id, transaction.amount)
        return
      }
      if (!transaction.from_account_id && transaction.to_account_id) {
        if (!activeAccountIds.has(transaction.to_account_id)) return
        trackReturn(transaction.to_account_id, transaction.amount.neg())
      }
    })

    if (body.destinationAccountId) {
      const fallbackAccount = await prisma.accounts.findFirst({
        where: { id: body.destinationAccountId, workspace_id: workspaceId, is_archived: false, archived_at: null },
      })
      if (fallbackAccount && returnByAccount.size === 0 && goal.current_amount.greaterThan(0)) {
        returnByAccount.set(fallbackAccount.id, new Prisma.Decimal(goal.current_amount))
      }
    }

    const updatedGoal = await prisma.$transaction(async (tx) => {
      for (const [accountId, amountDec] of returnByAccount.entries()) {
        if (!amountDec.greaterThan(0)) continue
        await tx.accounts.updateMany({
          where: { id: accountId, workspace_id: workspaceId, is_archived: false, archived_at: null },
          data: { balance: { increment: amountDec } },
        })

        await tx.transactions.create({
          data: {
            workspace_id: workspaceId,
            created_by_user_id: userId,
            kind: "transfer",
            amount: amountDec,
            happened_at: new Date(),
            account_id: null,
            from_account_id: null,
            to_account_id: accountId,
            category_id: null,
            income_source_id: null,
            goal_id: goal.id,
            note: null,
          },
        })
      }

      return tx.goals.update({
        where: { id: goal.id },
        data: {
          status: "completed",
          completed_at: new Date(),
        },
      })
    })

    return reply.send({ goal: mapGoal(updatedGoal) })
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

    const body = request.body as {
      accountId?: string
      amount?: number
      date?: string
      description?: string | null
      note?: string | null
    }
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

    const goal = await prisma.goals.findFirst({ where: { id: goalId, workspace_id: workspaceId } })
    const account = await prisma.accounts.findFirst({
      where: { id: body.accountId, workspace_id: workspaceId, is_archived: false, archived_at: null },
    })
    if (!goal) {
      return reply.status(404).send({ error: "Not Found", reason: "goal_not_found" })
    }
    if (!account) {
      return reply.status(404).send({ error: "Not Found", reason: "account_not_found" })
    }

    const amountDec = new Prisma.Decimal(amt)
    const description = body.description?.trim() || body.note?.trim() || null

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
          created_by_user_id: userId,
          kind: "transfer",
          amount: amountDec,
          happened_at: happenedAt,
          account_id: null,
          from_account_id: account.id,
          to_account_id: null,
          category_id: null,
          income_source_id: null,
          goal_id: goal.id,
          note: description,
        },
      })

      return g
    })

    return reply.send({ goal: mapGoal(updatedGoal) })
  })
}
