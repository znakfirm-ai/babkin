import React, { Component, useEffect, useRef, useState, useCallback } from "react"
import { useAppStore } from "./store/useAppStore"
import { getAccounts } from "./api/accounts"
import { getCategories } from "./api/categories"
import { getIncomeSources } from "./api/incomeSources"
import { getTransactions } from "./api/transactions"
import HomeScreen from "./screens/HomeScreen"
import OverviewScreen from "./screens/OverviewScreen"
import AddScreen from "./screens/AddScreen"
import SettingsScreen from "./screens/SettingsScreen"
import ReportsScreen from "./screens/ReportsScreen"
import SummaryReportScreen from "./screens/SummaryReportScreen"
import ExpensesByCategoryScreen from "./screens/ExpensesByCategoryScreen"
import BottomNav from "./BottomNav"
import type { NavItem } from "./BottomNav"
import "./BottomNav.css"
import "./App.css"

type Workspace = { id: string; type: "personal" | "family"; name: string | null }
type ScreenKey = NavItem | "report-summary" | "report-expenses-by-category"

type ErrorBoundaryProps = { children: React.ReactNode; externalError: Error | null; onClearExternalError: () => void }
type ErrorBoundaryState = { hasError: boolean; error: Error | null }

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("App crashed", error, info)
  }

  render() {
    const effectiveError = this.props.externalError ?? this.state.error
    const hasError = this.props.externalError !== null || this.state.hasError
    if (!hasError) return this.props.children
    return (
      <div className="app-shell" style={{ padding: 16 }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>App error</h1>
        <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 8 }}>{effectiveError?.message ?? "Unknown error"}</div>
        <pre
          style={{
            background: "#f3f4f6",
            padding: 8,
            borderRadius: 8,
            maxHeight: 180,
            overflow: "auto",
            fontSize: 11,
            lineHeight: 1.3,
          }}
        >
          {effectiveError?.stack}
        </pre>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              this.props.onClearExternalError()
              this.setState({ hasError: false, error: null })
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }
}

