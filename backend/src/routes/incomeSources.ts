import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"
import { seedWorkspaceDefaults } from "../defaults/workspaceDefaults"
import { hasEntityNameConflict, isEntityNameTooLong } from "../utils/entityNameValidation"

const INCOME_SOURCE_NAME_MAX_LENGTH = 12

type IncomeSourceResponse = {
  id: string
  name: string
  icon?: string | null
  isArchived: boolean
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

export async function incomeSourcesRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/income-sources", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const workspaceId: string = user.active_workspace_id

    await seedWorkspaceDefaults(prisma, workspaceId, {
      seedAccounts: false,
      seedCategories: false,
      seedIncomeSources: true,
    })

    const sources = await prisma.income_sources.findMany({ where: { workspace_id: workspaceId } })

    const payload: { incomeSources: IncomeSourceResponse[] } = {
      incomeSources: sources.map((s) => ({ id: s.id, name: s.name, icon: s.icon ?? null, isArchived: s.is_archived })),
    }

    return reply.send(payload)
  })

  fastify.post("/income-sources", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const body = request.body as { name?: string; icon?: string | null }
    const name = body?.name?.trim()
    if (!name) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" })
    }
    if (isEntityNameTooLong(name, INCOME_SOURCE_NAME_MAX_LENGTH)) {
      return reply.status(400).send({ error: "Bad Request", code: "INCOME_SOURCE_NAME_TOO_LONG" })
    }

    const sameWorkspaceSources = await prisma.income_sources.findMany({
      where: { workspace_id: user.active_workspace_id, is_archived: false, archived_at: null },
      select: { id: true, name: true },
    })
    if (hasEntityNameConflict(sameWorkspaceSources, name)) {
      return reply.status(409).send({ error: "Conflict", code: "INCOME_SOURCE_NAME_EXISTS" })
    }

    const created = await prisma.income_sources.create({
      data: {
        workspace_id: user.active_workspace_id,
        name,
        icon: body?.icon ?? null,
        is_default: false,
        is_archived: false,
        archived_at: null,
      },
    })

    const payload: { incomeSource: IncomeSourceResponse } = {
      incomeSource: { id: created.id, name: created.name, icon: created.icon ?? null, isArchived: created.is_archived },
    }

    return reply.send(payload)
  })

  fastify.patch("/income-sources/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const incomeSourceId = (request.params as { id?: string }).id
    if (!incomeSourceId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_id" })
    }

    const body = request.body as { name?: string; icon?: string | null }
    const name = body?.name?.trim()
    if (!name) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" })
    }
    if (isEntityNameTooLong(name, INCOME_SOURCE_NAME_MAX_LENGTH)) {
      return reply.status(400).send({ error: "Bad Request", code: "INCOME_SOURCE_NAME_TOO_LONG" })
    }

    const existing = await prisma.income_sources.findFirst({
      where: { id: incomeSourceId, workspace_id: user.active_workspace_id },
    })
    if (!existing) {
      return reply.status(404).send({ error: "Not Found" })
    }

    const sameWorkspaceSources = await prisma.income_sources.findMany({
      where: { workspace_id: user.active_workspace_id, is_archived: false, archived_at: null },
      select: { id: true, name: true },
    })
    if (hasEntityNameConflict(sameWorkspaceSources, name, incomeSourceId)) {
      return reply.status(409).send({ error: "Conflict", code: "INCOME_SOURCE_NAME_EXISTS" })
    }

    const updated = await prisma.income_sources.update({
      where: { id: incomeSourceId },
      data: { name, icon: body?.icon ?? null },
    })

    return reply.send({ incomeSource: { id: updated.id, name: updated.name, icon: updated.icon ?? null, isArchived: updated.is_archived } })
  })

  fastify.delete("/income-sources/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const incomeSourceId = (request.params as { id?: string }).id
    if (!incomeSourceId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_id" })
    }

    const existing = await prisma.income_sources.findFirst({
      where: { id: incomeSourceId, workspace_id: user.active_workspace_id },
    })
    if (!existing) {
      return reply.status(404).send({ error: "Not Found" })
    }

    await prisma.income_sources.update({
      where: { id: incomeSourceId },
      data: { is_archived: true, archived_at: new Date() },
    })
    return reply.status(204).send()
  })
}
