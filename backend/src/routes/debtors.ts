import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

type DebtorResponse = {
  id: string
  name: string
  icon: string | null
  issuedAt: string
  principalAmount: string
  dueAt: string | null
  payoffAmount: string | null
  status: "active" | "completed"
  createdAt: string
  updatedAt: string
}

type DebtorRecord = {
  id: string
  name: string
  icon: string | null
  issued_at: Date
  principal_amount: Prisma.Decimal
  due_at: Date | null
  payoff_amount: Prisma.Decimal | null
  status: "active" | "completed"
  created_at: Date
  updated_at: Date
}

type DebtorsModel = {
  findMany: (args: unknown) => Promise<DebtorRecord[]>
  create: (args: unknown) => Promise<DebtorRecord>
  findFirst: (args: unknown) => Promise<DebtorRecord | null>
  update: (args: unknown) => Promise<DebtorRecord>
  delete: (args: unknown) => Promise<unknown>
}

const debtorsModel = (prisma as unknown as { debtors?: DebtorsModel }).debtors

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

const parseDate = (value: string | undefined | null): Date | null => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const parseAmount = (value: string | number | null | undefined): number | null => {
  if (value === undefined || value === null || value === "") return null
  const parsed = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(parsed)) return null
  return parsed
}

const mapDebtor = (d: DebtorRecord): DebtorResponse => ({
  id: d.id,
  name: d.name,
  icon: d.icon,
  issuedAt: d.issued_at.toISOString(),
  principalAmount: d.principal_amount.toString(),
  dueAt: d.due_at ? d.due_at.toISOString() : null,
  payoffAmount: d.payoff_amount ? d.payoff_amount.toString() : null,
  status: d.status,
  createdAt: d.created_at.toISOString(),
  updatedAt: d.updated_at.toISOString(),
})

export async function debtorsRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  if (!debtorsModel) {
    fastify.log.error("Prisma debtors model is not available. Run prisma generate with updated schema.")
    return
  }

  fastify.get("/debtors", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const status = (request.query as { status?: string }).status
    const debtors = await debtorsModel.findMany({
      where: {
        workspace_id: user.active_workspace_id,
        ...(status === "active" || status === "completed" ? { status } : {}),
      },
      orderBy: { created_at: "desc" },
    })

    return reply.send({ debtors: debtors.map(mapDebtor) })
  })

  fastify.post("/debtors", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const body = request.body as {
      name?: string
      icon?: string | null
      issuedAt?: string
      principalAmount?: string | number
      dueAt?: string | null
      payoffAmount?: string | number | null
      status?: "active" | "completed"
    }

    const name = body?.name?.trim()
    if (!name) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" })
    }

    const issuedAt = parseDate(body.issuedAt)
    if (!issuedAt) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_issued_at" })
    }

    const principalAmount = parseAmount(body.principalAmount)
    if (principalAmount === null || principalAmount <= 0) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_principal_amount" })
    }

    const dueAt = body.dueAt === null ? null : parseDate(body.dueAt)
    if (body.dueAt !== undefined && body.dueAt !== null && !dueAt) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_due_at" })
    }

    const payoffAmount = parseAmount(body.payoffAmount)
    if (body.payoffAmount !== undefined && body.payoffAmount !== null && payoffAmount === null) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_payoff_amount" })
    }
    if (payoffAmount !== null && payoffAmount < 0) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_payoff_amount" })
    }

    const created = await debtorsModel.create({
      data: {
        workspace_id: user.active_workspace_id,
        name,
        icon: body.icon?.trim() || null,
        issued_at: issuedAt,
        principal_amount: new Prisma.Decimal(principalAmount),
        due_at: dueAt,
        payoff_amount: payoffAmount === null ? null : new Prisma.Decimal(payoffAmount),
        status: body.status === "completed" ? "completed" : "active",
      },
    })

    return reply.send({ debtor: mapDebtor(created) })
  })

  fastify.patch("/debtors/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const debtorId = (request.params as { id?: string }).id
    if (!debtorId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_id" })
    }

    const existing = await debtorsModel.findFirst({
      where: { id: debtorId, workspace_id: user.active_workspace_id },
    })
    if (!existing) {
      return reply.status(404).send({ error: "Not Found" })
    }

    const body = request.body as {
      name?: string
      icon?: string | null
      issuedAt?: string
      principalAmount?: string | number
      dueAt?: string | null
      payoffAmount?: string | number | null
      status?: "active" | "completed"
    }

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" })
      }
      data.name = name
    }

    if (body.icon !== undefined) {
      data.icon = body.icon?.trim() || null
    }

    if (body.issuedAt !== undefined) {
      const issuedAt = parseDate(body.issuedAt)
      if (!issuedAt) {
        return reply.status(400).send({ error: "Bad Request", reason: "invalid_issued_at" })
      }
      data.issued_at = issuedAt
    }

    if (body.principalAmount !== undefined) {
      const principalAmount = parseAmount(body.principalAmount)
      if (principalAmount === null || principalAmount <= 0) {
        return reply.status(400).send({ error: "Bad Request", reason: "invalid_principal_amount" })
      }
      data.principal_amount = new Prisma.Decimal(principalAmount)
    }

    if (body.dueAt !== undefined) {
      if (body.dueAt === null) {
        data.due_at = null
      } else {
        const dueAt = parseDate(body.dueAt)
        if (!dueAt) {
          return reply.status(400).send({ error: "Bad Request", reason: "invalid_due_at" })
        }
        data.due_at = dueAt
      }
    }

    if (body.payoffAmount !== undefined) {
      if (body.payoffAmount === null) {
        data.payoff_amount = null
      } else {
        const payoffAmount = parseAmount(body.payoffAmount)
        if (payoffAmount === null || payoffAmount < 0) {
          return reply.status(400).send({ error: "Bad Request", reason: "invalid_payoff_amount" })
        }
        data.payoff_amount = new Prisma.Decimal(payoffAmount)
      }
    }

    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "completed") {
        return reply.status(400).send({ error: "Bad Request", reason: "invalid_status" })
      }
      data.status = body.status
    }

    const updated = await debtorsModel.update({
      where: { id: debtorId },
      data,
    })

    return reply.send({ debtor: mapDebtor(updated) })
  })

  fastify.delete("/debtors/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const debtorId = (request.params as { id?: string }).id
    if (!debtorId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_id" })
    }

    const existing = await debtorsModel.findFirst({
      where: { id: debtorId, workspace_id: user.active_workspace_id },
      select: { id: true },
    })
    if (!existing) {
      return reply.status(404).send({ error: "Not Found" })
    }

    await debtorsModel.delete({ where: { id: debtorId } })

    return reply.status(204).send()
  })
}
