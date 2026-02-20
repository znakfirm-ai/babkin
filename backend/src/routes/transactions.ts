import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma, TransactionKind } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

type TransactionResponse = {
  id: string
  kind: "income" | "expense" | "transfer" | "adjustment"
  amount: number
  happenedAt: string
  note: string | null
  accountId: string | null
  accountName?: string | null
  categoryId: string | null
  fromAccountId: string | null
  fromAccountName?: string | null
  toAccountId: string | null
  toAccountName?: string | null
  incomeSourceId: string | null
  goalId: string | null
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
    accountName: tx.account?.name ?? null,
    categoryId: tx.category_id ?? null,
    fromAccountId: tx.from_account_id ?? null,
    fromAccountName: tx.from_account?.name ?? null,
    toAccountId: tx.to_account_id ?? null,
    toAccountName: tx.to_account?.name ?? null,
    incomeSourceId: tx.income_source_id ?? null,
    goalId: tx.goal_id ?? null,
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

    const goalId = (request.query as { goalId?: string }).goalId

    const txs = await prisma.transactions.findMany({
      where: {
        workspace_id: user.active_workspace_id,
        ...(goalId ? { goal_id: goalId } : {}),
      },
      orderBy: { happened_at: "desc" },
      include: {
        account: { select: { id: true, name: true } },
        from_account: { select: { id: true, name: true } },
        to_account: { select: { id: true, name: true } },
      },
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
      incomeSourceId?: string
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

      if (body.incomeSourceId && kind !== "income") {
        return reply.status(400).send({ error: "Bad Request", reason: "income_source_only_for_income" })
      }

      let incomeSourceId: string | null = null
      if (kind === "income") {
        if (body.incomeSourceId) {
          const src = await prisma.income_sources.findFirst({
            where: { id: body.incomeSourceId, workspace_id: workspaceId },
          })
          if (!src) {
            return reply.status(403).send({ error: "Forbidden", reason: "income_source_not_in_workspace" })
          }
          incomeSourceId = src.id
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
            income_source_id: incomeSourceId,
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

  fastify.delete("/transactions/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const txId = (request.params as { id: string }).id
    const existing = await prisma.transactions.findFirst({
      where: { id: txId, workspace_id: user.active_workspace_id },
    })

    if (!existing) {
      return reply.status(404).send({ error: "Not Found" })
    }

    const amount = existing.amount
    const kind = existing.kind

    await prisma.$transaction(async (trx) => {
      if (kind === "income" || kind === "expense") {
        if (!existing.account_id) {
          throw new Error("Transaction missing account_id")
        }
        const delta = kind === "income" ? amount.neg() : amount
        await trx.accounts.update({
          where: { id: existing.account_id },
          data: { balance: { increment: delta } },
        })
      } else if (kind === "transfer") {
        if (!existing.from_account_id || !existing.to_account_id) {
          throw new Error("Transaction missing transfer accounts")
        }
        await trx.accounts.update({
          where: { id: existing.from_account_id },
          data: { balance: { increment: amount } },
        })
        await trx.accounts.update({
          where: { id: existing.to_account_id },
          data: { balance: { decrement: amount } },
        })
      }

      await trx.transactions.delete({ where: { id: existing.id } })
    })

    return reply.status(204).send()
  })
}
