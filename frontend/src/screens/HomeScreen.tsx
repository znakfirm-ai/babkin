import { useCallback, useMemo, useState } from "react"
import { AppIcon } from "../components/AppIcon"
import type { IconName } from "../components/AppIcon"

type Story = { id: string; title: string; image: string }
type Period = "today" | "week" | "month" | "custom"

const VIEWED_KEY = "home_stories_viewed"

const periodLabel: Record<Period, string> = {
  today: "Сегодня",
  week: "Неделя",
  month: "Месяц",
  custom: "Свой",
}

function formatRub(amount: number): string {
  return amount.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽"
}

function HomeScreen() {
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

  const [period] = useState<Period>("today")

  const quickActions = useMemo(
    () => [
      { id: "qa-accounts", title: "Все счета", icon: "wallet" as IconName, action: () => console.log("Все счета") },
      { id: "qa-income", title: "Доход", icon: "arrowUp" as IconName, action: () => clickAddNav() },
      { id: "qa-expense", title: "Расход", icon: "arrowDown" as IconName, action: () => clickAddNav() },
      { id: "qa-more", title: "Другое", icon: "more" as IconName, action: () => console.log("Другое") },
    ],
    [clickAddNav]
  )

  const expenseSlices = useMemo(
    () => [
      { id: "food", name: "Еда", amount: 12500, percent: 38, color: "#4f46e5" },
      { id: "home", name: "Дом", amount: 7200, percent: 22, color: "#10b981" },
      { id: "transport", name: "Транспорт", amount: 5400, percent: 16, color: "#06b6d4" },
      { id: "fun", name: "Развлечения", amount: 3600, percent: 11, color: "#f59e0b" },
      { id: "other", name: "Другое", amount: 2100, percent: 13, color: "#94a3b8" },
    ],
    []
  )

  const totalExpense = useMemo(() => expenseSlices.reduce((sum, item) => sum + item.amount, 0), [expenseSlices])
  const mainAmount = formatRub(totalExpense)

  const topCategories = expenseSlices.slice(0, 3)
  const restCount = expenseSlices.length > 3 ? expenseSlices.length - 3 : 0

  const circumference = 2 * Math.PI * 30

  const donutArcs = useMemo(() => {
    let offset = 0
    return expenseSlices.map((slice) => {
      const dash = (slice.percent / 100) * circumference
      const arc = (
        <circle
          key={slice.id}
          cx="50"
          cy="50"
          r="30"
          fill="none"
          stroke={slice.color}
          strokeWidth="9"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={-offset}
          strokeLinecap="round"
        />
      )
      offset += dash
      return arc
    })
  }, [circumference, expenseSlices])

  const periodButton = (
    <button
      type="button"
      onClick={() => {
        // sheet пока не делаем
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "none",
        background: "transparent",
        borderRadius: 10,
        padding: "6px 8px",
        fontSize: 12,
        color: "#0f172a",
        cursor: "pointer",
      }}
    >
      <span>Период · {periodLabel[period]}</span>
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        <AppIcon name="arrowDown" size={14} />
      </span>
    </button>
  )

  return (
    <div className="home-screen">
      <h2>Главная</h2>

      <section className="home-section">
        <div className="home-section__title">Сторис</div>
        <div className="home-stories">
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
        <div className="home-section__title">Баннеры</div>
        <div
          className="home-banners"
          style={{
            display: "flex",
            gap: 12,
            overflowX: "hidden",
            paddingBottom: 6,
          }}
        >
          <div
            className="home-banner"
            style={{
              flex: "0 0 100%",
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.08)",
              background: "linear-gradient(135deg, #f9fafb, #eef2f7)",
              padding: "16px 16px 14px",
              boxSizing: "border-box",
              height: 180,
              position: "relative",
            }}
          >
            <div style={{ position: "absolute", top: 10, left: 10, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
              Расходы
            </div>
            <div style={{ position: "absolute", top: 10, right: 10 }}>{periodButton}</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr",
                gap: 16,
                alignItems: "center",
                height: "100%",
                paddingTop: 30,
                boxSizing: "border-box",
              }}
            >
              <div style={{ position: "relative", width: 100, height: 100, flex: "0 0 auto" }}>
                <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
                  <circle
                    cx="50"
                    cy="50"
                    r="30"
                    fill="none"
                    stroke="rgba(15,23,42,0.08)"
                    strokeWidth="9"
                  />
                  {donutArcs}
                </svg>
              </div>

              <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>{mainAmount}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>за период</div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {topCategories.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 13,
                        color: "#0f172a",
                      }}
                    >
                      <span>{item.name}</span>
                      <span style={{ fontWeight: 600 }}>{formatRub(item.amount)}</span>
                    </div>
                  ))}
                  {restCount > 0 ? (
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Ещё {restCount} категорий</div>
                  ) : null}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    style={{
                      border: "1px solid rgba(15,23,42,0.12)",
                      background: "transparent",
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#0f172a",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                    }}
                  >
                    <span>Подробнее</span>
                    <span style={{ display: "inline-flex", transform: "rotate(-90deg)" }}>
                      <AppIcon name="arrowDown" size={14} />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__title">Быстрые действия</div>
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
    </div>
  )
}

export default HomeScreen
