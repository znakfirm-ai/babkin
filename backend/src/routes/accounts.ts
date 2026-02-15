import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

type AccountResponse = {
  id: string
  name: string
  type: string
  currency: string
  balance: number
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
      where: { workspace_id: user.active_workspace_id },
    })

    const payload: { accounts: AccountResponse[] } = {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance: Number(a.balance),
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
      },
    })

    const account: AccountResponse = {
      id: created.id,
      name: created.name,
      type: created.type,
      currency: created.currency,
      balance: Number(created.balance),
    }

    return reply.send({ account })
  })
}
