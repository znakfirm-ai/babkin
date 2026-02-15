import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"

export async function meRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/me", async (request, reply) => {
    const authHeader = request.headers.authorization
    let userId: string | null = null
    let telegramUserId: string | null = null

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length)
      try {
        const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; telegramUserId?: string }
        userId = payload.sub
        telegramUserId = payload.telegramUserId ?? null
      } catch {
        return reply.status(401).send({ error: "Unauthorized" })
      }
    }

    if (!userId) {
      const initDataRaw = request.headers[TELEGRAM_INITDATA_HEADER] as string | undefined
      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        return reply.status(401).send({ error: "Unauthorized" })
      }
      userId = auth.userId
      telegramUserId = auth.telegramUserId
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        telegram_user_id: true,
        first_name: true,
        username: true,
        active_workspace_id: true,
      },
    })

    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" })
    }

    const memberships = await prisma.workspace_members.findMany({
      where: { user_id: user.id },
      include: {
        workspaces: true,
      },
    })

    const workspaces = memberships.map((m) => ({
      id: m.workspace_id,
      type: m.workspaces.type,
      name: m.workspaces.name,
      role: m.role,
    }))

    return reply.send({
      user: {
        telegramUserId: telegramUserId ?? user.telegram_user_id,
        firstName: user.first_name ?? undefined,
        username: user.username ?? undefined,
      },
      activeWorkspaceId: user.active_workspace_id,
      workspaces,
    })
  })
}
