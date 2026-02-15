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

type TelegramUser = { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string } } } } }

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
      </div>

      <button
        style={{ margin: 20, padding: 10 }}
        onClick={() => {
          const data = (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData
          alert(data || "no initData")
        }}
      >
        Показать initData
      </button>

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

      <section className="home-section" style={{ marginTop: 8 }}>
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
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: 10, left: 10, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
              Расходы
            </div>
            <div style={{ position: "absolute", top: 10, right: 10 }}>{periodButton}</div>
            <button
              type="button"
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                border: "1px solid rgba(15,23,42,0.12)",
                background: "rgba(255,255,255,0.8)",
                borderRadius: 10,
                padding: "6px 10px",
                fontSize: 12,
                color: "#0f172a",
                cursor: "pointer",
              }}
            >
              Подробнее
            </button>
          </div>
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
    </div>
  )
}

export default HomeScreen
