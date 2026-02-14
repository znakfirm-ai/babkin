import { createHmac, createHash } from "crypto"
import { FastifyRequest, FastifyReply } from "fastify"
import { prisma } from "../db/prisma"
import { env } from "../env"

type AuthPayload = {
  userId: string
  telegramUserId: string
  activeWorkspaceId: string
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthPayload
  }
}

type InitDataUser = { id: number; first_name?: string; username?: string }

const headerName = "x-telegram-initdata"

function parseInitData(initData: string | null): URLSearchParams | null {
  if (!initData) return null
  return new URLSearchParams(initData)
}

function computeSignature(params: URLSearchParams): { hash?: string; dataCheckString: string } {
  const pairs: string[] = []
  let hash: string | undefined
  params.forEach((value, key) => {
    if (key === "hash") {
      hash = value
    } else {
      pairs.push(`${key}=${value}`)
    }
  })
  pairs.sort()
  return { hash, dataCheckString: pairs.join("\n") }
}

function isSignatureValid(params: URLSearchParams, botToken: string): boolean {
  const { hash, dataCheckString } = computeSignature(params)
  if (!hash) return false
  const secretKey = createHash("sha256").update(botToken).digest()
  const hmac = createHmac("sha256", secretKey).update(dataCheckString).digest("hex")
  return hmac === hash
}

async function ensureUserAndWorkspace(tgUser: InitDataUser): Promise<AuthPayload> {
  const telegramUserId = String(tgUser.id)
  const firstName = tgUser.first_name ?? null
  const username = tgUser.username ?? null
  const user = await prisma.users.upsert({
    where: { telegram_user_id: telegramUserId },
    create: { telegram_user_id: telegramUserId, first_name: firstName, username },
    update: { first_name: firstName, username },
  })

  let activeWorkspaceId = user.active_workspace_id

  if (!activeWorkspaceId) {
    const personal = await prisma.workspaces.create({
      data: {
        type: "personal",
        name: null,
        created_by_user_id: user.id,
        workspace_members: {
          create: { user_id: user.id, role: "owner" },
        },
      },
    })
    await prisma.users.update({
      where: { id: user.id },
      data: { active_workspace_id: personal.id },
    })
    activeWorkspaceId = personal.id
  }

  return {
    userId: user.id,
    telegramUserId,
    activeWorkspaceId,
  }
}

export async function telegramAuth(request: FastifyRequest, reply: FastifyReply) {
  const initDataRaw = request.headers[headerName] as string | undefined
  const params = parseInitData(initDataRaw ?? null)
  if (!params) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  if (!isSignatureValid(params, env.BOT_TOKEN)) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  const userJson = params.get("user")
  if (!userJson) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  let tgUser: InitDataUser | null = null
  try {
    tgUser = JSON.parse(userJson) as InitDataUser
  } catch {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  if (!tgUser || typeof tgUser.id !== "number") {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  const auth = await ensureUserAndWorkspace(tgUser)
  request.auth = auth
}
