import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppIcon } from "../components/AppIcon"
import type { IconName } from "../components/AppIcon"
import { createAccount, getAccounts } from "../api/accounts"
import { getCategories } from "../api/categories"
import { getTransactions } from "../api/transactions"
import { getIncomeSources } from "../api/incomeSources"
import { getGoals } from "../api/goals"
import { useAppStore } from "../store/useAppStore"
import { CURRENCIES, formatMoney, normalizeCurrency } from "../utils/formatMoney"

type Story = { id: string; title: string; image: string }
type HomeScreenProps = {
  disableDataFetch?: boolean
  initialWorkspaces?: Workspace[]
  initialActiveWorkspace?: Workspace | null
  onOpenQuickAdd?: (tab: "expense" | "income" | "debt" | "goal") => void
}
const VIEWED_KEY = "home_stories_viewed"

type TelegramUser = { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string } } } } }
type Workspace = { id: string; type: "personal" | "family"; name: string | null }
type SpaceKey = Workspace["type"]
type BannerLoadStatus = "idle" | "loading" | "success" | "error"
type HomePeriodMode = "day" | "week" | "month" | "quarter" | "year" | "custom"

const HOME_PERIOD_OPTIONS: Array<{ key: HomePeriodMode; label: string }> = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Год" },
]
const ACTIVE_SPACE_KEY_STORAGE = "activeSpaceKey"
const isSpaceKey = (value: string | null): value is SpaceKey => value === "personal" || value === "family"
const bannerStatusCache: Partial<Record<SpaceKey, BannerLoadStatus>> = {}

const capitalizeFirst = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value)
const formatDayMonth = (value: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(value)
const formatMonthTitle = (value: Date) => capitalizeFirst(new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(value))
const formatDotDate = (value: Date) =>
  `${String(value.getDate()).padStart(2, "0")}.${String(value.getMonth() + 1).padStart(2, "0")}.${value.getFullYear()}`
const parseIsoDateLocal = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
const getTodayIsoDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
const getHomePeriodRange = (mode: HomePeriodMode, customFrom: string, customTo: string, now: Date) => {
  const toDayStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate())
  if (mode === "day") {
    const start = toDayStart(now)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    return { start, end }
  }
  if (mode === "week") {
    const start = toDayStart(now)
    const day = start.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + mondayOffset)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    return { start, end }
  }
  if (mode === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { start, end }
  }
  if (mode === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    const start = new Date(now.getFullYear(), quarterStartMonth, 1)
    const end = new Date(now.getFullYear(), quarterStartMonth + 3, 1)
    return { start, end }
  }
  if (mode === "year") {
    const start = new Date(now.getFullYear(), 0, 1)
    const end = new Date(now.getFullYear() + 1, 0, 1)
    return { start, end }
  }
  const fromDate = customFrom ? parseIsoDateLocal(customFrom) : null
  const toDate = customTo ? parseIsoDateLocal(customTo) : null
  if (!fromDate || !toDate) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { start, end }
  }
  const start = fromDate <= toDate ? toDayStart(fromDate) : toDayStart(toDate)
  const to = fromDate <= toDate ? toDayStart(toDate) : toDayStart(fromDate)
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)
  return { start, end }
}
const getHomePeriodLabel = (mode: HomePeriodMode, customFrom: string, customTo: string, now: Date) => {
  if (mode === "day") {
    return formatDayMonth(now)
  }
  if (mode === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const day = start.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + mondayOffset)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    end.setDate(end.getDate() + 6)
    return `${formatDayMonth(start)} - ${formatDayMonth(end)}`
  }
  if (mode === "month") {
    return formatMonthTitle(now)
  }
  if (mode === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    const startMonth = new Date(now.getFullYear(), quarterStartMonth, 1)
    const endMonth = new Date(now.getFullYear(), quarterStartMonth + 2, 1)
    return `${formatMonthTitle(startMonth)} - ${formatMonthTitle(endMonth)}`
  }
  if (mode === "year") {
    return String(now.getFullYear())
  }
  if (!customFrom || !customTo) {
    return formatMonthTitle(now)
  }
  const fromDate = parseIsoDateLocal(customFrom)
  const toDate = parseIsoDateLocal(customTo)
  if (!fromDate || !toDate) {
    return formatMonthTitle(now)
  }
  const from = fromDate <= toDate ? fromDate : toDate
  const to = fromDate <= toDate ? toDate : fromDate
  return `${formatDotDate(from)} - ${formatDotDate(to)}`
}

