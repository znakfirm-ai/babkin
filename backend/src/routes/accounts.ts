import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

type AccountResponse = {
  id: string
  name: string
  type: string
  currency: string
  balance: number
  color: string | null
}

export async function accountsRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  const resolveUserId = async (request: any, reply: any) => {
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
        await reply.status(401).send({ error: "Unauthorized", reason })
        return null
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
        await reply.status(401).send({ error: "Unauthorized", reason })
        return null
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        await reply.status(401).send({ error: "Unauthorized", reason })
        return null
      }
      userId = auth.userId
    }

    return userId
  }

  fastify.get("/accounts", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { active_workspace_id: true },
    })

    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const accounts = await prisma.accounts.findMany({
      where: { workspace_id: user.active_workspace_id, archived_at: null, is_archived: false },
      select: { id: true, name: true, type: true, currency: true, balance: true, color: true },
    })

    const payload: { accounts: AccountResponse[] } = {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance: Number(a.balance),
        color: a.color,
      })),
    }

    return reply.send(payload)
  })

  fastify.post("/accounts", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { active_workspace_id: true },
    })

    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const body = request.body as {
      name?: string
      type?: string
      currency?: string
      balance?: number
      color?: string | null
    }

    if (!body?.name || !body.type || !body.currency) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_fields" })
    }

    const created = await prisma.accounts.create({
      data: {
        workspace_id: user.active_workspace_id,
        name: body.name,
        type: body.type,
        currency: body.currency,
        balance: body.balance ?? 0,
        color: body.color ?? null,
      },
    })

    const account: AccountResponse = {
      id: created.id,
      name: created.name,
      type: created.type,
      currency: created.currency,
      balance: Number(created.balance),
      color: created.color,
    }

    return reply.send({ account })
  })

  fastify.patch("/accounts/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { active_workspace_id: true },
    })

    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const accountId = (request.params as { id?: string })?.id
    if (!accountId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_account_id" })
    }

    const body = request.body as { name?: string; type?: string; currency?: string; color?: string | null }

    const updated = await prisma.accounts.updateMany({
      where: { id: accountId, workspace_id: user.active_workspace_id },
      data: {
        name: body?.name ?? undefined,
        type: body?.type ?? undefined,
        currency: body?.currency ?? undefined,
        color: body?.color !== undefined ? body.color : undefined,
      },
    })

    if (updated.count === 0) {
      return reply.status(404).send({ error: "Not Found" })
    }

    const account = await prisma.accounts.findUnique({
      where: { id: accountId },
      select: { id: true, name: true, type: true, currency: true, balance: true, color: true },
    })

    if (!account) return reply.status(404).send({ error: "Not Found" })

    const payload: { account: AccountResponse } = {
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        balance: Number(account.balance),
        color: account.color,
      },
    }

    return reply.send(payload)
  })

  fastify.delete("/accounts/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { active_workspace_id: true },
    })

    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const accountId = (request.params as { id?: string })?.id
    if (!accountId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_account_id" })
    }

    const updated = await prisma.accounts.updateMany({
      where: { id: accountId, workspace_id: user.active_workspace_id },
      data: { is_archived: true, archived_at: new Date() },
    })

    if (updated.count === 0) {
      return reply.status(404).send({ error: "Not Found" })
    }

    return reply.status(204).send()
  })

  fastify.post("/accounts/:id/adjust-balance", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { active_workspace_id: true },
    })

    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const accountId = (request.params as { id?: string })?.id
    if (!accountId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_account_id" })
    }

    const body = request.body as { targetBalance?: number; note?: string; date?: string }
    if (typeof body?.targetBalance !== "number" || Number.isNaN(body.targetBalance)) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_target_balance" })
    }

    const workspaceId = user.active_workspace_id as string

    const account = await prisma.accounts.findFirst({
      where: { id: accountId, workspace_id: user.active_workspace_id, archived_at: null },
      select: { balance: true },
    })

    if (!account) {
      return reply.status(404).send({ error: "Not Found" })
    }

    const target = new Prisma.Decimal(body.targetBalance)
    const current = new Prisma.Decimal(account.balance)
    const diff = target.minus(current)
    if (diff.equals(0)) {
      return reply.send({ ok: true })
    }

    const absDiff = diff.abs()
    const happenedAt = body.date ? new Date(body.date) : new Date()
    if (Number.isNaN(happenedAt.getTime())) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_date" })
    }

    await prisma.$transaction(async (trx) => {
      await trx.accounts.update({
        where: { id: accountId },
        data: { balance: { increment: diff } },
      })

      await trx.transactions.create({
        data: {
          workspace_id: workspaceId,
          kind: "adjustment",
          amount: absDiff,
          happened_at: happenedAt,
          account_id: accountId,
          note: body.note ?? null,
        },
      })
    })

    return reply.send({ ok: true })
  })
}
