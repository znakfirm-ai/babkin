import { FastifyInstance, FastifyPluginOptions } from "fastify"
import { prisma } from "../db/prisma"
import { telegramAuth } from "../middleware/telegramAuth"

export async function meRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get(
    "/me",
    { preHandler: telegramAuth },
    async (request) => {
      const auth = request.auth
      if (!auth) {
        return request.reply.status(401).send({ error: "Unauthorized" })
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
        return request.reply.status(401).send({ error: "Unauthorized" })
      }

      const memberships = await prisma.workspace_members.findMany({
        where: { user_id: auth.userId },
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

      return {
        user: {
          telegramUserId: user.telegram_user_id,
          firstName: user.first_name ?? undefined,
          username: user.username ?? undefined,
        },
        activeWorkspaceId: user.active_workspace_id,
        workspaces,
      }
    }
  )
}
