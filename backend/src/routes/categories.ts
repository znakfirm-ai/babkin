import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

const DEFAULT_CATEGORIES = [
  { name: "Еда", kind: "expense" as const },
  { name: "Транспорт", kind: "expense" as const },
  { name: "Дом", kind: "expense" as const },
  { name: "Развлечения", kind: "expense" as const },
  { name: "Здоровье", kind: "expense" as const },
  { name: "Покупки", kind: "expense" as const },
  { name: "Зарплата", kind: "income" as const },
  { name: "Бизнес", kind: "income" as const },
  { name: "Подарки", kind: "income" as const },
]

type CategoryResponse = {
  id: string
  name: string
  kind: "income" | "expense"
  icon: string | null
  is_archived?: boolean | null
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

export async function categoriesRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/categories", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const workspaceId: string = user.active_workspace_id

    const existing = await prisma.categories.findMany({
      where: { workspace_id: workspaceId },
    })

    if (existing.length === 0) {
      await prisma.categories.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({
          workspace_id: workspaceId,
          name: c.name,
          kind: c.kind,
          icon: null,
        })),
        skipDuplicates: true,
      })
    }

    const categories = existing.length
      ? existing
      : await prisma.categories.findMany({ where: { workspace_id: workspaceId } })

    const payload: { categories: CategoryResponse[] } = {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        is_archived: (c as { is_archived?: boolean })?.is_archived ?? null,
      })),
    }

    return reply.send(payload)
  })

  fastify.post("/categories", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const body = request.body as { name?: string; kind?: "income" | "expense"; icon?: string | null }

    const name = body?.name?.trim()
    const kind = body?.kind

    if (!name || (kind !== "income" && kind !== "expense")) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_fields" })
    }

    const created = await prisma.categories.create({
      data: {
        workspace_id: user.active_workspace_id,
        name,
        kind,
        icon: body?.icon ?? null,
      },
    })

    const category: CategoryResponse = {
      id: created.id,
      name: created.name,
      kind: created.kind,
      icon: created.icon,
    }

    return reply.send({ category })
  })

  fastify.patch("/categories/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const categoryId = (request.params as { id?: string }).id
    if (!categoryId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_id" })
    }

    const body = request.body as { name?: string }
    const name = body?.name?.trim()
    if (!name) {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" })
    }

    const existing = await prisma.categories.findFirst({
      where: { id: categoryId, workspace_id: user.active_workspace_id },
    })
    if (!existing) {
      return reply.status(404).send({ error: "Not Found" })
    }

    const duplicate = await prisma.categories.findFirst({
      where: {
        workspace_id: user.active_workspace_id,
        name: { equals: name, mode: "insensitive" },
        NOT: { id: categoryId },
      },
    })
    if (duplicate) {
      return reply.status(409).send({ error: "Conflict", code: "CATEGORY_NAME_EXISTS" })
    }

    const updated = await prisma.categories.update({
      where: { id: categoryId },
      data: { name },
    })

    const category: CategoryResponse = {
      id: updated.id,
      name: updated.name,
      kind: updated.kind,
      icon: updated.icon,
    }

    return reply.send({ category })
  })

  fastify.delete("/categories/:id", async (request, reply) => {
    const userId = await resolveUserId(request, reply)
    if (!userId) return

    const user = await prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } })
    if (!user?.active_workspace_id) {
      return reply.status(400).send({ error: "No active workspace" })
    }

    const categoryId = (request.params as { id?: string }).id
    if (!categoryId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_id" })
    }

    const category = await prisma.categories.findFirst({
      where: { id: categoryId, workspace_id: user.active_workspace_id },
    })
    if (!category) {
      return reply.status(404).send({ error: "Not Found" })
    }

    const txCount = await prisma.transactions.count({
      where: { workspace_id: user.active_workspace_id, category_id: categoryId },
    })
    if (txCount > 0) {
      return reply.status(409).send({ error: "Conflict", code: "CATEGORY_IN_USE" })
    }

    await prisma.categories.delete({ where: { id: categoryId } })
    return reply.status(204).send()
  })
}
