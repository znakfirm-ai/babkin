const TELEGRAM_INVITE_PREFIX = "join_"
const DEFAULT_TELEGRAM_BOT_USERNAME = "babkin_finance_bot"

type TelegramInitDataUnsafe = {
  receiver?: {
    username?: string | null
  }
}

const normalizeBotUsername = (value: string | null | undefined): string | null => {
  if (!value) return null
  const trimmed = value.trim().replace(/^@/, "")
  if (!/^[A-Za-z0-9_]{5,32}$/.test(trimmed)) return null
  return trimmed
}

const resolveTelegramBotUsername = (): string | null => {
  const fromEnv = normalizeBotUsername(import.meta.env.VITE_TELEGRAM_BOT_USERNAME)
  if (fromEnv) return fromEnv
  if (typeof window === "undefined") return null

  const initDataUnsafe = window.Telegram?.WebApp?.initDataUnsafe as TelegramInitDataUnsafe | undefined
  return normalizeBotUsername(initDataUnsafe?.receiver?.username) ?? DEFAULT_TELEGRAM_BOT_USERNAME
}

type BuildInviteLinkOptions = {
  botUsername?: string | null
}

export const buildSharedWorkspaceInviteUrl = (inviteCode: string, options?: BuildInviteLinkOptions): string => {
  const code = inviteCode.trim()
  if (!code) return ""
  const botUsername = normalizeBotUsername(options?.botUsername) ?? resolveTelegramBotUsername()
  if (!botUsername) return ""
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(`${TELEGRAM_INVITE_PREFIX}${code}`)}`
}

export const buildTelegramMiniAppInviteUrl = (inviteCode: string, options?: BuildInviteLinkOptions): string => {
  const code = inviteCode.trim()
  if (!code) return ""
  const botUsername = normalizeBotUsername(options?.botUsername) ?? resolveTelegramBotUsername()
  if (!botUsername) return ""
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(`${TELEGRAM_INVITE_PREFIX}${code}`)}`
}
