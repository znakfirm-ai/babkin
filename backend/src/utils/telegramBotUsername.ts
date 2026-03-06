import { env } from "../env"

const BOT_USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/

let cachedUsername: string | null = null
let loadingPromise: Promise<string | null> | null = null

const normalizeBotUsername = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(/^@/, "")
  if (!BOT_USERNAME_RE.test(trimmed)) return null
  return trimmed
}

const loadTelegramBotUsername = async (): Promise<string | null> => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`)
    if (!response.ok) return null
    const payload = (await response.json()) as { ok?: boolean; result?: { username?: unknown } }
    if (!payload.ok) return null
    return normalizeBotUsername(payload.result?.username)
  } catch {
    return null
  }
}

export const resolveTelegramBotUsername = async (): Promise<string | null> => {
  if (cachedUsername) return cachedUsername
  if (!loadingPromise) {
    loadingPromise = loadTelegramBotUsername().then((username) => {
      if (username) {
        cachedUsername = username
      }
      return username
    })
  }
  const username = await loadingPromise
  loadingPromise = null
  return username
}
