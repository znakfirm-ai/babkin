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

function formatPercent(value: number): string {
  return value.toFixed(1).replace(".", ",") + "%"
}

function HomeScreen() {
  const bannerHeight = 180
  const donutBox = 140
  const svgRadius = 30
  const donutOuterRadius = svgRadius * (donutBox / 100)
  const labelRadius = donutOuterRadius + 28
  const minLabelY = -(donutBox / 2) + 34
  const maxLabelY = donutBox / 2 - 18
  const minLabelGap = 34

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
      { id: "food_out", name: "Еда (вне дома)", amount: 14760, percent: 47.6, color: "#6ba7e7" },
      { id: "food_home", name: "Еда (дом)", amount: 14760, percent: 47.6, color: "#5cc5a7" },
      { id: "fun", name: "Развлечения", amount: 1500, percent: 4.8, color: "#f29fb0" },
    ],
    []
  )

  const totalExpense = useMemo(() => expenseSlices.reduce((sum, item) => sum + item.amount, 0), [expenseSlices])
  const mainAmount = formatRub(totalExpense)

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
          strokeWidth="8"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={-offset}
          strokeLinecap="butt"
        />
      )
      offset += dash
      return arc
    })
  }, [circumference, expenseSlices])

  type PositionedLabel = {
    id: string
    name: string
    amount: number
    percent: number
    color: string
    x: number
    y: number
    align: "left" | "right"
  }

  const positionedLabels = useMemo<PositionedLabel[]>(() => {
    const labels: PositionedLabel[] = []
    let startAngle = -Math.PI / 2
    expenseSlices.forEach((slice) => {
      const sliceAngle = (slice.percent / 100) * Math.PI * 2
      const midAngle = startAngle + sliceAngle / 2
      const x = Math.cos(midAngle) * labelRadius
      const y = Math.sin(midAngle) * labelRadius
      const paddedX = x + (x >= 0 ? 12 : -12)
      labels.push({
        ...slice,
        x: paddedX,
        y,
        align: x >= 0 ? "left" : "right",
      })
      startAngle += sliceAngle
    })

    const adjustSide = (side: "left" | "right") => {
      const sideLabels = labels
        .filter((l) => l.align === side)
        .sort((a, b) => a.y - b.y)
      let prevY = -Infinity
      sideLabels.forEach((label) => {
        let y = label.y
        if (y - prevY < minLabelGap) y = prevY + minLabelGap
        y = Math.min(maxLabelY, Math.max(minLabelY, y))
        label.y = y
        prevY = y
      })
    }

    adjustSide("left")
    adjustSide("right")

    return labels
  }, [expenseSlices, labelRadius, maxLabelY, minLabelGap, minLabelY])

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
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: 10, left: 10, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
              Расходы
            </div>
            <div style={{ position: "absolute", top: 10, right: 10 }}>{periodButton}</div>

            <div
              style={{
                height: "100%",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 140,
                  height: 140,
                }}
              >
                <svg
                  viewBox="0 0 100 100"
                  style={{
                    width: "100%",
                    height: "100%",
                    transform: "rotate(-90deg)",
                  }}
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="30"
                    fill="none"
                    stroke="rgba(15,23,42,0.06)"
                    strokeWidth="8"
                  />
                  {donutArcs}
                </svg>
              </div>

              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: donutBox + 40,
                  height: donutBox + 40,
                  pointerEvents: "none",
                }}
              >
                {positionedLabels.map((label) => (
                  <div
                    key={label.id}
                    style={{
                      position: "absolute",
                      left: (donutBox + 40) / 2 + label.x,
                      top: (donutBox + 40) / 2 + label.y,
                      transform: "translate(-50%, -50%)",
                      textAlign: label.align === "left" ? "left" : "right",
                      display: "grid",
                      gap: 2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{label.name}</div>
                    <div style={{ fontSize: 12, color: label.color }}>
                      {formatRub(label.amount)} ({formatPercent(label.percent)})
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: 12,
                  transform: "translateX(-50%)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                {mainAmount}
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
