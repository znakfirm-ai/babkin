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
  goalName?: string | null
  debtorId: string | null
  debtorName?: string | null
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
        goal: { select: { id: true, name: true } },
        debtor: { select: { id: true, name: true } },
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
      goalId?: string | null
      debtorId?: string | null
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
    const debtor = body.debtorId
      ? await prisma.debtors.findFirst({ where: { id: body.debtorId, workspace_id: workspaceId } })
      : null

    if (body.debtorId && !debtor) {
      return reply.status(403).send({ error: "Forbidden", reason: "debtor_not_in_workspace" })
    }

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
      if (kind === "income" && body.debtorId) {
        return reply.status(400).send({ error: "Bad Request", reason: "debtor_income_not_allowed" })
      }
      if (kind === "expense" && body.debtorId && debtor?.direction !== "PAYABLE") {
        return reply.status(400).send({ error: "Bad Request", reason: "invalid_debtor_direction" })
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
            debtor_id: debtor?.id ?? null,
          },
        })

        return created
      })

      return reply.send({ transaction: mapTx(tx) })
    }

    // transfer
    const isGoalTransfer = Boolean(body.goalId) && !body.toAccountId
    const isDebtorRepayment = Boolean(body.debtorId) && !body.fromAccountId && Boolean(body.toAccountId)

    if (isDebtorRepayment) {
      if (debtor?.direction !== "RECEIVABLE") {
        return reply.status(400).send({ error: "Bad Request", reason: "invalid_debtor_direction" })
      }
      const to = await prisma.accounts.findFirst({ where: { id: body.toAccountId ?? "", workspace_id: workspaceId } })
      if (!to) {
        return reply.status(403).send({ error: "Forbidden", reason: "account_not_in_workspace" })
      }

      const tx = await prisma.$transaction(async (trx) => {
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
            account_id: null,
            from_account_id: null,
            to_account_id: to.id,
            goal_id: null,
            debtor_id: debtor.id,
          },
        })

        return created
      })

      return reply.send({ transaction: mapTx(tx) })
    }

    if (!body.fromAccountId) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_transfer_accounts" })
    }

    const from = await prisma.accounts.findFirst({ where: { id: body.fromAccountId, workspace_id: workspaceId } })
    if (!from) {
      return reply.status(403).send({ error: "Forbidden", reason: "account_not_in_workspace" })
    }

    if (isGoalTransfer) {
      const goal = await prisma.goals.findFirst({ where: { id: body.goalId ?? "", workspace_id: workspaceId } })
      if (!goal) {
        return reply.status(403).send({ error: "Forbidden", reason: "goal_not_in_workspace" })
      }

      const tx = await prisma.$transaction(async (trx) => {
        await trx.accounts.update({
          where: { id: from.id },
          data: { balance: { decrement: amount } },
        })

        await trx.goals.update({
          where: { id: goal.id },
          data: { current_amount: { increment: amount } },
        })

        const created = await trx.transactions.create({
          data: {
            workspace_id: workspaceId,
            kind,
            amount,
            happened_at: happenedAt,
            note: body.note ?? null,
            account_id: null,
            from_account_id: from.id,
            to_account_id: null,
            goal_id: goal.id,
            debtor_id: null,
          },
        })

        return created
      })

      return reply.send({ transaction: mapTx(tx) })
    }

    if (!body.toAccountId || body.fromAccountId === body.toAccountId) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_transfer_accounts" })
    }

    const to = await prisma.accounts.findFirst({ where: { id: body.toAccountId, workspace_id: workspaceId } })
    if (!to) {
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
          debtor_id: null,
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
        if (existing.goal_id) {
          const sourceAccountId = existing.from_account_id ?? existing.account_id
          if (!sourceAccountId) {
            throw new Error("Transaction missing goal transfer account")
          }
          await trx.accounts.update({
            where: { id: sourceAccountId },
            data: { balance: { increment: amount } },
          })
          await trx.goals.update({
            where: { id: existing.goal_id },
            data: { current_amount: { decrement: amount } },
          })
        } else if (existing.debtor_id) {
          if (!existing.to_account_id) {
            throw new Error("Transaction missing debtor transfer destination account")
          }
          await trx.accounts.update({
            where: { id: existing.to_account_id },
            data: { balance: { decrement: amount } },
          })
        } else {
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
      }

      await trx.transactions.delete({ where: { id: existing.id } })
    })

    return reply.status(204).send()
  })
}
