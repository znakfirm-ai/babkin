import crypto from "crypto"
import { FastifyRequest, FastifyReply } from "fastify"
import { Prisma } from "@prisma/client"
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

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex")
  const bufB = Buffer.from(b, "hex")
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function isSignatureValid(params: URLSearchParams, botToken: string): boolean {
  const { hash, dataCheckString } = computeSignature(params)
  if (!hash) return false
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest()
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")
  return timingSafeEqualHex(hmac, hash)
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
    await seedWorkspaceDefaults(personal.id)
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

async function seedWorkspaceDefaults(workspaceId: string) {
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
  await prisma.$transaction(async (tx) => {
    const accountsCount = await tx.accounts.count({ where: { workspace_id: workspaceId } })
    if (accountsCount === 0) {
      await tx.accounts.createMany({
        data: [
          { workspace_id: workspaceId, name: "Наличные", type: "cash", currency: "RUB", balance: 0, color: "#EEF2F7", icon: "cash" },
          { workspace_id: workspaceId, name: "Банк", type: "bank", currency: "RUB", balance: 0, color: "#2563eb", icon: "bank" },
        ],
        skipDuplicates: true,
      })
    }

    const incomeCount = await tx.income_sources.count({ where: { workspace_id: workspaceId } })
    if (incomeCount === 0) {
      await tx.income_sources.createMany({
        data: [
          { workspace_id: workspaceId, name: "Зарплата", icon: "salary" },
          { workspace_id: workspaceId, name: "Бизнес", icon: "business" },
          { workspace_id: workspaceId, name: "Прочие", icon: "other" },
        ],
        skipDuplicates: true,
      })
    }

    const categoriesCount = await tx.categories.count({ where: { workspace_id: workspaceId } })
    if (categoriesCount === 0) {
      const iconMap: Record<string, string> = {
        "Еда": "groceries",
        "Транспорт": "transport",
        "Дом": "home",
        "Развлечения": "entertainment",
        "Здоровье": "health",
        "Покупки": "shopping",
        "Зарплата": "salary",
        "Бизнес": "business",
        "Подарки": "gift_income",
      }
      await tx.categories.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({
          workspace_id: workspaceId,
          name: c.name,
          kind: c.kind,
          icon: iconMap[c.name] ?? null,
        })),
        skipDuplicates: true,
      })
    }

    const goalsCount = await tx.goals.count({ where: { workspace_id: workspaceId } })
    if (goalsCount === 0) {
      await tx.goals.create({
        data: {
          workspace_id: workspaceId,
          name: "Моя цель",
          icon: "target",
          target_amount: new Prisma.Decimal(0),
        },
      })
    }

    // TODO: add default debts/credits once the model and endpoints are available
  })
}

export async function telegramAuth(request: FastifyRequest, reply: FastifyReply) {
  const initDataRaw = request.headers[TELEGRAM_INITDATA_HEADER] as string | undefined
  const auth = await validateInitData(initDataRaw)
  if (!auth) {
    return reply.status(401).send({ error: "Unauthorized" })
  }
  request.auth = auth
}
