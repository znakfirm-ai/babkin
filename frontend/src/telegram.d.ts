declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        initDataUnsafe?: unknown
        ready?: () => void
        expand?: () => void
        setHeaderColor?: (color: string) => void
        setBackgroundColor?: (color: string) => void
      }
    }
  }
}

export {}
