import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma, TransactionKind } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

type TransactionResponse = {
  id: string
  kind: "income" | "expense" | "transfer"
  amount: number
  happenedAt: string
  note: string | null
  accountId: string | null
  categoryId: string | null
  fromAccountId: string | null
  toAccountId: string | null
}

async function resolveUserId(request: any, reply: any): Promise<string | null> {
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

function mapTx(tx: any): TransactionResponse {
  return {
    id: tx.id,
    kind: tx.kind,
    amount: Number(tx.amount),
    happenedAt: tx.happened_at.toISOString(),
    note: tx.note ?? null,
    accountId: tx.account_id ?? null,
    categoryId: tx.category_id ?? null,
    fromAccountId: tx.from_account_id ?? null,
    toAccountId: tx.to_account_id ?? null,
  }
}

export async function transactionsRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/transactions", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const txs = await prisma.transactions.findMany({
      where: { workspace_id: user.active_workspace_id },
      orderBy: { happened_at: "desc" },
    })

    const payload = { transactions: txs.map(mapTx) }
    return reply.send(payload)
  })

  fastify.post("/transactions", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const body = request.body as {
      kind?: "income" | "expense" | "transfer"
      accountId?: string
      categoryId?: string | null
      fromAccountId?: string
      toAccountId?: string
      amount?: number
      happenedAt?: string
      note?: string
    }

    if (!body?.kind || (body.kind !== "income" && body.kind !== "expense" && body.kind !== "transfer")) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_kind" })
    }

    const kind: TransactionKind = body.kind

    if (!body.amount || !Number.isFinite(body.amount) || body.amount <= 0) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_amount" })
    }

    const amount = new Prisma.Decimal(body.amount)
    const happenedAt = body.happenedAt ? new Date(body.happenedAt) : new Date()
    if (Number.isNaN(happenedAt.getTime())) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_date" })
    }

    const workspaceId = user.active_workspace_id

    if (kind === "income" || kind === "expense") {
      if (!body.accountId) {
        return reply.status(400).send({ error: "Bad Request", reason: "missing_account" })
      }

      const account = await prisma.accounts.findFirst({ where: { id: body.accountId, workspace_id: workspaceId } })
      if (!account) {
        return reply.status(403).send({ error: "Forbidden", reason: "account_not_in_workspace" })
      }

      if (body.categoryId) {
        const cat = await prisma.categories.findFirst({ where: { id: body.categoryId, workspace_id: workspaceId } })
        if (!cat) {
          return reply.status(403).send({ error: "Forbidden", reason: "category_not_in_workspace" })
        }
      }

      const tx = await prisma.$transaction(async (trx) => {
        const delta = kind === "income" ? amount : amount.neg()

        await trx.accounts.update({
          where: { id: account.id },
          data: { balance: { increment: delta } },
        })

        const created = await trx.transactions.create({
          data: {
            workspace_id: workspaceId,
            kind,
            amount,
            happened_at: happenedAt,
            note: body.note ?? null,
            account_id: account.id,
            category_id: body.categoryId ?? null,
          },
        })

        return created
      })

      return reply.send({ transaction: mapTx(tx) })
    }

    // transfer
    if (!body.fromAccountId || !body.toAccountId || body.fromAccountId === body.toAccountId) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_transfer_accounts" })
    }

    const [from, to] = await Promise.all([
      prisma.accounts.findFirst({ where: { id: body.fromAccountId, workspace_id: workspaceId } }),
      prisma.accounts.findFirst({ where: { id: body.toAccountId, workspace_id: workspaceId } }),
    ])

    if (!from || !to) {
      return reply.status(403).send({ error: "Forbidden", reason: "account_not_in_workspace" })
    }

    const tx = await prisma.$transaction(async (trx) => {
      await trx.accounts.update({
        where: { id: from.id },
        data: { balance: { decrement: amount } },
      })

      await trx.accounts.update({
        where: { id: to.id },
        data: { balance: { increment: amount } },
      })

      const created = await trx.transactions.create({
        data: {
          workspace_id: workspaceId,
          kind,
          amount,
          happened_at: happenedAt,
          note: body.note ?? null,
          from_account_id: from.id,
          to_account_id: to.id,
        },
      })

      return created
    })

    return reply.send({ transaction: mapTx(tx) })
  })
}
