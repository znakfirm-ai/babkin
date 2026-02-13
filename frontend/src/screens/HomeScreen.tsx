import { useCallback, useMemo, useState } from "react"
import { AppIcon } from "../components/AppIcon"
import type { IconName } from "../components/AppIcon"

type Story = { id: string; title: string; image: string }
type Period = "today" | "week" | "month" | "custom"
type SheetStep = "list" | "custom"

const VIEWED_KEY = "home_stories_viewed"

const periodLabel: Record<Period, string> = {
  today: "Сегодня",
  week: "Неделя",
  month: "Месяц",
  custom: "Свой",
}

function HomeScreen() {
  const stories = useMemo<Story[]>(
    () => [
      {
        id: "story-1",
        title: "Инвест книга",
        image: "https://cdn.litres.ru/pub/c/cover_415/69529921.jpg",
      },
      {
        id: "story-2",
        title: "Налоговый вычет",
        image: "https://fincult.info/upload/iblock/663/975lcctfyqxjbgdko6rka3u14g0ges3u/iis_fc_2812_pr.jpg",
      },
      {
        id: "story-3",
        title: "Fintech гайд",
        image: "https://static.tildacdn.com/tild3732-6463-4163-b761-666163393264/_FINTECH.png",
      },
      {
        id: "story-4",
        title: "Кэшбэк карта",
        image: "https://allsoft.by/upload/special_offer_pictograms/da9/zdpket1fl0w6ft3maffg46tb1z8vyl2z.png",
      },
    ],
    []
  )

  const banners = useMemo(
    () => [
      { id: "banner-1", title: "Ускорьте учёт", subtitle: "Подключите автоимпорт операций" },
      { id: "banner-2", title: "Настройте цели", subtitle: "Делайте откладывания по расписанию" },
      { id: "banner-3", title: "Контроль бюджета", subtitle: "Лимиты на категории расходов" },
      { id: "banner-4", title: "Команда", subtitle: "Пригласите семью вести бюджет" },
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

  const [period, setPeriod] = useState<Period>("month")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetStep, setSheetStep] = useState<SheetStep>("list")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const quickActions = useMemo(
    () => [
      { id: "qa-accounts", title: "Все счета", icon: "wallet" as IconName, action: () => console.log("Все счета") },
      { id: "qa-income", title: "Доход", icon: "arrowUp" as IconName, action: () => clickAddNav() },
      { id: "qa-expense", title: "Расход", icon: "arrowDown" as IconName, action: () => clickAddNav() },
      { id: "qa-more", title: "Другое", icon: "more" as IconName, action: () => console.log("Другое") },
    ],
    [clickAddNav]
  )

  const handleSelectPeriod = useCallback(
    (value: Period) => {
      if (value === "custom") {
        setSheetStep("custom")
      } else {
        setPeriod(value)
        setSheetOpen(false)
        setSheetStep("list")
      }
    },
    []
  )

  const applyCustom = useCallback(() => {
    if (!customFrom || !customTo) return
    setPeriod("custom")
    setSheetOpen(false)
    setSheetStep("list")
  }, [customFrom, customTo])

  const periodButton = (
    <button
      type="button"
      onClick={() => {
        setSheetStep("list")
        setSheetOpen(true)
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "1px solid rgba(15,23,42,0.08)",
        background: "transparent",
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 12,
        color: "#0f172a",
      }}
    >
      <span>{periodLabel[period]}</span>
      <span style={{ display: "inline-flex", alignItems: "center", transform: "rotate(90deg)" }}>
        <AppIcon name="arrowDown" size={14} />
      </span>
    </button>
  )

  const renderPeriodList = () => {
    const options: { key: Period; label: string }[] = [
      { key: "today", label: periodLabel.today },
      { key: "week", label: periodLabel.week },
      { key: "month", label: periodLabel.month },
      { key: "custom", label: periodLabel.custom },
    ]
    return (
      <div style={{ display: "grid", gap: 4 }}>
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => handleSelectPeriod(opt.key)}
            style={{
              height: 48,
              border: "none",
              background: "transparent",
              padding: "0 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 14,
              color: "#0f172a",
            }}
          >
            <span>{opt.label}</span>
            {period === opt.key ? <AppIcon name="circle" size={14} /> : null}
          </button>
        ))}
      </div>
    )
  }

  const renderCustom = () => {
    const disabled = !customFrom || !customTo
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontSize: 13, color: "#374151" }}>
            С:
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.12)",
                padding: "10px 12px",
                fontSize: 14,
              }}
            />
          </label>
          <label style={{ fontSize: 13, color: "#374151" }}>
            По:
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.12)",
                padding: "10px 12px",
                fontSize: 14,
              }}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={applyCustom}
          disabled={disabled}
          style={{
            height: 44,
            borderRadius: 12,
            border: "none",
            background: disabled ? "rgba(15,23,42,0.08)" : "#4f46e5",
            color: disabled ? "#6b7280" : "#ffffff",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Применить
        </button>
      </div>
    )
  }

  const sheetContent =
    sheetStep === "list" ? (
      renderPeriodList()
    ) : (
      renderCustom()
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
        <div className="home-banners">
          {banners.map((banner) => (
            <div key={banner.id} className="home-banner">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div className="home-banner__title">{banner.title}</div>
                {periodButton}
              </div>
              <div className="home-banner__text">
                <div className="home-banner__subtitle">{banner.subtitle}</div>
              </div>
            </div>
          ))}
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

      {sheetOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 950,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          role="presentation"
          onClick={() => {
            setSheetOpen(false)
            setSheetStep("list")
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 auto",
              background: "#ffffff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "14px 16px",
              paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <span style={{ width: 32 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Период</div>
              <button
                type="button"
                onClick={() => {
                  setSheetOpen(false)
                  setSheetStep("list")
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  border: "none",
                  background: "rgba(15,23,42,0.06)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: "rotate(45deg)",
                }}
                aria-label="Закрыть"
              >
                <AppIcon name="plus" size={16} />
              </button>
            </div>
            {sheetContent}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default HomeScreen
