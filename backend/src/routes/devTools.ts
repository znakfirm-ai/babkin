import { FastifyInstance, FastifyPluginOptions } from "fastify"
import { prisma } from "../db/prisma"
import { env } from "../env"

type DeleteUserByTelegramIdBody = {
  telegramUserId?: string
}

class DevDeleteUserConflictError extends Error {
  constructor(public readonly workspaceId: string) {
    super("user_has_workspace_with_other_members")
    this.name = "DevDeleteUserConflictError"
  }
}

const normalizeTelegramUserId = (value: string | undefined) => {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed
}

export async function devToolsRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post("/dev/delete-user-by-telegram-id", async (request, reply) => {
    if (env.NODE_ENV === "production") {
      return reply.status(404).send({ error: "Not Found" })
    }

    const body = (request.body ?? {}) as DeleteUserByTelegramIdBody
    const telegramUserId = normalizeTelegramUserId(body.telegramUserId)
    if (!telegramUserId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_telegram_user_id" })
    }

    const targetUser = await prisma.users.findUnique({
      where: { telegram_user_id: telegramUserId },
      select: { id: true },
    })

    if (!targetUser) {
      return reply.send({
        success: true,
        found: false,
        telegramUserId,
        deletedUser: false,
        deletedWorkspaces: 0,
        deletedMemberships: 0,
        deletedInvites: 0,
      })
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const ownedWorkspaceIds = (
          await tx.workspaces.findMany({
            where: { created_by_user_id: targetUser.id },
            select: { id: true },
          })
        ).map((workspace) => workspace.id)

        if (ownedWorkspaceIds.length > 0) {
          const conflictingMembership = await tx.workspace_members.findFirst({
            where: {
              workspace_id: { in: ownedWorkspaceIds },
              user_id: { not: targetUser.id },
            },
            select: { workspace_id: true },
          })
          if (conflictingMembership) {
            throw new DevDeleteUserConflictError(conflictingMembership.workspace_id)
          }
        }

        const deletedMemberships = await tx.workspace_members.deleteMany({
          where: { user_id: targetUser.id },
        })
        const deletedInvites = await tx.workspace_invites.deleteMany({
          where: { created_by_user_id: targetUser.id },
        })

        if (ownedWorkspaceIds.length > 0) {
          await tx.users.updateMany({
            where: {
              id: { not: targetUser.id },
              active_workspace_id: { in: ownedWorkspaceIds },
            },
            data: { active_workspace_id: null },
          })
          await tx.workspaces.deleteMany({
            where: { id: { in: ownedWorkspaceIds } },
          })
        }

        await tx.users.delete({
          where: { id: targetUser.id },
        })

        return {
          deletedWorkspaces: ownedWorkspaceIds.length,
          deletedMemberships: deletedMemberships.count,
          deletedInvites: deletedInvites.count,
        }
      })

      return reply.send({
        success: true,
        found: true,
        telegramUserId,
        deletedUser: true,
        deletedWorkspaces: result.deletedWorkspaces,
        deletedMemberships: result.deletedMemberships,
        deletedInvites: result.deletedInvites,
      })
    } catch (error) {
      if (error instanceof DevDeleteUserConflictError) {
        return reply.status(409).send({
          error: "Conflict",
          reason: "user_owns_workspace_with_other_members",
          workspaceId: error.workspaceId,
        })
      }
      throw error
    }
  })
}

