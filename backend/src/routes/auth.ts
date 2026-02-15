import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import { prisma } from "../db/prisma"
import { env } from "../env"
import { validateInitData, TELEGRAM_INITDATA_HEADER } from "../middleware/telegramAuth"

export async function authRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post("/auth/telegram", async (request, reply) => {
    const initDataRaw = request.headers[TELEGRAM_INITDATA_HEADER] as string | undefined
    const auth = await validateInitData(initDataRaw)
    if (!auth) {
      return reply.status(401).send({ error: "Unauthorized" })
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
      return reply.status(401).send({ error: "Unauthorized" })
    }

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
