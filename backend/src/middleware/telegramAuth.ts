import crypto from "crypto"
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

export const TELEGRAM_INITDATA_HEADER = "x-telegram-initdata"

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
  const secretKey = crypto.createHash("sha256").update(botToken).digest()
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")
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

export async function validateInitData(initDataRaw: string | undefined): Promise<AuthPayload | null> {
  const params = parseInitData(initDataRaw ?? null)
  if (!params) {
    return null
  }

  if (!isSignatureValid(params, env.BOT_TOKEN)) {
    return null
  }

  const userJson = params.get("user")
  if (!userJson) {
    return null
  }

  let tgUser: InitDataUser | null = null
  try {
    tgUser = JSON.parse(userJson) as InitDataUser
  } catch {
    return null
  }

  if (!tgUser || typeof tgUser.id !== "number") {
    return null
  }

  return ensureUserAndWorkspace(tgUser)
}

export async function telegramAuth(request: FastifyRequest, reply: FastifyReply) {
  const initDataRaw = request.headers[TELEGRAM_INITDATA_HEADER] as string | undefined
  const auth = await validateInitData(initDataRaw)
  if (!auth) {
    return reply.status(401).send({ error: "Unauthorized" })
  }
  request.auth = auth
}
