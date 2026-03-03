import React, { Component, useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useAppStore } from "./store/useAppStore"
import { getAccounts } from "./api/accounts"
import { getCategories } from "./api/categories"
import { getIncomeSources } from "./api/incomeSources"
import { getTransactions } from "./api/transactions"
import { getGoals } from "./api/goals"
import { getDebtors } from "./api/debtors"
import HomeScreen from "./screens/HomeScreen"
import OverviewScreen from "./screens/OverviewScreen"
import AddScreen from "./screens/AddScreen"
import QuickAddScreen from "./screens/QuickAddScreen"
import SettingsScreen from "./screens/SettingsScreen"
import IconPreviewScreen from "./screens/IconPreviewScreen"
import ReportsScreen from "./screens/ReportsScreen"
import SummaryReportScreen from "./screens/SummaryReportScreen"
import ExpensesByCategoryScreen from "./screens/ExpensesByCategoryScreen"
import BottomNav from "./BottomNav"
import type { NavItem } from "./BottomNav"
import { AppIcon } from "./components/AppIcon"
import "./BottomNav.css"
import "./App.css"

type Workspace = { id: string; type: "personal" | "family"; name: string | null }
type SpaceKey = Workspace["type"]
type BannerLoadStatus = "idle" | "loading" | "success" | "error"
type OverviewUiPhase = "idle" | "loading" | "ready" | "error"
type ScreenKey = NavItem | "report-summary" | "report-expenses-by-category" | "quick-add" | "icons-preview" | "receivables"
type GoalsListMode = "goals" | "debtsReceivable" | "debtsPayable"
type QuickAddTab = "expense" | "income" | "transfer" | "debt" | "goal"
type QuickAddDebtAction = "receivable" | "payable"
type TelegramUser = { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number | string } } } } }
type WorkspaceMeta = { name?: string; icon?: string }
type WorkspaceModalView = "list" | "settings" | "edit-name" | "edit-icon"

const ACTIVE_SPACE_KEY_STORAGE = "activeSpaceKey"
const WORKSPACE_META_STORAGE_PREFIX = "workspaceMetaByKey"
const WORKSPACE_NAME_LIMIT = 32
const DEFAULT_WORKSPACE_META: Record<SpaceKey, WorkspaceMeta> = {
  personal: { name: "", icon: "" },
  family: { name: "", icon: "" },
}

const getWorkspaceMetaStorageKey = () => {
  if (typeof window === "undefined") return `${WORKSPACE_META_STORAGE_PREFIX}:guest`
  const userId = (window as unknown as TelegramUser).Telegram?.WebApp?.initDataUnsafe?.user?.id
  const normalizedUserId = typeof userId === "number" || typeof userId === "string" ? String(userId) : "guest"
  return `${WORKSPACE_META_STORAGE_PREFIX}:${normalizedUserId}`
}

