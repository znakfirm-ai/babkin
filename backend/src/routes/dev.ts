import { FastifyInstance, FastifyPluginOptions } from "fastify"
import { prisma } from "../db/prisma"
import { env } from "../env"
import { validateInitData, TELEGRAM_INITDATA_HEADER } from "../middleware/telegramAuth"

export async function devRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post("/dev/reset-my-workspace", async (request, reply) => {
    const tokenHeader = request.headers["x-dev-reset-token"] as string | undefined
    if (!env.DEV_RESET_TOKEN || tokenHeader !== env.DEV_RESET_TOKEN) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    const initDataRaw = request.headers[TELEGRAM_INITDATA_HEADER] as string | undefined
    const auth = await validateInitData(initDataRaw)
    if (!auth) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    const telegramUserId = Number(auth.telegramUserId)
    if (telegramUserId !== 347801822) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    const user = await prisma.users.findUnique({
      where: { telegram_user_id: String(telegramUserId) },
      select: { id: true, active_workspace_id: true },
    })

    const workspaceId = user?.active_workspace_id ?? null

    if (!workspaceId) {
      return reply.send({ ok: true, deletedWorkspaceId: null, telegramUserId })
    }

    fastify.log.warn({ msg: "dev reset workspace", telegramUserId, workspaceId })

    await prisma.$transaction(async (tx) => {
      await tx.transactions.deleteMany({ where: { workspace_id: workspaceId } })
      await tx.accounts.deleteMany({ where: { workspace_id: workspaceId } })
      await tx.categories.deleteMany({ where: { workspace_id: workspaceId } })
      await tx.income_sources.deleteMany({ where: { workspace_id: workspaceId } })
      await tx.goals.deleteMany({ where: { workspace_id: workspaceId } })
      await tx.workspace_invites.deleteMany({ where: { workspace_id: workspaceId } })
      await tx.workspace_members.deleteMany({ where: { workspace_id: workspaceId } })
      await tx.workspaces.deleteMany({ where: { id: workspaceId } })
    })

    return reply.send({ ok: true, deletedWorkspaceId: workspaceId, telegramUserId })
  })
}
