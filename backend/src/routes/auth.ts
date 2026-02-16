import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import { prisma } from "../db/prisma"
import { env } from "../env"
import { validateInitData, TELEGRAM_INITDATA_HEADER } from "../middleware/telegramAuth"

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

const DEFAULT_INCOME_SOURCES = [{ name: "Зарплата" }, { name: "Бизнес" }]

export async function authRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post("/auth/telegram", async (request, reply) => {
    const initDataRaw = request.headers[TELEGRAM_INITDATA_HEADER] as string | undefined
    const hasInitData = Boolean(initDataRaw && initDataRaw.length > 0)
    const authDate = (() => {
      const params = initDataRaw ? new URLSearchParams(initDataRaw) : null
      const ad = params?.get("auth_date")
      return ad ? Number(ad) : undefined
    })()

    if (!env.BOT_TOKEN) {
      fastify.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason: "missing_bot_token" })
      return reply.status(401).send({ error: "Unauthorized", reason: "missing_bot_token" })
    }

    const auth = await validateInitData(initDataRaw)
    if (!auth) {
      fastify.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason: "invalid_initdata" })
      return reply.status(401).send({ error: "Unauthorized", reason: hasInitData ? "invalid_initdata" : "missing_initdata" })
    }

    const user = await prisma.users.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        telegram_user_id: true,
        first_name: true,
        username: true,
        active_workspace_id: true,
      },
    })

    if (!user) {
      fastify.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason: "invalid_initdata" })
      return reply.status(401).send({ error: "Unauthorized", reason: "invalid_initdata" })
    }

    await prisma.$transaction(async (tx) => {
      const membershipCount = await tx.workspace_members.count({ where: { user_id: user.id } })
      if (membershipCount === 0) {
        const workspace = await tx.workspaces.create({
          data: {
            type: "personal",
            name: null,
            created_by_user_id: user.id,
          },
        })
        await tx.categories.createMany({
          data: DEFAULT_CATEGORIES.map((c) => ({
            id: undefined,
            workspace_id: workspace.id,
            name: c.name,
            kind: c.kind,
            icon: null,
          })),
          skipDuplicates: true,
        })
        await tx.income_sources.createMany({
          data: DEFAULT_INCOME_SOURCES.map((s) => ({
            workspace_id: workspace.id,
            name: s.name,
          })),
          skipDuplicates: true,
        })
        await tx.workspace_members.create({
          data: { workspace_id: workspace.id, user_id: user.id, role: "owner" },
        })
        await tx.users.update({
          where: { id: user.id },
          data: { active_workspace_id: workspace.id },
        })
      }
    })

    const memberships = await prisma.workspace_members.findMany({
      where: { user_id: auth.userId },
      include: { workspaces: true },
    })

    const workspaces = memberships.map((m) => ({
      id: m.workspace_id,
      type: m.workspaces.type,
      name: m.workspaces.name,
      role: m.role,
    }))

    const accessToken = jwt.sign(
      {
        sub: user.id,
        telegramUserId: user.telegram_user_id,
      },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "30d" }
    )

    return reply.send({
      accessToken,
      user: {
        telegramUserId: user.telegram_user_id,
        firstName: user.first_name ?? undefined,
        username: user.username ?? undefined,
      },
      activeWorkspaceId: user.active_workspace_id,
      workspaces,
    })
  })
}