function App() {
  const telegramAvailable =
    typeof window !== "undefined" &&
    Boolean((window as typeof window & { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp)
  const [activeNav, setActiveNav] = useState<NavItem>("home")
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("home")
  const [isTelegram, setIsTelegram] = useState(telegramAvailable)
  const baseHeightRef = useRef<number | null>(null)
  const gestureBlockers = useRef<(() => void) | null>(null)
  const initDone = useRef<boolean>(false)
  const [appLoading, setAppLoading] = useState<boolean>(false)
  const [globalError, setGlobalError] = useState<Error | null>(null)
  const [appInitError, setAppInitError] = useState<string | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [appToken, setAppToken] = useState<string | null>(null)
  const [appWorkspaces, setAppWorkspaces] = useState<Workspace[]>([])
  const [appActiveWorkspace, setAppActiveWorkspace] = useState<Workspace | null>(null)
  const { setAccounts, setCategories, setIncomeSources, setTransactions } = useAppStore()

  interface TelegramWebApp {
    ready(): void
    expand(): void
    setHeaderColor?: (color: string) => void
    setBackgroundColor?: (color: string) => void
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    const tg = (window as typeof window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    setIsTelegram(Boolean(tg))

    if (baseHeightRef.current === null) {
      baseHeightRef.current = window.innerHeight
      document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`)
    }

    const handleViewportChange = () => {
      const vv = window.visualViewport
      if (!vv) return
      const baseHeight = baseHeightRef.current ?? window.innerHeight
      const visibleHeight = vv.height + (vv.offsetTop || 0)
      const keyboardLikelyClosed = visibleHeight >= baseHeight * 0.9

      if (keyboardLikelyClosed) {
        const nextHeight = Math.round(window.innerHeight)
        baseHeightRef.current = nextHeight
        document.documentElement.style.setProperty("--app-height", `${nextHeight}px`)
      }
    }

    const vv = window.visualViewport
    vv?.addEventListener("resize", handleViewportChange)
    vv?.addEventListener("scroll", handleViewportChange)
    handleViewportChange()

    if (tg) {
      try {
        tg.ready()
        tg.expand()
        tg.setHeaderColor?.("#f5f6f8")
        tg.setBackgroundColor?.("#f5f6f8")
      } catch {
        // ignore
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("Telegram WebApp не найден — браузерный режим")
    }

    const handleGesture = (e: Event) => {
      e.preventDefault()
    }

    document.addEventListener("gesturestart", handleGesture, { passive: false })
    document.addEventListener("gesturechange", handleGesture, { passive: false })
    document.addEventListener("gestureend", handleGesture, { passive: false })
    gestureBlockers.current = () => {
      document.removeEventListener("gesturestart", handleGesture)
      document.removeEventListener("gesturechange", handleGesture)
      document.removeEventListener("gestureend", handleGesture)
    }

    return () => {
      vv?.removeEventListener("resize", handleViewportChange)
      vv?.removeEventListener("scroll", handleViewportChange)
      gestureBlockers.current?.()
    }
  }, [])

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error instanceof Error) setGlobalError(event.error)
    }
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      if (reason instanceof Error) setGlobalError(reason)
      else setGlobalError(new Error(typeof reason === "string" ? reason : "Unhandled rejection"))
    }
    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)
    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])

  const initApp = useCallback(async () => {
    if (initDone.current) return
    setAppLoading(true)
    setAppInitError(null)
    try {
      let token = localStorage.getItem("auth_access_token")
      if (!token) {
        const initData = window.Telegram?.WebApp?.initData ?? ""
        if (!initData) throw new Error("Нет Telegram initData")
        const res = await fetch("https://babkin.onrender.com/api/v1/auth/telegram", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-InitData": initData,
          },
          body: "{}",
        })
        if (!res.ok) throw new Error(`Auth error: ${res.status}`)
        const data: { accessToken?: string } = await res.json()
        if (!data.accessToken) throw new Error("Auth error")
        token = data.accessToken
        localStorage.setItem("auth_access_token", token)
      }
      setAppToken(token)

      const wsRes = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!wsRes.ok) throw new Error(`Workspaces error: ${wsRes.status}`)
      const wsData: { activeWorkspace: Workspace | null; workspaces: Workspace[] } = await wsRes.json()
      setAppWorkspaces(wsData.workspaces ?? [])
      setAppActiveWorkspace(wsData.activeWorkspace ?? null)

      try {
        const accData = await getAccounts(token)
        setAccounts(
          accData.accounts.map((a) => ({
            id: a.id,
            name: a.name,
            balance: { amount: a.balance, currency: a.currency },
            color: a.color ?? undefined,
          }))
        )

        const catData = await getCategories(token)
        setCategories(catData.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon, budget: c.budget ?? null })))

        const incData = await getIncomeSources(token)
        setIncomeSources(incData.incomeSources.map((s) => ({ id: s.id, name: s.name })))

        const txData = await getTransactions(token)
        setTransactions(
          txData.transactions.map((t) => ({
            id: t.id,
            type: t.kind,
            amount: {
              amount: typeof t.amount === "string" ? Number(t.amount) : t.amount,
              currency: "RUB",
            },
            date: t.happenedAt,
            accountId: t.accountId ?? t.fromAccountId ?? "",
            accountName: t.accountName ?? null,
            fromAccountId: t.fromAccountId ?? undefined,
            fromAccountName: t.fromAccountName ?? null,
            categoryId: t.categoryId ?? undefined,
            incomeSourceId: t.incomeSourceId ?? undefined,
            toAccountId: t.toAccountId ?? undefined,
            toAccountName: t.toAccountName ?? null,
          }))
        )
        setOverviewError(null)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setAppLoading(false)
          return
        }
        setOverviewError("Ошибка загрузки данных")
      }

      initDone.current = true
      setAppLoading(false)
    } catch (err) {
      setAppInitError(err instanceof Error ? err.message : "Init error")
      setAppLoading(false)
    }
  }, [setAccounts, setCategories, setIncomeSources, setTransactions])

  useEffect(() => {
    if (!initDone.current) {
      void initApp()
    }
  }, [initApp])

  const retryOverviewData = useCallback(async () => {
    if (!appToken) {
      setOverviewError("Нет токена")
      return
    }
    try {
      const accData = await getAccounts(appToken)
      setAccounts(
        accData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
        }))
      )

      const catData = await getCategories(appToken)
      setCategories(catData.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon, budget: c.budget ?? null })))

      const incData = await getIncomeSources(appToken)
      setIncomeSources(incData.incomeSources.map((s) => ({ id: s.id, name: s.name })))

      const txData = await getTransactions(appToken)
      setTransactions(
        txData.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: {
            amount: typeof t.amount === "string" ? Number(t.amount) : t.amount,
            currency: "RUB",
          },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          accountName: t.accountName ?? null,
          fromAccountId: t.fromAccountId ?? undefined,
          fromAccountName: t.fromAccountName ?? null,
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
          toAccountName: t.toAccountName ?? null,
        }))
      )
      setOverviewError(null)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setOverviewError("Ошибка загрузки данных")
    }
  }, [appToken, setAccounts, setCategories, setIncomeSources, setTransactions])

  const renderScreen = () => {
    switch (activeScreen) {
      case "home":
        return (
          <HomeScreen initialWorkspaces={appWorkspaces} initialActiveWorkspace={appActiveWorkspace} />
        )
      case "overview":
        return <OverviewScreen overviewError={overviewError} onRetryOverview={retryOverviewData} />
      case "add":
        return <AddScreen />
      case "reports":
        return (
          <ReportsScreen
            onOpenSummary={() => setActiveScreen("report-summary")}
            onOpenExpensesByCategory={() => setActiveScreen("report-expenses-by-category")}
          />
        )
      case "settings":
        return <SettingsScreen />
      case "report-summary":
        return <SummaryReportScreen onBack={() => setActiveScreen("reports")} />
      case "report-expenses-by-category":
        return <ExpensesByCategoryScreen onBack={() => setActiveScreen("reports")} />
      default:
        return <HomeScreen />
    }
  }

  const appShell = appLoading ? (
    <div className="app-shell" style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18 }}>Загрузка...</h1>
      {appInitError ? <div style={{ color: "#b91c1c", marginTop: 8 }}>{appInitError}</div> : null}
    </div>
  ) : appInitError ? (
    <div className="app-shell" style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Init error</h1>
      <div style={{ color: "#b91c1c", marginBottom: 12 }}>{appInitError}</div>
      <button
        type="button"
        onClick={() => {
          initDone.current = false
          setAppInitError(null)
          setAppLoading(false)
        }}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Повторить
      </button>
    </div>
  ) : (
    <div className="app-shell">
      {!isTelegram ? <div className="dev-banner">Telegram WebApp не найден — браузерный режим</div> : null}
      <div className="app-shell__inner">
        {renderScreen()}
        <BottomNav
          active={activeNav}
          onSelect={(key) => {
            setActiveNav(key)
            setActiveScreen(key)
          }}
        />
      </div>
    </div>
  )

  return (
    <AppErrorBoundary
      externalError={globalError}
      onClearExternalError={() => setGlobalError(null)}
    >
      {appShell}
    </AppErrorBoundary>
  )
}

export default App