function HomeScreen({ disableDataFetch = false, initialWorkspaces, initialActiveWorkspace, onOpenQuickAdd }: HomeScreenProps) {
  const { accounts, goals, transactions, setAccounts, setCategories, setIncomeSources, setTransactions, setGoals, currency } = useAppStore()
  const [activeSpaceKey, setActiveSpaceKeyState] = useState<SpaceKey | null>(() => {
    if (typeof window === "undefined") return initialActiveWorkspace?.type ?? null
    const stored = localStorage.getItem(ACTIVE_SPACE_KEY_STORAGE)
    if (isSpaceKey(stored)) return stored
    return initialActiveWorkspace?.type ?? null
  })
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces ?? [])
  const [isWorkspaceSheetOpen, setIsWorkspaceSheetOpen] = useState(false)
  const [isFamilySheetOpen, setIsFamilySheetOpen] = useState(false)
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false)
  const [switchingToWorkspaceId, setSwitchingToWorkspaceId] = useState<string | null>(null)
  const [bannerReadyScopeKey, setBannerReadyScopeKey] = useState<SpaceKey | null>(initialActiveWorkspace?.type ?? null)
  const [bannerStatusByScopeKey, setBannerStatusByScopeKey] = useState<Record<SpaceKey, BannerLoadStatus>>(() => ({
    personal:
      bannerStatusCache.personal ??
      (initialActiveWorkspace?.type === "personal" ? "success" : "idle"),
    family:
      bannerStatusCache.family ??
      (initialActiveWorkspace?.type === "family" ? "success" : "idle"),
  }))
  const workspaceLoadRequestRef = useRef(0)
  const isSwitchingWorkspaceRef = useRef(false)
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false)
  const [accountName, setAccountName] = useState("")
  const [accountType, setAccountType] = useState("cash")
  const [accountCurrency, setAccountCurrency] = useState(currency)
  const [accountBalance, setAccountBalance] = useState("0")
  const [homePeriodMode, setHomePeriodMode] = useState<HomePeriodMode>("month")
  const [homePeriodCustomFrom, setHomePeriodCustomFrom] = useState("")
  const [homePeriodCustomTo, setHomePeriodCustomTo] = useState("")
  const [isHomePeriodMenuOpen, setIsHomePeriodMenuOpen] = useState(false)
  const stories = useMemo<Story[]>(
    () => [
      { id: "story-1", title: "Инвест книга", image: "https://cdn.litres.ru/pub/c/cover_415/69529921.jpg" },
      { id: "story-2", title: "Налоговый вычет", image: "https://fincult.info/upload/iblock/663/975lcctfyqxjbgdko6rka3u14g0ges3u/iis_fc_2812_pr.jpg" },
      { id: "story-3", title: "Fintech гайд", image: "https://static.tildacdn.com/tild3732-6463-4163-b761-666163393264/_FINTECH.png" },
      { id: "story-4", title: "Кэшбэк карта", image: "https://allsoft.by/upload/special_offer_pictograms/da9/zdpket1fl0w6ft3maffg46tb1z8vyl2z.png" },
    ],
    []
  )

  const [viewedIds, setViewedIds] = useState<Set<string>>(() => {
    try {
      if (typeof window === "undefined") return new Set<string>()
      const raw = localStorage.getItem(VIEWED_KEY)
      if (!raw) return new Set<string>()
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((v): v is string => typeof v === "string"))
      }
      return new Set<string>()
    } catch {
      return new Set<string>()
    }
  })

  const persistViewed = useCallback((next: Set<string>) => {
    setViewedIds(next)
    if (typeof window !== "undefined") {
      localStorage.setItem(VIEWED_KEY, JSON.stringify(Array.from(next)))
    }
  }, [])

  const markViewed = useCallback(
    (id: string) => {
      if (viewedIds.has(id)) return
      const next = new Set(viewedIds)
      next.add(id)
      persistViewed(next)
    },
    [persistViewed, viewedIds]
  )

  const clickAddNav = useCallback(() => {
    const addBtn = document.querySelector(".bottom-nav__item--add") as HTMLButtonElement | null
    addBtn?.click()
  }, [])
  const openHomeQuickAdd = useCallback(
    (tab: "expense" | "income" | "debt" | "goal") => {
      if (onOpenQuickAdd) {
        onOpenQuickAdd(tab)
        return
      }
      clickAddNav()
    },
    [clickAddNav, onOpenQuickAdd],
  )

  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const todayIsoDate = useMemo(() => getTodayIsoDate(), [])
  const baseCurrency = useMemo(() => normalizeCurrency(currency || "RUB"), [currency])
  const homePeriodRange = useMemo(
    () => getHomePeriodRange(homePeriodMode, homePeriodCustomFrom, homePeriodCustomTo, new Date()),
    [homePeriodCustomFrom, homePeriodCustomTo, homePeriodMode],
  )
  const homePeriodLabel = useMemo(
    () => getHomePeriodLabel(homePeriodMode, homePeriodCustomFrom, homePeriodCustomTo, new Date()),
    [homePeriodCustomFrom, homePeriodCustomTo, homePeriodMode],
  )
  const homeBannerStats = useMemo(() => {
    const startMs = homePeriodRange.start.getTime()
    const endMs = homePeriodRange.end.getTime()
    const periodExpenses = transactions.reduce((sum, tx) => {
      if (tx.type !== "expense") return sum
      const ts = new Date(tx.date).getTime()
      if (!Number.isFinite(ts) || ts < startMs || ts >= endMs) return sum
      const value = Number(tx.amount.amount ?? 0)
      return Number.isFinite(value) ? sum + Math.abs(value) : sum
    }, 0)
    const periodIncome = transactions.reduce((sum, tx) => {
      if (tx.type !== "income") return sum
      const ts = new Date(tx.date).getTime()
      if (!Number.isFinite(ts) || ts < startMs || ts >= endMs) return sum
      const value = Number(tx.amount.amount ?? 0)
      return Number.isFinite(value) ? sum + Math.abs(value) : sum
    }, 0)
    const onAccounts = accounts.reduce((sum, account) => {
      const value = Number(account.balance.amount ?? 0)
      return Number.isFinite(value) ? sum + value : sum
    }, 0)
    const balance = onAccounts + goals.reduce((sum, goal) => {
      if (goal.status !== "active") return sum
      const value = Number(goal.currentAmount ?? 0)
      return Number.isFinite(value) ? sum + value : sum
    }, 0)
    return {
      expenses: periodExpenses,
      income: periodIncome,
      onAccounts,
      balance,
    }
  }, [accounts, goals, homePeriodRange.end, homePeriodRange.start, transactions])
  const isBannerDataReady = useMemo(() => {
    const activeScopeKey = activeSpaceKey
    if (!activeScopeKey) return false
    if (isSwitchingWorkspace) return false
    return bannerReadyScopeKey === activeScopeKey && bannerStatusByScopeKey[activeScopeKey] === "success"
  }, [activeSpaceKey, bannerReadyScopeKey, bannerStatusByScopeKey, isSwitchingWorkspace])
  const getBannerValueLabel = useCallback(
    (value: number) => (isBannerDataReady ? formatMoney(value, baseCurrency) : "—"),
    [baseCurrency, isBannerDataReady],
  )
  const handleHomePeriodSelect = useCallback(
    (nextMode: HomePeriodMode) => {
      setHomePeriodMode(nextMode)
      setIsHomePeriodMenuOpen(false)
      if (nextMode === "custom" && !homePeriodCustomFrom && !homePeriodCustomTo) {
        setHomePeriodCustomFrom(todayIsoDate)
        setHomePeriodCustomTo(todayIsoDate)
      }
    },
    [homePeriodCustomFrom, homePeriodCustomTo, todayIsoDate],
  )

  const openViewer = useCallback(
    (index: number) => {
      const story = stories[index]
      if (!story) return
      markViewed(story.id)
      setViewerIndex(index)
    },
    [markViewed, stories]
  )

  const closeViewer = useCallback(() => setViewerIndex(null), [])

  const stepViewer = useCallback(
    (delta: number) => {
      setViewerIndex((prev) => {
        if (prev === null) return prev
        const next = prev + delta
        if (next < 0 || next >= stories.length) return prev
        markViewed(stories[next].id)
        return next
      })
    },
    [markViewed, stories]
  )

  const logSpaceDebug = useCallback((message: string) => {
    if (!import.meta.env.DEV) return
    // eslint-disable-next-line no-console
    console.debug(message)
  }, [])

  const setActiveSpace = useCallback(
    (nextKey: SpaceKey) => {
      setActiveSpaceKeyState(nextKey)
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_SPACE_KEY_STORAGE, nextKey)
      }
      logSpaceDebug(`[space] setActiveSpace ${nextKey}`)
    },
    [logSpaceDebug],
  )

  const setBannerStatus = useCallback((spaceKey: SpaceKey, status: BannerLoadStatus) => {
    bannerStatusCache[spaceKey] = status
    setBannerStatusByScopeKey((prev) => {
      if (prev[spaceKey] === status) return prev
      return { ...prev, [spaceKey]: status }
    })
  }, [])

  const isStaleWorkspaceLoad = useCallback((requestId: number) => workspaceLoadRequestRef.current !== requestId, [])

  const fetchWorkspaces = useCallback(async (token: string) => {
    try {
      const res = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const data: { activeWorkspace: Workspace | null; workspaces: Workspace[] } = await res.json()
      if (data.activeWorkspace?.type) {
        setActiveSpace(data.activeWorkspace.type)
      }
      setWorkspaces(data.workspaces ?? [])
      return data
    } catch {
      return null
    }
  }, [setActiveSpace])

  const fetchAccounts = useCallback(
    async (token: string, requestId: number) => {
      try {
        const data = await getAccounts(token)
        if (isStaleWorkspaceLoad(requestId)) {
          logSpaceDebug("[space] apply skip accounts")
          return
        }
        logSpaceDebug("[space] apply ok accounts")
        const mapped = data.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        }))
        setAccounts(mapped)
      } catch (err) {
        if (err instanceof Error) {
          alert(err.message)
        } else {
          alert("Не удалось загрузить счета")
        }
      }
    },
    [isStaleWorkspaceLoad, logSpaceDebug, setAccounts]
  )

  const fetchCategories = useCallback(
    async (token: string, requestId: number) => {
      try {
        const data = await getCategories(token)
        if (isStaleWorkspaceLoad(requestId)) {
          logSpaceDebug("[space] apply skip categories")
          return
        }
        logSpaceDebug("[space] apply ok categories")
        const mapped = data.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon }))
        setCategories(mapped)
      } catch (err) {
        if (err instanceof Error) {
          alert(err.message)
        } else {
          alert("Не удалось загрузить категории")
        }
      }
    },
    [isStaleWorkspaceLoad, logSpaceDebug, setCategories]
  )

  const fetchIncomeSources = useCallback(
    async (token: string, requestId: number) => {
      try {
        const data = await getIncomeSources(token)
        if (isStaleWorkspaceLoad(requestId)) {
          logSpaceDebug("[space] apply skip income-sources")
          return
        }
        logSpaceDebug("[space] apply ok income-sources")
        const mapped = data.incomeSources.map((s) => ({ id: s.id, name: s.name, icon: s.icon ?? null }))
        setIncomeSources(mapped)
      } catch (err) {
        if (err instanceof Error) {
          alert(err.message)
        } else {
          alert("Не удалось загрузить источники дохода")
        }
      }
    },
    [isStaleWorkspaceLoad, logSpaceDebug, setIncomeSources]
  )

  const fetchGoalsData = useCallback(
    async (token: string, requestId: number) => {
      try {
        const data = await getGoals(token)
        if (isStaleWorkspaceLoad(requestId)) {
          logSpaceDebug("[space] apply skip goals")
          return
        }
        logSpaceDebug("[space] apply ok goals")
        const mapped = data.goals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          icon: goal.icon,
          targetAmount: Number(goal.targetAmount),
          currentAmount: Number(goal.currentAmount),
          status: goal.status,
        }))
        setGoals(mapped)
      } catch (err) {
        if (err instanceof Error) {
          alert(err.message)
        } else {
          alert("Не удалось загрузить цели")
        }
      }
    },
    [isStaleWorkspaceLoad, logSpaceDebug, setGoals]
  )

  const fetchTransactions = useCallback(
    async (token: string, requestId: number) => {
      try {
        const data = await getTransactions(token)
        if (isStaleWorkspaceLoad(requestId)) {
          logSpaceDebug("[space] apply skip transactions")
          return
        }
        logSpaceDebug("[space] apply ok transactions")
        const mapped = data.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: {
            amount: typeof t.amount === "string" ? Number(t.amount) : t.amount,
            currency: "RUB",
          },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
        }))
        setTransactions(mapped)
      } catch (err) {
        if (err instanceof Error) {
          alert(err.message)
        } else {
          alert("Не удалось загрузить транзакции")
        }
      }
    },
    [isStaleWorkspaceLoad, logSpaceDebug, setTransactions]
  )

  const setActiveWorkspaceRemote = useCallback(
    async (workspace: Workspace, token: string) => {
      if (disableDataFetch) return
      if (isSwitchingWorkspaceRef.current) return
      const requestId = workspaceLoadRequestRef.current + 1
      workspaceLoadRequestRef.current = requestId
      const previousBannerScopeKey = bannerReadyScopeKey
      const previousSpaceKey = activeSpaceKey
      let didActivateTargetWorkspace = false
      isSwitchingWorkspaceRef.current = true
      setIsSwitchingWorkspace(true)
      setSwitchingToWorkspaceId(workspace.id)
      setActiveSpace(workspace.type)
      setBannerReadyScopeKey(null)
      setBannerStatus(workspace.type, "loading")
      try {
        const res = await fetch("https://babkin.onrender.com/api/v1/workspaces/active", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ workspaceId: workspace.id }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          throw new Error(`Не удалось переключить пространство: ${res.status} ${text}`)
        }
        if (isStaleWorkspaceLoad(requestId)) return
        const data: { activeWorkspaceId: string; activeWorkspace: Workspace } = await res.json()
        if (isStaleWorkspaceLoad(requestId)) return
        didActivateTargetWorkspace = true
        setActiveSpace(data.activeWorkspace.type)
        setIsWorkspaceSheetOpen(false)
        setIsFamilySheetOpen(false)
        await fetchAccounts(token, requestId)
        if (isStaleWorkspaceLoad(requestId)) return
        await fetchCategories(token, requestId)
        if (isStaleWorkspaceLoad(requestId)) return
        await fetchIncomeSources(token, requestId)
        if (isStaleWorkspaceLoad(requestId)) return
        await fetchGoalsData(token, requestId)
        if (isStaleWorkspaceLoad(requestId)) return
        await fetchTransactions(token, requestId)
        if (isStaleWorkspaceLoad(requestId)) return
        setBannerReadyScopeKey(data.activeWorkspace.type)
        setBannerStatus(data.activeWorkspace.type, "success")
      } catch (err) {
        if (err instanceof Error) {
          alert(err.message)
        } else {
          alert("Не удалось переключить пространство")
        }
        if (!didActivateTargetWorkspace && !isStaleWorkspaceLoad(requestId)) {
          setBannerReadyScopeKey(previousBannerScopeKey)
          setBannerStatus(workspace.type, "error")
          if (previousSpaceKey) {
            setActiveSpace(previousSpaceKey)
          }
        }
      } finally {
        if (isStaleWorkspaceLoad(requestId)) {
          setBannerStatus(workspace.type, "idle")
          logSpaceDebug(`[space] apply skip ${workspace.type}`)
          return
        }
        isSwitchingWorkspaceRef.current = false
        setIsSwitchingWorkspace(false)
        setSwitchingToWorkspaceId(null)
        logSpaceDebug(`[space] apply ok ${workspace.type}`)
      }
    },
    [activeSpaceKey, bannerReadyScopeKey, disableDataFetch, fetchAccounts, fetchCategories, fetchGoalsData, fetchIncomeSources, fetchTransactions, isStaleWorkspaceLoad, logSpaceDebug, setActiveSpace, setBannerStatus]
  )

  const createFamilyWorkspace = useCallback(
    async (token: string) => {
      if (disableDataFetch) return
      const res = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: "family", name: null }),
      })
      if (!res.ok) {
        alert(`Не удалось создать совместный доступ: ${res.status}`)
        return
      }
      const refreshed = await fetchWorkspaces(token)
      const family = refreshed?.workspaces.find((w) => w.type === "family") ?? null
      if (family) {
        await setActiveWorkspaceRemote(family, token)
      } else {
        setIsFamilySheetOpen(false)
      }
    },
    [fetchWorkspaces, setActiveWorkspaceRemote]
  )

  useEffect(() => {
    if (initialWorkspaces) setWorkspaces(initialWorkspaces)
    if (!activeSpaceKey && initialActiveWorkspace?.type) {
      setActiveSpace(initialActiveWorkspace.type)
    }
  }, [activeSpaceKey, initialActiveWorkspace, initialWorkspaces, setActiveSpace])

  useEffect(() => {
    if (!activeSpaceKey) return
    const bannerStatus = bannerStatusByScopeKey[activeSpaceKey]

    if (bannerStatus === "success") {
      if (bannerReadyScopeKey !== activeSpaceKey) {
        setBannerReadyScopeKey(activeSpaceKey)
      }
      return
    }

    if (bannerStatus === "loading") {
      if (!isSwitchingWorkspaceRef.current) {
        setBannerStatus(activeSpaceKey, "idle")
      }
      return
    }

    if (disableDataFetch || isSwitchingWorkspaceRef.current) return
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    if (!token) return
    const targetWorkspace = workspaces.find((workspace) => workspace.type === activeSpaceKey) ?? null
    if (!targetWorkspace) return
    void setActiveWorkspaceRemote(targetWorkspace, token)
  }, [
    activeSpaceKey,
    bannerReadyScopeKey,
    bannerStatusByScopeKey,
    disableDataFetch,
    setBannerStatus,
    setActiveWorkspaceRemote,
    workspaces,
  ])

  useEffect(() => {
    if (homePeriodMode !== "custom") return
    setHomePeriodMode("month")
  }, [homePeriodMode])

  const quickActions = useMemo(
    () => [
      { id: "qa-expense", title: "Расход", icon: "report" as IconName, action: () => openHomeQuickAdd("expense") },
      { id: "qa-income", title: "Доход", icon: "plus" as IconName, action: () => openHomeQuickAdd("income") },
      { id: "qa-debt", title: "Долг", icon: "bank" as IconName, action: () => openHomeQuickAdd("debt") },
      { id: "qa-goal", title: "Цель", icon: "goal" as IconName, action: () => openHomeQuickAdd("goal") },
    ],
    [openHomeQuickAdd]
  )
  const userDisplayName = useMemo(() => {
    if (typeof window === "undefined") return "Пользователь"
    const rawName = (window as unknown as TelegramUser).Telegram?.WebApp?.initDataUnsafe?.user?.first_name ?? ""
    const normalized = rawName.trim()
    return normalized.length > 0 ? normalized : "Пользователь"
  }, [])
  const userAvatarInitial = useMemo(() => {
    const trimmed = userDisplayName.trim()
    if (!trimmed) return "?"
    const firstToken = trimmed.split(/\s+/)[0] ?? ""
    const firstChar = firstToken.charAt(0)
    return firstChar ? firstChar.toLocaleUpperCase("ru-RU") : "?"
  }, [userDisplayName])

  const personalWorkspace = workspaces.find((w) => w.type === "personal") ?? null
  const familyWorkspace = workspaces.find((w) => w.type === "family") ?? null
  const activeWorkspace = activeSpaceKey === "personal" ? personalWorkspace : activeSpaceKey === "family" ? familyWorkspace : null
  const accountLabel = useMemo(() => {
    if (activeSpaceKey === "family") {
      const familyName = familyWorkspace?.name?.trim()
      return familyName && familyName.length > 0 ? familyName : "Семейный"
    }
    if (activeSpaceKey === "personal") {
      const personalName = personalWorkspace?.name?.trim()
      return personalName && personalName.length > 0 ? personalName : "Личный"
    }
    return "Аккаунт"
  }, [activeSpaceKey, familyWorkspace?.name, personalWorkspace?.name])
  const canOpenWorkspaceSwitcher = Boolean(activeWorkspace) && workspaces.length > 0
  const handleOpenWorkspaceSheet = useCallback(() => {
    if (!canOpenWorkspaceSwitcher) return
    setIsWorkspaceSheetOpen(true)
  }, [canOpenWorkspaceSwitcher])

  return (
    <div className="home-screen">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        <div
          role="img"
          aria-label={`Профиль: ${userDisplayName}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
            border: "1px solid rgba(15, 23, 42, 0.10)",
            display: "grid",
            placeItems: "center",
            color: "#0f172a",
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {userAvatarInitial}
        </div>
        <button
          type="button"
          className="home-header__name-btn"
          onClick={handleOpenWorkspaceSheet}
          aria-label={`Переключить аккаунт. Текущий: ${accountLabel}`}
          disabled={!canOpenWorkspaceSwitcher}
        >
          <span className="home-header__name-text">{accountLabel}</span>
          <span className="home-header__name-caret" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      <section className="home-section">
        <div className="home-stories" style={{ marginTop: 0 }}>
          {stories.map((story, idx) => (
            <div
              key={story.id}
              className={`home-story-wrap ${
                viewedIds.has(story.id) ? "home-story-wrap--viewed" : "home-story-wrap--unread"
              }`}
            >
              <div
                className="home-story"
                role="button"
                tabIndex={0}
                onClick={() => openViewer(idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openViewer(idx)
                }}
              >
                <img src={story.image} alt={story.title} className="home-story__img" />
                <div className="home-story__label" title={story.title}>
                  {story.title}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-split-banner">
          {isHomePeriodMenuOpen ? (
            <div
              className="home-split-banner__period-overlay"
              onPointerDown={() => setIsHomePeriodMenuOpen(false)}
              onClick={() => setIsHomePeriodMenuOpen(false)}
            />
          ) : null}
          <div className="home-split-banner__period-row">
            <div className="home-split-banner__period-wrap">
              <button
                type="button"
                className="home-split-banner__period-btn"
                onClick={() => setIsHomePeriodMenuOpen((prev) => !prev)}
              >
                Период
                <span className="home-split-banner__period-caret">▾</span>
              </button>
              {isHomePeriodMenuOpen ? (
                <div
                  className="home-split-banner__period-menu"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {HOME_PERIOD_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className="home-split-banner__period-menu-item"
                      onClick={() => handleHomePeriodSelect(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="home-split-banner__period-label">{homePeriodLabel}</div>
          </div>
          {homePeriodMode === "custom" ? (
            <div className="home-split-banner__custom-row">
              <input
                type="date"
                value={homePeriodCustomFrom || todayIsoDate}
                onChange={(event) => setHomePeriodCustomFrom(event.target.value)}
              />
              <input
                type="date"
                value={homePeriodCustomTo || todayIsoDate}
                onChange={(event) => setHomePeriodCustomTo(event.target.value)}
              />
            </div>
          ) : null}
          <div className="home-split-banner__cell">
            <div className="home-split-banner__metric home-split-banner__metric--top-shift">
              <div className="home-split-banner__metric-title">РАСХОДЫ</div>
              <div className="home-split-banner__metric-value home-split-banner__metric-value--expense">
                {getBannerValueLabel(homeBannerStats.expenses)}
              </div>
            </div>
          </div>
          <div className="home-split-banner__cell">
            <div className="home-split-banner__metric home-split-banner__metric--top-shift">
              <div className="home-split-banner__metric-title">ДОХОДЫ</div>
              <div className="home-split-banner__metric-value home-split-banner__metric-value--income">
                {getBannerValueLabel(homeBannerStats.income)}
              </div>
            </div>
          </div>
          <div className="home-split-banner__cell">
            <div className="home-split-banner__metric">
              <div className="home-split-banner__metric-title">НА СЧЕТАХ</div>
              <div className="home-split-banner__metric-value">
                {getBannerValueLabel(homeBannerStats.onAccounts)}
              </div>
            </div>
          </div>
          <div className="home-split-banner__cell">
            <div className="home-split-banner__metric">
              <div className="home-split-banner__metric-title">БАЛАНС</div>
              <div className="home-split-banner__metric-value">
                {getBannerValueLabel(homeBannerStats.balance)}
              </div>
            </div>
          </div>
          <div className="home-split-banner__line home-split-banner__line--vertical" />
          <div className="home-split-banner__line home-split-banner__line--horizontal" />
        </div>
      </section>

      <section className="home-section" style={{ marginTop: 8 }}>
        <div className="home-quick-actions">
          {quickActions.map((action) => (
            <button key={action.id} type="button" className="home-quick" onClick={action.action}>
              <div className="home-quick__icon">
                <AppIcon name={action.icon} size={18} />
              </div>
              <div className="home-quick__title">{action.title}</div>
            </button>
          ))}
        </div>
      </section>

      {viewerIndex !== null && stories[viewerIndex] ? (
        <div className="home-story-viewer" role="dialog" aria-modal="true">
          <div className="home-story-viewer__image-wrap">
            <img src={stories[viewerIndex].image} alt={stories[viewerIndex].title} />
            <div className="home-story-viewer__label">{stories[viewerIndex].title}</div>
          </div>
          <button type="button" className="home-story-viewer__close" onClick={closeViewer} aria-label="Закрыть сторис">
            ✕
          </button>
          <button
            type="button"
            className="home-story-viewer__nav home-story-viewer__nav--prev"
            onClick={() => stepViewer(-1)}
            aria-label="Предыдущая сторис"
            disabled={viewerIndex <= 0}
          >
            ‹
          </button>
          <button
            type="button"
            className="home-story-viewer__nav home-story-viewer__nav--next"
            onClick={() => stepViewer(1)}
            aria-label="Следующая сторис"
            disabled={viewerIndex >= stories.length - 1}
          >
            ›
          </button>
        </div>
      ) : null}

      {isWorkspaceSheetOpen ? (
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
            zIndex: 30,
          }}
          onClick={() => setIsWorkspaceSheetOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "14px 16px 20px",
              boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              Пространство
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  if (isSwitchingWorkspace) return
                  const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
                  if (!token) {
                    alert("Нет токена")
                    return
                  }
                  if (personalWorkspace) {
                    void setActiveWorkspaceRemote(personalWorkspace, token)
                  } else {
                    setIsWorkspaceSheetOpen(false)
                  }
                }}
                disabled={!personalWorkspace}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border:
                    personalWorkspace && activeSpaceKey === "personal"
                      ? "1px solid rgba(59,130,246,0.4)"
                      : "1px solid rgba(15,23,42,0.08)",
                  background:
                    personalWorkspace && activeSpaceKey === "personal"
                      ? "rgba(59,130,246,0.06)"
                      : "#fff",
                  color: personalWorkspace && !isSwitchingWorkspace ? "#0f172a" : "#9ca3af",
                  cursor: personalWorkspace && !isSwitchingWorkspace ? "pointer" : "not-allowed",
                }}
              >
                <div style={{ display: "grid", gap: 2, textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Личный аккаунт</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>personal</div>
                </div>
                {switchingToWorkspaceId === personalWorkspace?.id && isSwitchingWorkspace ? (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Переключаем…</span>
                ) : personalWorkspace && activeSpaceKey === "personal" ? (
                  <AppIcon name="more" size={16} />
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isSwitchingWorkspace) return
                  const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
                  if (!token) {
                    alert("Нет токена")
                    return
                  }
                  if (familyWorkspace) {
                    void setActiveWorkspaceRemote(familyWorkspace, token)
                    return
                  }
                  setIsWorkspaceSheetOpen(false)
                  setIsFamilySheetOpen(true)
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border:
                    familyWorkspace && activeSpaceKey === "family"
                      ? "1px solid rgba(59,130,246,0.4)"
                      : "1px solid rgba(15,23,42,0.08)",
                  background:
                    familyWorkspace && activeSpaceKey === "family"
                      ? "rgba(59,130,246,0.06)"
                      : "#fff",
                  color: !isSwitchingWorkspace ? "#0f172a" : "#9ca3af",
                  cursor: !isSwitchingWorkspace ? "pointer" : "not-allowed",
                }}
              >
                <div style={{ display: "grid", gap: 2, textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Совместный доступ</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>family</div>
                </div>
                {switchingToWorkspaceId === familyWorkspace?.id && isSwitchingWorkspace ? (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Переключаем…</span>
                ) : familyWorkspace && activeSpaceKey === "family" ? (
                  <AppIcon name="more" size={16} />
                ) : null}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFamilySheetOpen ? (
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
          onClick={() => setIsFamilySheetOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "16px 16px 20px",
              boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 10 }}>
              Совместный доступ
            </div>
            <div style={{ fontSize: 14, color: "#4b5563", textAlign: "center", marginBottom: 16 }}>
              Настройте совместный доступ, чтобы вести общий бюджет.
            </div>
            <button
              type="button"
              onClick={() => {
                const token = localStorage.getItem("auth_access_token")
                if (!token) {
                  alert("Нет токена")
                  return
                }
                void createFamilyWorkspace(token)
              }}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Создать совместный доступ
            </button>
          </div>
        </div>
      ) : null}
      {isAccountSheetOpen ? (
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
            zIndex: 32,
          }}
          onClick={() => setIsAccountSheetOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "16px 16px 20px",
              boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              Новый счёт
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                Название
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Например, Кошелёк"
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
                />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                Тип
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
                >
                  <option value="cash">Наличные</option>
                  <option value="card">Карта</option>
                  <option value="bank">Банк</option>
                </select>
              </label>
             <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                Валюта
                <select
                  value={accountCurrency}
                  onChange={(e) => setAccountCurrency(e.target.value)}
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                Баланс
                <input
                  value={accountBalance}
                  onChange={(e) => setAccountBalance(e.target.value)}
                  inputMode="decimal"
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
                />
              </label>
              <button
                type="button"
              onClick={async () => {
                const token = localStorage.getItem("auth_access_token")
                if (disableDataFetch) return
                if (!token) {
                  alert("Нет токена")
                  return
                }
                  if (!accountName.trim()) {
                    alert("Введите название")
                    return
                  }
                 const parsed = Number(accountBalance.trim().replace(",", "."))
                 if (!Number.isFinite(parsed)) {
                   alert("Некорректная сумма")
                   return
                 }
                 const balanceNumber = Math.round(parsed * 100) / 100
                 try {
                   await createAccount(token, {
                     name: accountName.trim(),
                     type: accountType || "cash",
                     currency: normalizeCurrency(accountCurrency),
                     balance: balanceNumber,
                   })
                   const accounts = await getAccounts(token)
                   const mapped = accounts.accounts.map((a) => ({
                     id: a.id,
                     name: a.name,
                     balance: { amount: a.balance, currency: a.currency },
                   }))
                    setAccounts(mapped)
                    setIsAccountSheetOpen(false)
                    setAccountName("")
                    setAccountBalance("0")
                  } catch {
                    alert("Не удалось создать счёт")
                  }
                }}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default HomeScreen
