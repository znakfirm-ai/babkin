import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData, validateInitDataUserOnly } from "../middleware/telegramAuth"
import { env } from "../env"
import { seedWorkspaceDefaults } from "../defaults/workspaceDefaults"
import { canUseSharedWorkspaceFeature } from "../policies/sharedWorkspaceAccess"
import { resolveTelegramBotUsername } from "../utils/telegramBotUsername"

const INVITE_CODE_BYTES = 8
const INVITE_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000

const buildInviteCode = () => crypto.randomBytes(INVITE_CODE_BYTES).toString("base64url")

const buildInviteExpiry = () => new Date(Date.now() + INVITE_EXPIRES_IN_MS)

const isInviteExpired = (invite: { expires_at: Date | null }) => Boolean(invite.expires_at && invite.expires_at.getTime() <= Date.now())

const isInviteExhausted = (invite: { max_uses: number | null; uses_count: number }) =>
  invite.max_uses !== null && invite.uses_count >= invite.max_uses

const resolveInviteCode = (body: { code?: string } | undefined) => {
  const trimmed = body?.code?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const createInviteRecord = async (
  tx: Prisma.TransactionClient,
  workspaceId: string,
  ownerUserId: string,
) => {
  let attempt = 0
  while (attempt < 5) {
    attempt += 1
    try {
      const code = buildInviteCode()
      return await tx.workspace_invites.create({
        data: {
          workspace_id: workspaceId,
          created_by_user_id: ownerUserId,
          code,
          expires_at: buildInviteExpiry(),
          max_uses: null,
          uses_count: 0,
          is_revoked: false,
        },
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error
      }
    }
  }
  throw new Error("invite_code_generation_failed")
}

export async function workspacesRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  const ensureSharedAccess = () => {
    const decision = canUseSharedWorkspaceFeature()
    return decision.allowed ? null : decision.reason ?? "shared_feature_disabled"
  }

  const resolveUserIdForJoin = async (request: any, reply: any) => {
    const authHeader = request.headers.authorization
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length)
      try {
        const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string }
        return payload.sub
      } catch {
        await reply.status(401).send({ error: "Unauthorized", reason: "invalid_jwt" })
        return null
      }
    }

    const initDataRaw = request.headers[TELEGRAM_INITDATA_HEADER] as string | undefined
    const hasInitData = Boolean(initDataRaw && initDataRaw.length > 0)
    const authDate = (() => {
      const params = initDataRaw ? new URLSearchParams(initDataRaw) : null
      const ad = params?.get("auth_date")
      return ad ? Number(ad) : undefined
    })()

    if (!env.BOT_TOKEN) {
      const reason = "missing_bot_token"
      request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
      await reply.status(401).send({ error: "Unauthorized", reason })
      return null
    }

    const auth = await validateInitDataUserOnly(initDataRaw)
    if (!auth) {
      const reason = hasInitData ? "invalid_initdata" : "missing_initdata"
      request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
      await reply.status(401).send({ error: "Unauthorized", reason })
      return null
    }

    return auth.userId
  }

  fastify.get("/workspaces", async (request, reply) => {
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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      request.log.info({
        hasInitData,
        initDataLength: initDataRaw?.length ?? 0,
        authDate,
        userId: auth.telegramUserId,
        reason: "ok",
      })
      userId = auth.userId
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        active_workspace_id: true,
      },
    })

    if (!user) {
      return reply.status(401).send({ error: "Unauthorized", reason: reason ?? "invalid_initdata" })
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
      iconEmoji: m.workspaces.icon_emoji ?? null,
      canResetWorkspace: m.workspaces.created_by_user_id === user.id,
    }))

    const active = workspaces.find((w) => w.id === user.active_workspace_id) ?? null

    return reply.send({
      workspaces,
      activeWorkspaceId: user.active_workspace_id,
      activeWorkspace: active,
    })
  })

  fastify.post("/workspaces", async (request, reply) => {
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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      userId = auth.userId
    }

    const body = request.body as { type?: string; name?: string | null }
    if (body?.type !== "family") {
      return reply.status(400).send({ error: "Bad Request", reason: "invalid_type" })
    }

    const name = body.name ?? null

    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspaces.create({
        data: {
          type: "family",
          name,
          created_by_user_id: userId as string,
        },
      })
      await seedWorkspaceDefaults(tx, created.id)
      await tx.workspace_members.create({
        data: {
          workspace_id: created.id,
          user_id: userId as string,
          role: "owner",
        },
      })
      return created
    })

    return reply.send({
      workspace: {
        id: workspace.id,
        type: workspace.type,
        name: workspace.name,
        iconEmoji: workspace.icon_emoji ?? null,
        canResetWorkspace: true,
      },
    })
  })

  fastify.patch("/workspaces/active", async (request, reply) => {
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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      userId = auth.userId
    }

    const body = request.body as { workspaceId?: string }
    const workspaceId = body?.workspaceId
    if (!workspaceId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_workspace_id" })
    }

    const workspace = await prisma.workspaces.findUnique({ where: { id: workspaceId } })
    if (!workspace) {
      return reply.status(404).send({ error: "Not Found", reason: "workspace_not_found" })
    }

    const membership = await prisma.workspace_members.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId as string,
        },
      },
    })

    if (!membership) {
      return reply.status(403).send({ error: "Forbidden", reason: "not_a_member" })
    }

    await prisma.users.update({
      where: { id: userId as string },
      data: { active_workspace_id: workspaceId },
    })

    return reply.send({
      activeWorkspaceId: workspaceId,
      activeWorkspace: {
        id: workspace.id,
        type: workspace.type,
        name: workspace.name,
        iconEmoji: workspace.icon_emoji ?? null,
        canResetWorkspace: workspace.created_by_user_id === (userId as string),
      },
    })
  })

  fastify.patch("/workspaces/:id", async (request, reply) => {
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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      userId = auth.userId
    }

    const workspaceId = (request.params as { id?: string }).id
    if (!workspaceId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_workspace_id" })
    }

    const membership = await prisma.workspace_members.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId as string,
        },
      },
    })
    if (!membership) {
      return reply.status(403).send({ error: "Forbidden", reason: "not_a_member" })
    }

    const body = request.body as { displayName?: string | null; iconEmoji?: string | null }
    const displayName =
      body.displayName !== undefined ? (body.displayName?.trim() ? body.displayName.trim() : null) : undefined
    const normalizedIcon =
      body.iconEmoji !== undefined
        ? body.iconEmoji?.trim()
          ? (Array.from(body.iconEmoji.trim())[0] ?? null)
          : null
        : undefined

    const updatedWorkspace = await prisma.workspaces.update({
      where: { id: workspaceId },
      data: {
        name: displayName,
        icon_emoji: normalizedIcon,
      },
    })

    return reply.send({
      workspace: {
        id: updatedWorkspace.id,
        type: updatedWorkspace.type,
        name: updatedWorkspace.name,
        iconEmoji: updatedWorkspace.icon_emoji ?? null,
        canResetWorkspace: updatedWorkspace.created_by_user_id === (userId as string),
      },
    })
  })

  fastify.get("/workspaces/:id/invite", async (request, reply) => {
    const sharedAccessReason = ensureSharedAccess()
    if (sharedAccessReason) {
      return reply.status(403).send({ error: "Forbidden", reason: sharedAccessReason })
    }

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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      userId = auth.userId
    }

    const workspaceId = (request.params as { id?: string }).id
    if (!workspaceId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_workspace_id" })
    }

    const workspace = await prisma.workspaces.findUnique({
      where: { id: workspaceId },
      select: { id: true, created_by_user_id: true },
    })
    if (!workspace) {
      return reply.status(404).send({ error: "Not Found", reason: "workspace_not_found" })
    }

    const membership = await prisma.workspace_members.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId as string,
        },
      },
    })
    if (!membership) {
      return reply.status(403).send({ error: "Forbidden", reason: "not_a_member" })
    }
    if (workspace.created_by_user_id !== (userId as string)) {
      return reply.status(403).send({ error: "Forbidden", reason: "only_creator_can_manage_invites" })
    }

    const activeInvite = await prisma.workspace_invites.findFirst({
      where: {
        workspace_id: workspaceId,
        is_revoked: false,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        code: true,
        expires_at: true,
        max_uses: true,
        uses_count: true,
      },
    })
    const botUsername = await resolveTelegramBotUsername()

    if (!activeInvite || isInviteExpired(activeInvite) || isInviteExhausted(activeInvite)) {
      return reply.send({ invite: null, botUsername })
    }

    return reply.send({
      invite: {
        code: activeInvite.code,
        expiresAt: activeInvite.expires_at?.toISOString() ?? null,
        maxUses: activeInvite.max_uses,
        usesCount: activeInvite.uses_count,
        botUsername,
      },
    })
  })

  fastify.post("/workspaces/:id/invite/regenerate", async (request, reply) => {
    const sharedAccessReason = ensureSharedAccess()
    if (sharedAccessReason) {
      return reply.status(403).send({ error: "Forbidden", reason: sharedAccessReason })
    }

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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      userId = auth.userId
    }

    const workspaceId = (request.params as { id?: string }).id
    if (!workspaceId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_workspace_id" })
    }

    const workspace = await prisma.workspaces.findUnique({
      where: { id: workspaceId },
      select: { id: true, created_by_user_id: true },
    })
    if (!workspace) {
      return reply.status(404).send({ error: "Not Found", reason: "workspace_not_found" })
    }

    const membership = await prisma.workspace_members.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId as string,
        },
      },
    })
    if (!membership) {
      return reply.status(403).send({ error: "Forbidden", reason: "not_a_member" })
    }
    if (workspace.created_by_user_id !== (userId as string)) {
      return reply.status(403).send({ error: "Forbidden", reason: "only_creator_can_manage_invites" })
    }

    const invite = await prisma.$transaction(async (tx) => {
      await tx.workspace_invites.updateMany({
        where: { workspace_id: workspaceId, is_revoked: false },
        data: { is_revoked: true },
      })
      const created = await createInviteRecord(tx, workspaceId, userId as string)
      await tx.workspace_invites.updateMany({
        where: { workspace_id: workspaceId, is_revoked: false, id: { not: created.id } },
        data: { is_revoked: true },
      })
      return created
    })

    const botUsername = await resolveTelegramBotUsername()

    return reply.send({
      invite: {
        code: invite.code,
        expiresAt: invite.expires_at?.toISOString() ?? null,
        maxUses: invite.max_uses,
        usesCount: invite.uses_count,
        botUsername,
      },
    })
  })

  fastify.post("/workspaces/join", async (request, reply) => {
    const sharedAccessReason = ensureSharedAccess()
    if (sharedAccessReason) {
      return reply.status(403).send({ error: "Forbidden", reason: sharedAccessReason })
    }

    const userId = await resolveUserIdForJoin(request, reply)
    if (!userId) return

    const body = request.body as { code?: string } | undefined
    const inviteCode = resolveInviteCode(body)
    if (!inviteCode) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_invite_code" })
    }

    let result:
      | { ok: true; joined: boolean; workspaceId: string }
      | { ok: false; reason: string }
    try {
      result = await prisma.$transaction(async (tx) => {
        const invite = await tx.workspace_invites.findUnique({
          where: { code: inviteCode },
          select: {
            id: true,
            workspace_id: true,
            is_revoked: true,
            expires_at: true,
            max_uses: true,
            uses_count: true,
          },
        })
        if (!invite) {
          return { ok: false as const, reason: "invite_not_found" }
        }
        if (invite.is_revoked) {
          return { ok: false as const, reason: "invite_revoked" }
        }
        if (isInviteExpired(invite)) {
          return { ok: false as const, reason: "invite_expired" }
        }
        if (isInviteExhausted(invite)) {
          return { ok: false as const, reason: "invite_exhausted" }
        }

        const existingMembership = await tx.workspace_members.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: invite.workspace_id,
              user_id: userId,
            },
          },
        })

        if (existingMembership) {
          await tx.users.update({
            where: { id: userId },
            data: { active_workspace_id: invite.workspace_id },
          })
          return { ok: true as const, joined: false, workspaceId: invite.workspace_id }
        }

        await tx.workspace_members.create({
          data: {
            workspace_id: invite.workspace_id,
            user_id: userId,
            role: "member",
          },
        })

        if (invite.max_uses !== null) {
          const incremented = await tx.workspace_invites.updateMany({
            where: {
              id: invite.id,
              is_revoked: false,
              uses_count: invite.uses_count,
              max_uses: { gte: invite.uses_count + 1 },
              OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
            },
            data: {
              uses_count: { increment: 1 },
            },
          })
          if (incremented.count !== 1) {
            throw new Error("invite_usage_race")
          }
        } else {
          await tx.workspace_invites.update({
            where: { id: invite.id },
            data: { uses_count: { increment: 1 } },
          })
        }

        await tx.users.update({
          where: { id: userId },
          data: { active_workspace_id: invite.workspace_id },
        })

        return { ok: true as const, joined: true, workspaceId: invite.workspace_id }
      })
    } catch (error) {
      if (error instanceof Error && error.message === "invite_usage_race") {
        return reply.status(409).send({ error: "Conflict", reason: "invite_exhausted" })
      }
      throw error
    }

    if (!result.ok) {
      return reply.status(400).send({ error: "Bad Request", reason: result.reason })
    }

    return reply.send({
      ok: true,
      workspaceId: result.workspaceId,
      joined: result.joined,
    })
  })

  fastify.get("/workspaces/:id/members", async (request, reply) => {
    const sharedAccessReason = ensureSharedAccess()
    if (sharedAccessReason) {
      return reply.status(403).send({ error: "Forbidden", reason: sharedAccessReason })
    }

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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      userId = auth.userId
    }

    const workspaceId = (request.params as { id?: string }).id
    if (!workspaceId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_workspace_id" })
    }

    const workspace = await prisma.workspaces.findUnique({
      where: { id: workspaceId },
      select: { id: true, created_by_user_id: true },
    })
    if (!workspace) {
      return reply.status(404).send({ error: "Not Found", reason: "workspace_not_found" })
    }

    const membership = await prisma.workspace_members.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId as string,
        },
      },
    })
    if (!membership) {
      return reply.status(403).send({ error: "Forbidden", reason: "not_a_member" })
    }
    if (workspace.created_by_user_id !== (userId as string)) {
      return reply.status(403).send({ error: "Forbidden", reason: "only_creator_can_view_members" })
    }

    const members = await prisma.workspace_members.findMany({
      where: { workspace_id: workspaceId },
      select: {
        user_id: true,
        role: true,
        users: {
          select: {
            first_name: true,
            username: true,
            telegram_user_id: true,
          },
        },
      },
    })

    const ordered = [...members].sort((left, right) => {
      const leftIsOwner = left.user_id === workspace.created_by_user_id
      const rightIsOwner = right.user_id === workspace.created_by_user_id
      if (leftIsOwner && !rightIsOwner) return -1
      if (!leftIsOwner && rightIsOwner) return 1
      return left.user_id.localeCompare(right.user_id)
    })

    return reply.send({
      members: ordered.map((item) => ({
        userId: item.user_id,
        role: item.user_id === workspace.created_by_user_id ? "owner" : "member",
        firstName: item.users.first_name ?? null,
        username: item.users.username ?? null,
        telegramUserId: item.users.telegram_user_id,
      })),
    })
  })

  fastify.delete("/workspaces/:id/members/:userId", async (request, reply) => {
    const sharedAccessReason = ensureSharedAccess()
    if (sharedAccessReason) {
      return reply.status(403).send({ error: "Forbidden", reason: sharedAccessReason })
    }

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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      userId = auth.userId
    }

    const params = request.params as { id?: string; userId?: string }
    const workspaceId = params.id
    const targetUserId = params.userId
    if (!workspaceId || !targetUserId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_ids" })
    }
    if (targetUserId === (userId as string)) {
      return reply.status(400).send({ error: "Bad Request", reason: "cannot_remove_self" })
    }

    const workspace = await prisma.workspaces.findUnique({
      where: { id: workspaceId },
      select: { id: true, created_by_user_id: true },
    })
    if (!workspace) {
      return reply.status(404).send({ error: "Not Found", reason: "workspace_not_found" })
    }

    const membership = await prisma.workspace_members.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId as string,
        },
      },
    })
    if (!membership) {
      return reply.status(403).send({ error: "Forbidden", reason: "not_a_member" })
    }
    if (workspace.created_by_user_id !== (userId as string)) {
      return reply.status(403).send({ error: "Forbidden", reason: "only_creator_can_remove_members" })
    }
    if (workspace.created_by_user_id === targetUserId) {
      return reply.status(400).send({ error: "Bad Request", reason: "cannot_remove_owner" })
    }

    const removed = await prisma.$transaction(async (tx) => {
      const targetMembership = await tx.workspace_members.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: workspaceId,
            user_id: targetUserId,
          },
        },
      })
      if (!targetMembership) {
        return false
      }

      await tx.workspace_members.delete({
        where: {
          workspace_id_user_id: {
            workspace_id: workspaceId,
            user_id: targetUserId,
          },
        },
      })

      const targetUser = await tx.users.findUnique({
        where: { id: targetUserId },
        select: { active_workspace_id: true },
      })
      if (targetUser?.active_workspace_id === workspaceId) {
        const fallbackMembership = await tx.workspace_members.findFirst({
          where: { user_id: targetUserId },
          orderBy: { workspace_id: "asc" },
          select: { workspace_id: true },
        })
        await tx.users.update({
          where: { id: targetUserId },
          data: { active_workspace_id: fallbackMembership?.workspace_id ?? null },
        })
      }

      return true
    })

    if (!removed) {
      return reply.status(404).send({ error: "Not Found", reason: "member_not_found" })
    }

    return reply.send({ ok: true })
  })

  fastify.post("/workspaces/:id/reset", async (request, reply) => {
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
        return reply.status(401).send({ error: "Unauthorized", reason })
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
        return reply.status(401).send({ error: "Unauthorized", reason })
      }

      const auth = await validateInitData(initDataRaw)
      if (!auth) {
        reason = hasInitData ? "invalid_initdata" : "missing_initdata"
        request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason })
        return reply.status(401).send({ error: "Unauthorized", reason })
      }
      userId = auth.userId
    }

    const workspaceId = (request.params as { id?: string }).id
    if (!workspaceId) {
      return reply.status(400).send({ error: "Bad Request", reason: "missing_workspace_id" })
    }

    const workspace = await prisma.workspaces.findUnique({
      where: { id: workspaceId },
      select: { id: true, created_by_user_id: true },
    })
    if (!workspace) {
      return reply.status(404).send({ error: "Not Found", reason: "workspace_not_found" })
    }

    const membership = await prisma.workspace_members.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId as string,
        },
      },
    })
    if (!membership) {
      return reply.status(403).send({ error: "Forbidden", reason: "not_a_member" })
    }

    if (workspace.created_by_user_id !== (userId as string)) {
      return reply.status(403).send({ error: "Forbidden", reason: "only_creator_can_reset" })
    }

    await prisma.$transaction(async (tx) => {
      await tx.transactions.deleteMany({
        where: { workspace_id: workspaceId },
      })
      await tx.debtors.deleteMany({
        where: { workspace_id: workspaceId },
      })
      await tx.goals.deleteMany({
        where: { workspace_id: workspaceId },
      })
      await tx.accounts.deleteMany({
        where: { workspace_id: workspaceId },
      })
      await tx.income_sources.deleteMany({
        where: { workspace_id: workspaceId },
      })
      await tx.categories.deleteMany({
        where: { workspace_id: workspaceId },
      })
      await seedWorkspaceDefaults(tx, workspaceId)
    })

    return reply.send({ ok: true })
  })
}