const normalizeWorkspaceIcon = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const symbol = Array.from(trimmed)[0]
  return symbol ? symbol.trim() : ""
}
const buildWorkspaceFallbackLabel = (spaceKey: SpaceKey) => (spaceKey === "family" ? "Семейный" : "Личный")
const readWorkspaceMeta = (storageKey: string): Record<SpaceKey, WorkspaceMeta> => {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_META
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return DEFAULT_WORKSPACE_META
    const parsed = JSON.parse(raw) as Partial<Record<SpaceKey, WorkspaceMeta>>
    return {
      personal: {
        name: typeof parsed.personal?.name === "string" ? parsed.personal.name : "",
        icon: typeof parsed.personal?.icon === "string" ? parsed.personal.icon : "",
      },
      family: {
        name: typeof parsed.family?.name === "string" ? parsed.family.name : "",
        icon: typeof parsed.family?.icon === "string" ? parsed.family.icon : "",
      },
    }
  } catch {
    return DEFAULT_WORKSPACE_META
  }
}

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
  const workspaceMetaStorageKey = getWorkspaceMetaStorageKey()
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
  const [appActiveSpaceKey, setAppActiveSpaceKey] = useState<SpaceKey>(() => {
    if (typeof window === "undefined") return "personal"
    const stored = localStorage.getItem(ACTIVE_SPACE_KEY_STORAGE)
    return stored === "family" ? "family" : "personal"
  })
  const [workspaceMetaByKey, setWorkspaceMetaByKey] = useState<Record<SpaceKey, WorkspaceMeta>>(() => readWorkspaceMeta(workspaceMetaStorageKey))
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false)
  const [workspaceModalView, setWorkspaceModalView] = useState<WorkspaceModalView>("list")
  const [workspaceSettingsTargetKey, setWorkspaceSettingsTargetKey] = useState<SpaceKey>("personal")
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("")
  const [workspaceIconDraft, setWorkspaceIconDraft] = useState("")
  const [isWorkspaceFamilySheetOpen, setIsWorkspaceFamilySheetOpen] = useState(false)
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false)
  const [switchingToWorkspaceId, setSwitchingToWorkspaceId] = useState<string | null>(null)
  const workspaceSwitchRequestRef = useRef(0)
  const isSwitchingWorkspaceRef = useRef(false)
  const activeSpaceKeyRef = useRef<SpaceKey>(appActiveSpaceKey)
  const [overviewAppliedSpaceKey, setOverviewAppliedSpaceKey] = useState<SpaceKey | null>(null)
  const [, setOverviewStatusBySpaceKey] = useState<Record<SpaceKey, BannerLoadStatus>>({
    personal: "idle",
    family: "idle",
  })
  const [overviewUiPhaseBySpaceKey, setOverviewUiPhaseBySpaceKey] = useState<Record<SpaceKey, OverviewUiPhase>>({
    personal: "idle",
    family: "idle",
  })
  const [pendingCategoryOpenId, setPendingCategoryOpenId] = useState<string | null>(null)
  const [pendingReturnToReport, setPendingReturnToReport] = useState(false)
  const [autoOpenExpensesSheet, setAutoOpenExpensesSheet] = useState(false)
  const [pendingIncomeSourceOpenId, setPendingIncomeSourceOpenId] = useState<string | null>(null)
  const [pendingReturnToIncomeReport, setPendingReturnToIncomeReport] = useState(false)
  const [autoOpenIncomeSheet, setAutoOpenIncomeSheet] = useState(false)
  const [skipGoalsListRefetch, setSkipGoalsListRefetch] = useState(false)
  const [goalsListMode, setGoalsListMode] = useState<GoalsListMode>("goals")
  const [quickAddInitialTab, setQuickAddInitialTab] = useState<QuickAddTab>("expense")
  const [quickAddInitialIncomeSourceId, setQuickAddInitialIncomeSourceId] = useState<string | null>(null)
  const [quickAddInitialCategoryId, setQuickAddInitialCategoryId] = useState<string | null>(null)
  const [quickAddInitialDebtAction, setQuickAddInitialDebtAction] = useState<QuickAddDebtAction>("receivable")
  const [autoOpenGoalsList, setAutoOpenGoalsList] = useState(false)
  const [autoOpenGoalCreate, setAutoOpenGoalCreate] = useState(false)
  const [savedIncomeReportState, setSavedIncomeReportState] = useState<{
    periodMode: "day" | "week" | "month" | "quarter" | "year" | "custom"
    monthOffset: number
    bannerOffset: number
    customFrom: string
    customTo: string
    singleDay: string
  } | null>(null)
  const { setAccounts, setCategories, setIncomeSources, setTransactions, setGoals, setDebtors } = useAppStore()
  const overviewInFlightBySpaceRef = useRef<Partial<Record<SpaceKey, boolean>>>({})
  const overviewRefreshRunRef = useRef(0)

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

  useEffect(() => {
    activeSpaceKeyRef.current = appActiveSpaceKey
  }, [appActiveSpaceKey])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.debug("[nav] activeScreen", activeScreen)
  }, [activeScreen])

  const setOverviewStatus = useCallback((spaceKey: SpaceKey, status: BannerLoadStatus) => {
    setOverviewStatusBySpaceKey((prev) => {
      if (prev[spaceKey] === status) return prev
      return { ...prev, [spaceKey]: status }
    })
  }, [])
  const setOverviewUiPhase = useCallback((spaceKey: SpaceKey, phase: OverviewUiPhase) => {
    setOverviewUiPhaseBySpaceKey((prev) => {
      if (prev[spaceKey] === phase) return prev
      return { ...prev, [spaceKey]: phase }
    })
  }, [])
  const activeOverviewUiPhase = overviewUiPhaseBySpaceKey[appActiveSpaceKey]
  const isOverviewScreenActive = activeScreen === "overview" || activeScreen === "receivables"

  const isStaleOverviewReload = useCallback((spaceKey: SpaceKey, requestId?: number) => {
    if (requestId !== undefined && workspaceSwitchRequestRef.current !== requestId) return true
    return activeSpaceKeyRef.current !== spaceKey
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
      if (wsData.activeWorkspace?.type) {
        activeSpaceKeyRef.current = wsData.activeWorkspace.type
        setAppActiveSpaceKey(wsData.activeWorkspace.type)
        localStorage.setItem(ACTIVE_SPACE_KEY_STORAGE, wsData.activeWorkspace.type)
        setOverviewStatus(wsData.activeWorkspace.type, "loading")
        setOverviewUiPhase(wsData.activeWorkspace.type, "loading")
      }

      try {
        const accData = await getAccounts(token)
        const mappedAccounts = accData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        }))
        setAccounts(mappedAccounts)

        const catData = await getCategories(token)
        const mappedCategories = catData.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon, budget: c.budget ?? null }))
        setCategories(mappedCategories)

        const incData = await getIncomeSources(token)
        const mappedIncomeSources = incData.incomeSources.map((s) => ({ id: s.id, name: s.name, icon: s.icon ?? null }))
        setIncomeSources(mappedIncomeSources)

        const goalsData = await getGoals(token)
        const mappedGoals = goalsData.goals.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          targetAmount: Number(g.targetAmount),
          currentAmount: Number(g.currentAmount),
          status: g.status,
        }))
        setGoals(mappedGoals)

        const debtorsData = await getDebtors(token)
        const mappedDebtors = debtorsData.debtors.map((d) => ({
          id: d.id,
          name: d.name,
          icon: d.icon,
          issuedDate: d.issuedAt.slice(0, 10),
          loanAmount: Number(d.principalAmount),
          dueDate: d.dueAt ? d.dueAt.slice(0, 10) : "",
          returnAmount: d.payoffAmount === null ? Number(d.principalAmount) : Number(d.payoffAmount),
          status: d.status,
          direction: d.direction ?? "receivable",
        }))
        setDebtors(mappedDebtors)

        const txData = await getTransactions(token)
        const mappedTransactions = txData.transactions.map((t) => ({
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
            goalId: t.goalId ?? undefined,
            goalName: t.goalName ?? null,
            debtorId: t.debtorId ?? undefined,
            debtorName: t.debtorName ?? null,
          }))
        setTransactions(mappedTransactions)
        setOverviewError(null)
        if (wsData.activeWorkspace?.type) {
          setOverviewAppliedSpaceKey(wsData.activeWorkspace.type)
          setOverviewStatus(wsData.activeWorkspace.type, "success")
          setOverviewUiPhase(wsData.activeWorkspace.type, "ready")
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setAppLoading(false)
          return
        }
        if (wsData.activeWorkspace?.type) {
          setOverviewStatus(wsData.activeWorkspace.type, "error")
          setOverviewUiPhase(wsData.activeWorkspace.type, "error")
        }
        setOverviewError("Ошибка загрузки данных")
      }

      initDone.current = true
      setAppLoading(false)
    } catch (err) {
      setAppInitError(err instanceof Error ? err.message : "Init error")
      setAppLoading(false)
    }
  }, [setAccounts, setCategories, setDebtors, setGoals, setIncomeSources, setOverviewStatus, setOverviewUiPhase, setTransactions])

  useEffect(() => {
    if (!initDone.current) {
      void initApp()
    }
  }, [initApp])

  const retryOverviewData = useCallback(
    async (options?: { spaceKey?: SpaceKey; requestId?: number; markLoading?: boolean }) => {
      const targetSpaceKey = options?.spaceKey ?? activeSpaceKeyRef.current
      const requestId = options?.requestId
      const markLoading = options?.markLoading ?? true
      if (overviewInFlightBySpaceRef.current[targetSpaceKey]) return false
      if (!appToken) {
        setOverviewError("Нет токена")
        setOverviewStatus(targetSpaceKey, "error")
        setOverviewUiPhase(targetSpaceKey, "error")
        return false
      }
      overviewInFlightBySpaceRef.current[targetSpaceKey] = true
      const refreshRunId = overviewRefreshRunRef.current + 1
      overviewRefreshRunRef.current = refreshRunId
      if (import.meta.env.DEV) {
        console.debug("[overview] refresh:start", {
          runId: refreshRunId,
          spaceKey: targetSpaceKey,
        })
      }
      if (markLoading) {
        setOverviewStatus(targetSpaceKey, "loading")
        setOverviewUiPhase(targetSpaceKey, "loading")
      }
      const isStale = () => isStaleOverviewReload(targetSpaceKey, requestId)
      try {
        const accData = await getAccounts(appToken)
        if (isStale()) {
          return false
        }
        const mappedAccounts = accData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        }))
        setAccounts(mappedAccounts)

        const catData = await getCategories(appToken)
        if (isStale()) {
          return false
        }
        const mappedCategories = catData.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon, budget: c.budget ?? null }))
        setCategories(mappedCategories)

        const incData = await getIncomeSources(appToken)
        if (isStale()) {
          return false
        }
        const mappedIncomeSources = incData.incomeSources.map((s) => ({ id: s.id, name: s.name, icon: s.icon ?? null }))
        setIncomeSources(mappedIncomeSources)

        const goalsData = await getGoals(appToken)
        if (isStale()) {
          return false
        }
        const mappedGoals = goalsData.goals.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          targetAmount: Number(g.targetAmount),
          currentAmount: Number(g.currentAmount),
          status: g.status,
        }))
        setGoals(mappedGoals)

        const debtorsData = await getDebtors(appToken)
        if (isStale()) {
          return false
        }
        const mappedDebtors = debtorsData.debtors.map((d) => ({
          id: d.id,
          name: d.name,
          icon: d.icon,
          issuedDate: d.issuedAt.slice(0, 10),
          loanAmount: Number(d.principalAmount),
          dueDate: d.dueAt ? d.dueAt.slice(0, 10) : "",
          returnAmount: d.payoffAmount === null ? Number(d.principalAmount) : Number(d.payoffAmount),
          status: d.status,
          direction: d.direction ?? "receivable",
        }))
        setDebtors(mappedDebtors)

        const txData = await getTransactions(appToken)
        if (isStale()) {
          return false
        }
        const mappedTransactions = txData.transactions.map((t) => ({
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
          goalId: t.goalId ?? undefined,
          goalName: t.goalName ?? null,
          debtorId: t.debtorId ?? undefined,
          debtorName: t.debtorName ?? null,
        }))
        setTransactions(mappedTransactions)
        if (isStale()) {
          return false
        }
        setOverviewAppliedSpaceKey(targetSpaceKey)
        setOverviewStatus(targetSpaceKey, "success")
        setOverviewUiPhase(targetSpaceKey, "ready")
        setOverviewError(null)
        return true
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return false
        if (isStale()) {
          return false
        }
        setOverviewStatus(targetSpaceKey, "error")
        setOverviewUiPhase(targetSpaceKey, "error")
        setOverviewError("Ошибка загрузки данных")
        return false
      } finally {
        overviewInFlightBySpaceRef.current[targetSpaceKey] = false
        if (import.meta.env.DEV) {
          console.debug("[overview] refresh:end", {
            runId: refreshRunId,
            spaceKey: targetSpaceKey,
            status: overviewInFlightBySpaceRef.current[targetSpaceKey] ? "loading" : "idle",
          })
        }
      }
    },
    [appToken, isStaleOverviewReload, setAccounts, setCategories, setDebtors, setGoals, setIncomeSources, setOverviewStatus, setOverviewUiPhase, setTransactions],
  )

  const ensureOverviewReady = useCallback(
    async (options?: { spaceKey?: SpaceKey; requestId?: number }) => {
      const targetSpaceKey = options?.spaceKey ?? activeSpaceKeyRef.current
      const phase = overviewUiPhaseBySpaceKey[targetSpaceKey]
      if (overviewInFlightBySpaceRef.current[targetSpaceKey]) return false
      if (phase === "loading") return false
      if (phase === "error") return false
      if (overviewAppliedSpaceKey === targetSpaceKey && phase === "ready") return true
      setOverviewStatus(targetSpaceKey, "loading")
      setOverviewUiPhase(targetSpaceKey, "loading")
      return retryOverviewData({
        spaceKey: targetSpaceKey,
        requestId: options?.requestId,
        markLoading: false,
      })
    },
    [overviewAppliedSpaceKey, overviewUiPhaseBySpaceKey, retryOverviewData, setOverviewStatus, setOverviewUiPhase],
  )

  useEffect(() => {
    if (!isOverviewScreenActive) return
    if (!appToken || appLoading) return
    void ensureOverviewReady({ spaceKey: appActiveSpaceKey })
  }, [appActiveSpaceKey, appLoading, appToken, ensureOverviewReady, isOverviewScreenActive])

  const prevScreen = useRef<ScreenKey>("overview")
  const persistWorkspaceMeta = useCallback((next: Record<SpaceKey, WorkspaceMeta>) => {
    if (typeof window === "undefined") return
    localStorage.setItem(workspaceMetaStorageKey, JSON.stringify(next))
  }, [workspaceMetaStorageKey])

  const updateWorkspaceMeta = useCallback(
    (spaceKey: SpaceKey, patch: Partial<WorkspaceMeta>) => {
      setWorkspaceMetaByKey((prev) => {
        const next: Record<SpaceKey, WorkspaceMeta> = {
          personal: { ...prev.personal },
          family: { ...prev.family },
        }
        next[spaceKey] = {
          name: typeof patch.name === "string" ? patch.name : prev[spaceKey].name ?? "",
          icon: typeof patch.icon === "string" ? patch.icon : prev[spaceKey].icon ?? "",
        }
        persistWorkspaceMeta(next)
        return next
      })
    },
    [persistWorkspaceMeta],
  )

  useEffect(() => {
    setWorkspaceMetaByKey(readWorkspaceMeta(workspaceMetaStorageKey))
  }, [workspaceMetaStorageKey])

  const personalWorkspace = appWorkspaces.find((workspace) => workspace.type === "personal") ?? null
  const familyWorkspace = appWorkspaces.find((workspace) => workspace.type === "family") ?? null
  const personalAccountLabel = useMemo(() => {
    const customName = workspaceMetaByKey.personal.name?.trim() ?? ""
    if (customName) return customName
    const workspaceName = personalWorkspace?.name?.trim()
    if (workspaceName) return workspaceName
    return buildWorkspaceFallbackLabel("personal")
  }, [personalWorkspace?.name, workspaceMetaByKey.personal.name])
  const familyAccountLabel = useMemo(() => {
    const customName = workspaceMetaByKey.family.name?.trim() ?? ""
    if (customName) return customName
    const workspaceName = familyWorkspace?.name?.trim()
    if (workspaceName) return workspaceName
    return buildWorkspaceFallbackLabel("family")
  }, [familyWorkspace?.name, workspaceMetaByKey.family.name])
  const personalAccountIcon = useMemo(() => {
    const customIcon = normalizeWorkspaceIcon(workspaceMetaByKey.personal.icon ?? "")
    if (customIcon) return customIcon
    return Array.from(personalAccountLabel.trim())[0]?.toLocaleUpperCase("ru-RU") ?? "Л"
  }, [personalAccountLabel, workspaceMetaByKey.personal.icon])
  const familyAccountIcon = useMemo(() => {
    const customIcon = normalizeWorkspaceIcon(workspaceMetaByKey.family.icon ?? "")
    if (customIcon) return customIcon
    return Array.from(familyAccountLabel.trim())[0]?.toLocaleUpperCase("ru-RU") ?? "С"
  }, [familyAccountLabel, workspaceMetaByKey.family.icon])
  const accountLabel = appActiveSpaceKey === "family" ? familyAccountLabel : personalAccountLabel
  const accountIcon = appActiveSpaceKey === "family" ? familyAccountIcon : personalAccountIcon
  const canOpenWorkspaceSwitcher = appWorkspaces.length > 0

  const closeWorkspaceModal = useCallback(() => {
    setWorkspaceModalView("list")
    setIsWorkspaceModalOpen(false)
  }, [])

  const openWorkspaceModal = useCallback(() => {
    if (!canOpenWorkspaceSwitcher) return
    const targetKey: SpaceKey = appActiveSpaceKey === "family" ? "family" : "personal"
    setWorkspaceSettingsTargetKey(targetKey)
    setWorkspaceNameDraft(targetKey === "family" ? familyAccountLabel : personalAccountLabel)
    setWorkspaceIconDraft(targetKey === "family" ? workspaceMetaByKey.family.icon ?? "" : workspaceMetaByKey.personal.icon ?? "")
    setWorkspaceModalView("list")
    setIsWorkspaceModalOpen(true)
  }, [appActiveSpaceKey, canOpenWorkspaceSwitcher, familyAccountLabel, personalAccountLabel, workspaceMetaByKey.family.icon, workspaceMetaByKey.personal.icon])

  const openWorkspaceSettings = useCallback(
    (targetKey: SpaceKey) => {
      setWorkspaceSettingsTargetKey(targetKey)
      setWorkspaceNameDraft(targetKey === "family" ? familyAccountLabel : personalAccountLabel)
      setWorkspaceIconDraft(targetKey === "family" ? workspaceMetaByKey.family.icon ?? "" : workspaceMetaByKey.personal.icon ?? "")
      setWorkspaceModalView("settings")
    },
    [familyAccountLabel, personalAccountLabel, workspaceMetaByKey.family.icon, workspaceMetaByKey.personal.icon],
  )

  const openWorkspaceNameEditor = useCallback(() => {
    const currentLabel = workspaceSettingsTargetKey === "family" ? familyAccountLabel : personalAccountLabel
    setWorkspaceNameDraft(currentLabel)
    setWorkspaceModalView("edit-name")
  }, [familyAccountLabel, personalAccountLabel, workspaceSettingsTargetKey])

  const openWorkspaceIconEditor = useCallback(() => {
    const currentIcon = workspaceSettingsTargetKey === "family" ? workspaceMetaByKey.family.icon ?? "" : workspaceMetaByKey.personal.icon ?? ""
    setWorkspaceIconDraft(currentIcon)
    setWorkspaceModalView("edit-icon")
  }, [workspaceMetaByKey.family.icon, workspaceMetaByKey.personal.icon, workspaceSettingsTargetKey])

  const goBackWorkspaceModal = useCallback(() => {
    if (workspaceModalView === "edit-name" || workspaceModalView === "edit-icon") {
      setWorkspaceModalView("settings")
      return
    }
    setWorkspaceModalView("list")
  }, [workspaceModalView])

  const normalizedWorkspaceNameDraft = useMemo(
    () => workspaceNameDraft.trim().slice(0, WORKSPACE_NAME_LIMIT),
    [workspaceNameDraft],
  )
  const canSaveWorkspaceName = normalizedWorkspaceNameDraft.length > 0

  const handleSaveWorkspaceName = useCallback(() => {
    if (!canSaveWorkspaceName) return
    updateWorkspaceMeta(workspaceSettingsTargetKey, { name: normalizedWorkspaceNameDraft })
    setWorkspaceModalView("settings")
  }, [canSaveWorkspaceName, normalizedWorkspaceNameDraft, updateWorkspaceMeta, workspaceSettingsTargetKey])

  const handleSaveWorkspaceIcon = useCallback(() => {
    updateWorkspaceMeta(workspaceSettingsTargetKey, { icon: normalizeWorkspaceIcon(workspaceIconDraft) })
    setWorkspaceModalView("settings")
  }, [updateWorkspaceMeta, workspaceIconDraft, workspaceSettingsTargetKey])

  const setActiveWorkspaceRemote = useCallback(
    async (workspace: Workspace, token: string) => {
      if (isSwitchingWorkspaceRef.current) return
      const requestId = workspaceSwitchRequestRef.current + 1
      workspaceSwitchRequestRef.current = requestId
      isSwitchingWorkspaceRef.current = true
      setIsSwitchingWorkspace(true)
      setSwitchingToWorkspaceId(workspace.id)
      try {
        const response = await fetch("https://babkin.onrender.com/api/v1/workspaces/active", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ workspaceId: workspace.id }),
        })
        if (!response.ok) return
        const data: { activeWorkspace: Workspace } = await response.json()
        if (workspaceSwitchRequestRef.current !== requestId) return
        setAppActiveWorkspace(data.activeWorkspace)
        activeSpaceKeyRef.current = data.activeWorkspace.type
        setAppActiveSpaceKey(data.activeWorkspace.type)
        localStorage.setItem(ACTIVE_SPACE_KEY_STORAGE, data.activeWorkspace.type)
        setOverviewStatus(data.activeWorkspace.type, "loading")
        setOverviewUiPhase(data.activeWorkspace.type, "loading")
        if (overviewAppliedSpaceKey !== data.activeWorkspace.type) {
          setOverviewAppliedSpaceKey(null)
        }
        closeWorkspaceModal()
        setIsWorkspaceFamilySheetOpen(false)
        await ensureOverviewReady({
          spaceKey: data.activeWorkspace.type,
          requestId,
        })
      } catch {
        if (workspaceSwitchRequestRef.current !== requestId) return
        setOverviewStatus(workspace.type, "error")
        setOverviewUiPhase(workspace.type, "error")
      } finally {
        if (workspaceSwitchRequestRef.current !== requestId) return
        isSwitchingWorkspaceRef.current = false
        setIsSwitchingWorkspace(false)
        setSwitchingToWorkspaceId(null)
      }
    },
    [closeWorkspaceModal, ensureOverviewReady, overviewAppliedSpaceKey, setOverviewStatus, setOverviewUiPhase],
  )

  const createFamilyWorkspace = useCallback(async () => {
    if (!appToken) return
    try {
      const response = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${appToken}`,
        },
        body: JSON.stringify({ type: "family", name: null }),
      })
      if (!response.ok) return
      const refreshed = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${appToken}` },
      })
      if (!refreshed.ok) return
      const data: { activeWorkspace: Workspace | null; workspaces: Workspace[] } = await refreshed.json()
      setAppWorkspaces(data.workspaces ?? [])
      if (data.activeWorkspace) {
        activeSpaceKeyRef.current = data.activeWorkspace.type
        setAppActiveWorkspace(data.activeWorkspace)
        setAppActiveSpaceKey(data.activeWorkspace.type)
        localStorage.setItem(ACTIVE_SPACE_KEY_STORAGE, data.activeWorkspace.type)
      }
      const family = (data.workspaces ?? []).find((workspace) => workspace.type === "family")
      if (family) {
        await setActiveWorkspaceRemote(family, appToken)
      } else {
        setIsWorkspaceFamilySheetOpen(false)
      }
    } catch {
      // ignore
    }
  }, [appToken, setActiveWorkspaceRemote])
  const openQuickAddScreen = useCallback(
    (
      tab: QuickAddTab,
      incomeSourceId: string | null = null,
      categoryId: string | null = null,
      debtAction: QuickAddDebtAction = "receivable",
    ) => {
      setQuickAddInitialTab(tab)
      setQuickAddInitialIncomeSourceId(incomeSourceId)
      setQuickAddInitialCategoryId(categoryId)
      setQuickAddInitialDebtAction(debtAction)
      prevScreen.current = activeScreen
      setActiveNav("add")
      setActiveScreen("quick-add")
    },
    [activeScreen],
  )
  const overviewDataReadyForActiveSpace =
    activeOverviewUiPhase === "ready" && overviewAppliedSpaceKey === appActiveSpaceKey
  const overviewDataLoadingForActiveSpace =
    activeOverviewUiPhase === "loading" || activeOverviewUiPhase === "idle"

  const renderScreen = () => {
    switch (activeScreen) {
      case "home":
        return (
          <HomeScreen
            disableDataFetch
            initialWorkspaces={appWorkspaces}
            initialActiveWorkspace={appActiveWorkspace}
            workspaceAccountLabel={accountLabel}
            workspaceAccountIcon={accountIcon}
            canOpenWorkspaceSwitcher={canOpenWorkspaceSwitcher}
            onOpenWorkspaceSwitcher={openWorkspaceModal}
            onOpenQuickAdd={(tab) => {
              if (tab === "debt") {
                openQuickAddScreen("debt", null, null, "receivable")
                return
              }
              openQuickAddScreen(tab)
            }}
          />
        )
      case "overview":
        return (
          <OverviewScreen
            overviewError={overviewError}
            onRetryOverview={async () => {
              await retryOverviewData()
            }}
            externalCategoryId={pendingCategoryOpenId}
            onConsumeExternalCategory={() => setPendingCategoryOpenId(null)}
            returnToReport={pendingReturnToReport}
            onReturnToReport={() => {
              setPendingReturnToReport(false)
              setActiveNav("reports")
              setActiveScreen("reports")
              setAutoOpenExpensesSheet(true)
            }}
            externalIncomeSourceId={pendingIncomeSourceOpenId}
            onConsumeExternalIncomeSource={() => setPendingIncomeSourceOpenId(null)}
            returnToIncomeReport={pendingReturnToIncomeReport}
            onReturnToIncomeReport={() => {
              setPendingReturnToIncomeReport(false)
              setActiveNav("reports")
              setActiveScreen("reports")
              setAutoOpenIncomeSheet(true)
            }}
            onOpenGoalsList={() => {
              setGoalsListMode("goals")
              setAutoOpenGoalsList(true)
              setActiveNav("overview")
              setActiveScreen("overview")
            }}
            onOpenReceivables={() => {
              setGoalsListMode("debtsReceivable")
              setAutoOpenGoalsList(true)
              setActiveNav("overview")
              setActiveScreen("receivables")
            }}
            onOpenPayables={() => {
              setGoalsListMode("debtsPayable")
              setAutoOpenGoalsList(true)
              setActiveNav("overview")
              setActiveScreen("receivables")
            }}
            onOpenQuickAddTransfer={() => {
              openQuickAddScreen("transfer")
            }}
            onOpenQuickAddIncome={(incomeSourceId) => {
              openQuickAddScreen("income", incomeSourceId)
            }}
            onOpenQuickAddExpense={(categoryId) => {
              openQuickAddScreen("expense", null, categoryId)
            }}
            onOpenQuickAddGoal={() => {
              openQuickAddScreen("goal")
            }}
            onOpenQuickAddDebtReceivable={() => {
              openQuickAddScreen("debt", null, null, "receivable")
            }}
            onOpenQuickAddDebtPayable={() => {
              openQuickAddScreen("debt", null, null, "payable")
            }}
            autoOpenGoalsList={autoOpenGoalsList}
            onConsumeAutoOpenGoalsList={() => {
              setAutoOpenGoalsList(false)
              setSkipGoalsListRefetch(false)
            }}
            autoOpenGoalCreate={autoOpenGoalCreate}
            onConsumeAutoOpenGoalCreate={() => setAutoOpenGoalCreate(false)}
            goalsListMode={goalsListMode}
            skipGoalsListRefetch={skipGoalsListRefetch}
            workspaceAccountLabel={accountLabel}
            workspaceAccountIcon={accountIcon}
            canOpenWorkspaceSwitcher={canOpenWorkspaceSwitcher}
            onOpenWorkspaceSwitcher={openWorkspaceModal}
            isDataReadyForActiveSpace={overviewDataReadyForActiveSpace}
            isDataLoadingForActiveSpace={overviewDataLoadingForActiveSpace}
          />
        )
      case "receivables":
        return (
          <OverviewScreen
            overviewError={overviewError}
            onRetryOverview={async () => {
              await retryOverviewData()
            }}
            externalCategoryId={pendingCategoryOpenId}
            onConsumeExternalCategory={() => setPendingCategoryOpenId(null)}
            returnToReport={pendingReturnToReport}
            onReturnToReport={() => {
              setPendingReturnToReport(false)
              setActiveNav("reports")
              setActiveScreen("reports")
              setAutoOpenExpensesSheet(true)
            }}
            externalIncomeSourceId={pendingIncomeSourceOpenId}
            onConsumeExternalIncomeSource={() => setPendingIncomeSourceOpenId(null)}
            returnToIncomeReport={pendingReturnToIncomeReport}
            onReturnToIncomeReport={() => {
              setPendingReturnToIncomeReport(false)
              setActiveNav("reports")
              setActiveScreen("reports")
              setAutoOpenIncomeSheet(true)
            }}
            onOpenGoalsList={() => {
              setGoalsListMode("goals")
              setAutoOpenGoalsList(true)
              setActiveNav("overview")
              setActiveScreen("overview")
            }}
            onOpenReceivables={() => {
              setGoalsListMode("debtsReceivable")
              setAutoOpenGoalsList(true)
              setActiveNav("overview")
              setActiveScreen("receivables")
            }}
            onOpenPayables={() => {
              setGoalsListMode("debtsPayable")
              setAutoOpenGoalsList(true)
              setActiveNav("overview")
              setActiveScreen("receivables")
            }}
            onOpenQuickAddTransfer={() => {
              openQuickAddScreen("transfer")
            }}
            onOpenQuickAddIncome={(incomeSourceId) => {
              openQuickAddScreen("income", incomeSourceId)
            }}
            onOpenQuickAddExpense={(categoryId) => {
              openQuickAddScreen("expense", null, categoryId)
            }}
            onOpenQuickAddGoal={() => {
              openQuickAddScreen("goal")
            }}
            onOpenQuickAddDebtReceivable={() => {
              openQuickAddScreen("debt", null, null, "receivable")
            }}
            onOpenQuickAddDebtPayable={() => {
              openQuickAddScreen("debt", null, null, "payable")
            }}
            autoOpenGoalsList={autoOpenGoalsList}
            onConsumeAutoOpenGoalsList={() => {
              setAutoOpenGoalsList(false)
              setSkipGoalsListRefetch(false)
            }}
            autoOpenGoalCreate={autoOpenGoalCreate}
            onConsumeAutoOpenGoalCreate={() => setAutoOpenGoalCreate(false)}
            goalsListMode={goalsListMode}
            skipGoalsListRefetch={skipGoalsListRefetch}
            workspaceAccountLabel={accountLabel}
            workspaceAccountIcon={accountIcon}
            canOpenWorkspaceSwitcher={canOpenWorkspaceSwitcher}
            onOpenWorkspaceSwitcher={openWorkspaceModal}
            isDataReadyForActiveSpace={overviewDataReadyForActiveSpace}
            isDataLoadingForActiveSpace={overviewDataLoadingForActiveSpace}
          />
        )
      case "add":
        prevScreen.current = "overview"
        return <AddScreen />
      case "quick-add":
        return (
          <QuickAddScreen
            initialTab={quickAddInitialTab}
            initialIncomeSourceId={quickAddInitialIncomeSourceId}
            initialCategoryId={quickAddInitialCategoryId}
            initialDebtAction={quickAddInitialDebtAction}
            onClose={() => setActiveScreen(prevScreen.current ?? "overview")}
            onOpenCreateGoal={() => {
              setGoalsListMode("goals")
              setAutoOpenGoalCreate(true)
              setActiveNav("overview")
              setActiveScreen("overview")
            }}
          />
        )
      case "reports":
        return (
          <ReportsScreen
            onOpenSummary={() => setActiveScreen("report-summary")}
            onOpenExpensesByCategory={() => setActiveScreen("report-expenses-by-category")}
            onOpenCategorySheet={(id) => {
              setPendingCategoryOpenId(id)
              setActiveNav("overview")
              setActiveScreen("overview")
              setPendingReturnToReport(true)
            }}
            autoOpenExpensesSheet={autoOpenExpensesSheet}
            onConsumeAutoOpenExpenses={() => setAutoOpenExpensesSheet(false)}
            onOpenIncomeSourceSheet={(id, state) => {
              setPendingIncomeSourceOpenId(id)
              setSavedIncomeReportState(state)
              setActiveNav("overview")
              setActiveScreen("overview")
              setPendingReturnToIncomeReport(true)
            }}
            onOpenPayableDebtsSheet={() => {
              setGoalsListMode("debtsPayable")
              setSkipGoalsListRefetch(true)
              setAutoOpenGoalsList(true)
              setActiveNav("overview")
              setActiveScreen("receivables")
              setPendingReturnToReport(true)
            }}
            autoOpenIncomeSheet={autoOpenIncomeSheet}
            onConsumeAutoOpenIncome={() => setAutoOpenIncomeSheet(false)}
            incomeReportState={savedIncomeReportState}
          />
        )
      case "settings":
        return (
          <SettingsScreen
            onOpenIconsPreview={() => setActiveScreen("icons-preview")}
          />
        )
      case "icons-preview":
        return <IconPreviewScreen onBack={() => setActiveScreen("settings")} />
      case "report-summary":
        return <SummaryReportScreen onBack={() => setActiveScreen("reports")} />
      case "report-expenses-by-category":
        return <ExpensesByCategoryScreen onBack={() => setActiveScreen("reports")} />
      default:
        return <HomeScreen disableDataFetch />
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
            if (key === "add") {
              setQuickAddInitialTab("expense")
              setQuickAddInitialIncomeSourceId(null)
              setQuickAddInitialCategoryId(null)
              setQuickAddInitialDebtAction("receivable")
              prevScreen.current = activeScreen
              setActiveScreen("quick-add")
            } else {
              if (key === "overview") {
                setGoalsListMode("goals")
              }
              setActiveScreen(key)
            }
          }}
        />
        {isWorkspaceModalOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
              paddingBottom: "calc(var(--bottom-nav-height, 72px) + env(safe-area-inset-bottom, 0px) + 12px)",
              zIndex: 30,
            }}
            onClick={closeWorkspaceModal}
          >
            <div
              style={{
                width: "min(420px, 100%)",
                background: "#fff",
                borderRadius: 18,
                padding: "14px 16px 20px",
                boxShadow: "0 12px 28px rgba(15,23,42,0.16)",
                maxHeight: "78vh",
                overflowY: "auto",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={goBackWorkspaceModal}
                  style={{
                    width: 44,
                    height: 44,
                    border: "none",
                    background: workspaceModalView === "list" ? "transparent" : "rgba(15,23,42,0.05)",
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    color: workspaceModalView === "list" ? "transparent" : "#334155",
                    cursor: workspaceModalView === "list" ? "default" : "pointer",
                    fontSize: 24,
                    lineHeight: 1,
                  }}
                  aria-label="Назад"
                  disabled={workspaceModalView === "list"}
                >
                  ‹
                </button>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center" }}>
                  {workspaceModalView === "list"
                    ? "Пространство"
                    : workspaceModalView === "settings"
                      ? "Настройки аккаунта"
                      : workspaceModalView === "edit-name"
                        ? "Изменить название"
                        : "Выбрать иконку"}
                </div>
                <div style={{ width: 44, height: 44 }} />
              </div>
              {workspaceModalView === "list" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 8px",
                      borderRadius: 12,
                      border:
                        personalWorkspace && appActiveSpaceKey === "personal"
                          ? "1px solid rgba(59,130,246,0.4)"
                          : "1px solid rgba(15,23,42,0.08)",
                      background:
                        personalWorkspace && appActiveSpaceKey === "personal"
                          ? "rgba(59,130,246,0.06)"
                          : "#fff",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isSwitchingWorkspace || !appToken || !personalWorkspace) return
                        void setActiveWorkspaceRemote(personalWorkspace, appToken)
                      }}
                      disabled={!personalWorkspace}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                        flex: 1,
                        border: "none",
                        background: "transparent",
                        padding: "6px",
                        color: personalWorkspace && !isSwitchingWorkspace ? "#0f172a" : "#9ca3af",
                        textAlign: "left",
                        cursor: personalWorkspace && !isSwitchingWorkspace ? "pointer" : "not-allowed",
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "rgba(15,23,42,0.06)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 14,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {personalAccountIcon}
                      </div>
                      <div style={{ display: "grid", gap: 2, textAlign: "left", minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {personalAccountLabel}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>personal</div>
                      </div>
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
                      {switchingToWorkspaceId === personalWorkspace?.id && isSwitchingWorkspace ? (
                        <span style={{ fontSize: 12, color: "#6b7280", minWidth: 64, textAlign: "right" }}>Переключаем…</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openWorkspaceSettings("personal")
                        }}
                        aria-label={`Настройки аккаунта: ${personalAccountLabel}`}
                        style={{
                          width: 44,
                          height: 44,
                          border: "none",
                          background: "rgba(15,23,42,0.06)",
                          borderRadius: 12,
                          color: "#475569",
                          display: "grid",
                          placeItems: "center",
                          cursor: "pointer",
                        }}
                      >
                        <AppIcon name="settings" size={20} />
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 8px",
                      borderRadius: 12,
                      border:
                        familyWorkspace && appActiveSpaceKey === "family"
                          ? "1px solid rgba(59,130,246,0.4)"
                          : "1px solid rgba(15,23,42,0.08)",
                      background:
                        familyWorkspace && appActiveSpaceKey === "family"
                          ? "rgba(59,130,246,0.06)"
                          : "#fff",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isSwitchingWorkspace || !appToken) return
                        if (familyWorkspace) {
                          void setActiveWorkspaceRemote(familyWorkspace, appToken)
                          return
                        }
                        closeWorkspaceModal()
                        setIsWorkspaceFamilySheetOpen(true)
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                        flex: 1,
                        border: "none",
                        background: "transparent",
                        padding: "6px",
                        color: !isSwitchingWorkspace ? "#0f172a" : "#9ca3af",
                        textAlign: "left",
                        cursor: !isSwitchingWorkspace ? "pointer" : "not-allowed",
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "rgba(15,23,42,0.06)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 14,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {familyAccountIcon}
                      </div>
                      <div style={{ display: "grid", gap: 2, textAlign: "left", minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {familyAccountLabel}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>family</div>
                      </div>
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
                      {switchingToWorkspaceId === familyWorkspace?.id && isSwitchingWorkspace ? (
                        <span style={{ fontSize: 12, color: "#6b7280", minWidth: 64, textAlign: "right" }}>Переключаем…</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openWorkspaceSettings("family")
                        }}
                        aria-label={`Настройки аккаунта: ${familyAccountLabel}`}
                        style={{
                          width: 44,
                          height: 44,
                          border: "none",
                          background: "rgba(15,23,42,0.06)",
                          borderRadius: 12,
                          color: "#475569",
                          display: "grid",
                          placeItems: "center",
                          cursor: "pointer",
                        }}
                      >
                        <AppIcon name="settings" size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {workspaceModalView === "settings" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 2 }}>
                    Текущий аккаунт: {workspaceSettingsTargetKey === "family" ? familyAccountLabel : personalAccountLabel}
                  </div>
                  <button
                    type="button"
                    onClick={openWorkspaceNameEditor}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "#fff",
                      fontSize: 14,
                      color: "#0f172a",
                    }}
                  >
                    Изменить название
                  </button>
                  <button
                    type="button"
                    onClick={openWorkspaceIconEditor}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "#fff",
                      fontSize: 14,
                      color: "#0f172a",
                    }}
                  >
                    Выбрать иконку
                  </button>
                </div>
              ) : null}
              {workspaceModalView === "edit-name" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    value={workspaceNameDraft}
                    onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                    maxLength={WORKSPACE_NAME_LIMIT}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid rgba(15,23,42,0.12)",
                      padding: "12px 14px",
                      fontSize: 16,
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setWorkspaceModalView("settings")}
                      style={{
                        flex: 1,
                        padding: "11px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(15,23,42,0.12)",
                        background: "#fff",
                        fontSize: 14,
                      }}
                    >
                      Отменить
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveWorkspaceName}
                      disabled={!canSaveWorkspaceName}
                      style={{
                        flex: 1,
                        padding: "11px 12px",
                        borderRadius: 12,
                        border: "none",
                        background: canSaveWorkspaceName ? "#0f172a" : "rgba(15,23,42,0.3)",
                        color: "#fff",
                        fontSize: 14,
                      }}
                    >
                      Готово
                    </button>
                  </div>
                </div>
              ) : null}
              {workspaceModalView === "edit-icon" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <input
                      value={workspaceIconDraft}
                      onChange={(event) => setWorkspaceIconDraft(event.target.value)}
                      placeholder="Введите emoji или оставьте пустым"
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: "1px solid rgba(15,23,42,0.12)",
                        padding: "12px 44px 12px 14px",
                        fontSize: 16,
                      }}
                    />
                    {workspaceIconDraft.trim().length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setWorkspaceIconDraft("")}
                        aria-label="Очистить иконку"
                        style={{
                          position: "absolute",
                          top: "50%",
                          right: 8,
                          transform: "translateY(-50%)",
                          width: 30,
                          height: 30,
                          border: "none",
                          borderRadius: 9999,
                          background: "rgba(15,23,42,0.06)",
                          color: "#475569",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 16,
                          lineHeight: 1,
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setWorkspaceModalView("settings")}
                      style={{
                        flex: 1,
                        padding: "11px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(15,23,42,0.12)",
                        background: "#fff",
                        fontSize: 14,
                      }}
                    >
                      Отменить
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveWorkspaceIcon}
                      style={{
                        flex: 1,
                        padding: "11px 12px",
                        borderRadius: 12,
                        border: "none",
                        background: "#0f172a",
                        color: "#fff",
                        fontSize: 14,
                      }}
                    >
                      Готово
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {isWorkspaceFamilySheetOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              zIndex: 31,
            }}
            onClick={() => setIsWorkspaceFamilySheetOpen(false)}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 540,
                background: "#fff",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                padding: "16px 16px 20px",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: "#e5e7eb", margin: "0 auto 14px" }} />
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", textAlign: "center" }}>Создать семейный аккаунт?</div>
              <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", marginTop: 6 }}>
                Добавим пространство для совместных расходов и целей.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setIsWorkspaceFamilySheetOpen(false)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    fontWeight: 600,
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void createFamilyWorkspace()
                  }}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: "#0f172a",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  Создать
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
