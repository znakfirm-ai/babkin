const TELEGRAM_INVITE_PREFIX = "join_"

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
  return normalizeBotUsername(initDataUnsafe?.receiver?.username)
}

const buildFallbackWebInviteUrl = (inviteCode: string): string => {
  if (typeof window === "undefined") return ""
  const url = new URL(window.location.href)
  url.searchParams.set("invite", inviteCode)
  return url.toString()
}

export const buildSharedWorkspaceInviteUrl = (inviteCode: string): string => {
  const code = inviteCode.trim()
  if (!code) return ""

  const botUsername = resolveTelegramBotUsername()
  if (!botUsername) {
    return buildFallbackWebInviteUrl(code)
  }

  return `https://t.me/${botUsername}/app?startapp=${encodeURIComponent(`${TELEGRAM_INVITE_PREFIX}${code}`)}`
}
