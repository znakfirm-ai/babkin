export type TelegramWebApp = {
  ready: () => void
  expand: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
}

const getTelegram = (): TelegramWebApp | null => {
  if (typeof window === "undefined") return null
  const tg = (window as typeof window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram
  return tg?.WebApp ?? null
}

export const initTelegram = () => {
  const webApp = getTelegram()
  if (!webApp) return false

  try {
    webApp.ready()
    webApp.expand()
    webApp.setHeaderColor?.("#f5f6f8")
    webApp.setBackgroundColor?.("#f5f6f8")
  } catch {
    // ignore errors to avoid breaking in browser
  }

  return true
}

export const isTelegramAvailable = () => Boolean(getTelegram())
