import { FastifyInstance, FastifyPluginOptions } from "fastify"
import jwt from "jsonwebtoken"
import { prisma } from "../db/prisma"
import { TELEGRAM_INITDATA_HEADER, validateInitData } from "../middleware/telegramAuth"
import { env } from "../env"
import { seedWorkspaceDefaults } from "../defaults/workspaceDefaults"

export async function workspacesRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
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
      await tx.goals.deleteMany({
        where: { workspace_id: workspaceId },
      })
      await tx.debtors.deleteMany({
        where: { workspace_id: workspaceId },
      })
      await tx.accounts.deleteMany({
        where: { workspace_id: workspaceId, is_default: false },
      })
      await tx.income_sources.deleteMany({
        where: { workspace_id: workspaceId, is_default: false },
      })
      await tx.categories.deleteMany({
        where: { workspace_id: workspaceId, is_default: false },
      })
      await seedWorkspaceDefaults(tx, workspaceId)
    })

    return reply.send({ ok: true })
  })
}
