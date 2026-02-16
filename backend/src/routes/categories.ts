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

    const existing = await prisma.categories.findMany({
      where: { workspace_id: user.active_workspace_id },
    })

    if (existing.length === 0) {
      await prisma.categories.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({
          workspace_id: user.active_workspace_id,
          name: c.name,
          kind: c.kind,
          icon: null,
        })),
        skipDuplicates: true,
      })
    }

    const categories = existing.length
      ? existing
      : await prisma.categories.findMany({ where: { workspace_id: user.active_workspace_id } })

    const payload: { categories: CategoryResponse[] } = {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
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
}
