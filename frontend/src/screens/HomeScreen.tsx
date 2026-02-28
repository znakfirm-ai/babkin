import { useCallback, useEffect, useMemo, useState } from "react"
import { AppIcon } from "../components/AppIcon"
import type { IconName } from "../components/AppIcon"
import { createAccount, getAccounts } from "../api/accounts"
import { getCategories } from "../api/categories"
import { getTransactions } from "../api/transactions"
import { getIncomeSources } from "../api/incomeSources"
import { useAppStore } from "../store/useAppStore"
import { CURRENCIES, normalizeCurrency } from "../utils/formatMoney"

type Story = { id: string; title: string; image: string }
type HomeScreenProps = {
  disableDataFetch?: boolean
  initialWorkspaces?: Workspace[]
  initialActiveWorkspace?: Workspace | null
}
const VIEWED_KEY = "home_stories_viewed"

type TelegramUser = { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string } } } } }
type Workspace = { id: string; type: "personal" | "family"; name: string | null }

function HomeScreen({ disableDataFetch = false, initialWorkspaces, initialActiveWorkspace }: HomeScreenProps) {
  const { setAccounts, setCategories, setIncomeSources, setTransactions, currency } = useAppStore()
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(initialActiveWorkspace ?? null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces ?? [])
  const [isWorkspaceSheetOpen, setIsWorkspaceSheetOpen] = useState(false)
  const [isFamilySheetOpen, setIsFamilySheetOpen] = useState(false)
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false)
  const [switchingToWorkspaceId, setSwitchingToWorkspaceId] = useState<string | null>(null)
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false)
  const [accountName, setAccountName] = useState("")
  const [accountType, setAccountType] = useState("cash")
  const [accountCurrency, setAccountCurrency] = useState(currency)
  const [accountBalance, setAccountBalance] = useState("0")
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

  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

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

  const fetchWorkspaces = useCallback(async (token: string) => {
    try {
      const res = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const data: { activeWorkspace: Workspace | null; workspaces: Workspace[] } = await res.json()
      setActiveWorkspace(data.activeWorkspace)
      setWorkspaces(data.workspaces ?? [])
      return data
    } catch {
      return null
    }
  }, [])

  const fetchAccounts = useCallback(
    async (token: string) => {
      try {
        const data = await getAccounts(token)
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
    [setAccounts]
  )

  const fetchCategories = useCallback(
    async (token: string) => {
      try {
        const data = await getCategories(token)
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
    [setCategories]
  )

  const fetchIncomeSources = useCallback(
    async (token: string) => {
      try {
        const data = await getIncomeSources(token)
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
    [setIncomeSources]
  )

  const fetchTransactions = useCallback(
    async (token: string) => {
      try {
        const data = await getTransactions(token)
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
    [setTransactions]
  )

  const setActiveWorkspaceRemote = useCallback(
    async (workspaceId: string, token: string) => {
      if (disableDataFetch) return
      if (isSwitchingWorkspace) return
      setIsSwitchingWorkspace(true)
      setSwitchingToWorkspaceId(workspaceId)
      try {
        const res = await fetch("https://babkin.onrender.com/api/v1/workspaces/active", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ workspaceId }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          throw new Error(`Не удалось переключить пространство: ${res.status} ${text}`)
        }
        const data: { activeWorkspaceId: string; activeWorkspace: Workspace } = await res.json()
        setActiveWorkspace(data.activeWorkspace)
        setIsWorkspaceSheetOpen(false)
        setIsFamilySheetOpen(false)
        await fetchAccounts(token)
        await fetchCategories(token)
        await fetchIncomeSources(token)
        await fetchTransactions(token)
      } catch (err) {
        if (err instanceof Error) {
          alert(err.message)
        } else {
          alert("Не удалось переключить пространство")
        }
      } finally {
        setIsSwitchingWorkspace(false)
        setSwitchingToWorkspaceId(null)
      }
    },
    [fetchAccounts, fetchCategories, fetchIncomeSources, fetchTransactions, isSwitchingWorkspace]
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
        await setActiveWorkspaceRemote(family.id, token)
      } else {
        setIsFamilySheetOpen(false)
      }
    },
    [fetchWorkspaces, setActiveWorkspaceRemote]
  )

  useEffect(() => {
    if (initialWorkspaces) setWorkspaces(initialWorkspaces)
    if (initialActiveWorkspace) setActiveWorkspace(initialActiveWorkspace)
  }, [initialActiveWorkspace, initialWorkspaces])

  const quickActions = useMemo(
    () => [
      { id: "qa-accounts", title: "Все счета", icon: "wallet" as IconName, action: () => setIsAccountSheetOpen(true) },
      { id: "qa-income", title: "Доход", icon: "arrowUp" as IconName, action: () => clickAddNav() },
      { id: "qa-expense", title: "Расход", icon: "arrowDown" as IconName, action: () => clickAddNav() },
      { id: "qa-more", title: "Другое", icon: "more" as IconName, action: () => console.log("Другое") },
    ],
    [clickAddNav]
  )

  const personalWorkspace = workspaces.find((w) => w.type === "personal") ?? null
  const familyWorkspace = workspaces.find((w) => w.type === "family") ?? null

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
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--tg-theme-secondary-bg-color, #e5e7eb)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <AppIcon name="more" size={20} />
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "#0f172a",
          }}
        >
          {typeof window !== "undefined"
            ? ((window as unknown as TelegramUser).Telegram?.WebApp?.initDataUnsafe?.user?.first_name ?? "Пользователь")
            : "Пользователь"}
        </div>
        {activeWorkspace ? (
          <button
            type="button"
            onClick={() => {
              if (workspaces.length > 0) setIsWorkspaceSheetOpen(true)
            }}
            style={{
              display: "grid",
              gap: 2,
              fontSize: 12,
              color: "#6b7280",
              textAlign: "left",
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: workspaces.length > 0 ? "pointer" : "default",
            }}
          >
            <span>
              {activeWorkspace.name ?? (activeWorkspace.type === "personal" ? "Личный" : "Семейный")}
            </span>
            <span style={{ fontSize: 11 }}>{activeWorkspace.type}</span>
          </button>
        ) : null}
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
          <div className="home-split-banner__cell" />
          <div className="home-split-banner__cell" />
          <div className="home-split-banner__cell" />
          <div className="home-split-banner__cell" />
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
                    void setActiveWorkspaceRemote(personalWorkspace.id, token)
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
                    personalWorkspace && activeWorkspace?.id === personalWorkspace.id
                      ? "1px solid rgba(59,130,246,0.4)"
                      : "1px solid rgba(15,23,42,0.08)",
                  background:
                    personalWorkspace && activeWorkspace?.id === personalWorkspace.id
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
                ) : personalWorkspace && activeWorkspace?.id === personalWorkspace.id ? (
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
                    void setActiveWorkspaceRemote(familyWorkspace.id, token)
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
                    familyWorkspace && activeWorkspace?.id === familyWorkspace.id
                      ? "1px solid rgba(59,130,246,0.4)"
                      : "1px solid rgba(15,23,42,0.08)",
                  background:
                    familyWorkspace && activeWorkspace?.id === familyWorkspace.id
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
                ) : familyWorkspace && activeWorkspace?.id === familyWorkspace.id ? (
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
