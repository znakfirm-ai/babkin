import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
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
  const donutSize = 120
  const labelWidth = 140
  const labelHeight = 24
  const strokeWidth = 8
  const rightOffset = 50
  const rightGap = 30
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLDivElement | null>(null)
  const periodRef = useRef<HTMLButtonElement | null>(null)
  const detailsRef = useRef<HTMLButtonElement | null>(null)

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
      { id: "food_out", name: "Еда (вне дома)", amount: 14760, percent: 38.0, color: "#6ba7e7" },
      { id: "food_home", name: "Еда (дом)", amount: 12000, percent: 31.0, color: "#5cc5a7" },
      { id: "fun", name: "Развлечения", amount: 4500, percent: 11.0, color: "#f29fb0" },
      { id: "transport", name: "Транспорт", amount: 3200, percent: 8.0, color: "#7aa8d6" },
      { id: "other", name: "Остальное", amount: 2300, percent: 12.0, color: "#9aa6b2" },
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
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={-offset}
          strokeLinecap="butt"
        />
      )
      offset += dash
      return arc
    })
  }, [circumference, expenseSlices])

  const [bannerSize, setBannerSize] = useState<{ width: number; height: number }>({ width: 320, height: 180 })
  const [topLabelMetrics, setTopLabelMetrics] = useState<{ x: number; width: number; fontSize: number }>({
    x: 160,
    width: labelWidth,
    fontSize: 11,
  })
  const [rightLabelMetrics, setRightLabelMetrics] = useState<{ top: number; width: number; fontSize: number }>({
    top: 75,
    width: labelWidth,
    fontSize: 11,
  })

  useLayoutEffect(() => {
    const measure = () => {
      if (!bannerRef.current) return
      const bannerRect = bannerRef.current.getBoundingClientRect()
      const titleRect = titleRef.current?.getBoundingClientRect()
      const periodRect = periodRef.current?.getBoundingClientRect()
      if (bannerRect.width !== bannerSize.width || bannerRect.height !== bannerSize.height) {
        setBannerSize({ width: bannerRect.width, height: bannerRect.height })
      }
      if (titleRect && periodRect) {
        const available = Math.max(80, periodRect.left - titleRect.right - 8)
        const nextWidth = Math.min(labelWidth, available)
        const nextFontSize = available < 110 ? 10 : 11
        const nextX = (titleRect.right + periodRect.left) / 2 - bannerRect.left
        setTopLabelMetrics((prev) =>
          prev.x !== nextX || prev.width !== nextWidth || prev.fontSize !== nextFontSize
            ? { x: nextX, width: nextWidth, fontSize: nextFontSize }
            : prev
        )
      } else {
        const fallbackX = bannerRect.width / 2
        if (topLabelMetrics.x !== fallbackX) {
          setTopLabelMetrics((prev) => ({ ...prev, x: fallbackX }))
        }
      }

      const periodBottom = periodRect ? periodRect.bottom - bannerRect.top : 32
      const detailsRect = detailsRef.current?.getBoundingClientRect()
      const detailsTop = detailsRect ? detailsRect.top - bannerRect.top : bannerRect.height - 30
      const topMin = periodBottom + 14
      const topMax = detailsTop - 14
      const centerX = bannerRect.width / 2
      const outerRadius = (30 + strokeWidth / 2) * (donutSize / 100)
      const leftBound = centerX + outerRadius + 18
      const maxWidth = Math.max(60, bannerRect.width - rightOffset - leftBound)
      const desiredWidth = Math.min(labelWidth, maxWidth)
      const totalHeight = labelHeight * 2 + rightGap
      let baseTop = topMin
      if (baseTop + totalHeight > topMax) {
        baseTop = Math.max(topMin, topMax - totalHeight)
      }
      let fontSize = 11
      if (maxWidth < 110 || topMax - topMin < totalHeight + 4) {
        fontSize = 10
      }
      setRightLabelMetrics((prev) =>
        prev.top !== baseTop || prev.width !== desiredWidth || prev.fontSize !== fontSize
          ? { top: baseTop, width: desiredWidth, fontSize }
          : prev
      )
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [bannerSize.height, bannerSize.width, topLabelMetrics.x, donutSize, strokeWidth, rightOffset, rightGap, labelWidth, labelHeight])

  type LabelSlot = {
    left?: number | string
    right?: number
    top: number
    align: "left" | "right" | "center"
    width: number
    fontSize: number
  }

  const labelSlots: LabelSlot[] = useMemo(() => {
    const centerY = bannerSize.height / 2
    return [
      { left: topLabelMetrics.x, right: undefined, top: 32, align: "center", width: topLabelMetrics.width, fontSize: topLabelMetrics.fontSize },
      { left: 50, right: undefined, top: centerY - 15, align: "left", width: labelWidth, fontSize: 11 },
      { left: 50, right: undefined, top: centerY + 15, align: "left", width: labelWidth, fontSize: 11 },
      { left: undefined, right: rightOffset, top: rightLabelMetrics.top, align: "right", width: rightLabelMetrics.width, fontSize: rightLabelMetrics.fontSize },
      {
        left: undefined,
        right: rightOffset,
        top: rightLabelMetrics.top + labelHeight + rightGap,
        align: "right",
        width: rightLabelMetrics.width,
        fontSize: rightLabelMetrics.fontSize,
      },
    ]
  }, [
    bannerSize.height,
    topLabelMetrics.fontSize,
    topLabelMetrics.width,
    topLabelMetrics.x,
    rightOffset,
    rightLabelMetrics.fontSize,
    rightLabelMetrics.top,
    rightLabelMetrics.width,
    rightGap,
    labelHeight,
    labelWidth,
  ])

  type PositionedLabel = {
    id: string
    name: string
    amount: number
    percent: number
    color: string
    left?: number | string
    right?: number
    top: number
    align: "left" | "right" | "center"
    width: number
    fontSize: number
  }

  const positionedLabels = useMemo<PositionedLabel[]>(() => {
    const sorted = [...expenseSlices].sort((a, b) => b.percent - a.percent)
    return sorted.slice(0, 5).map((slice, idx) => {
      const slot = labelSlots[idx]
      return {
        ...slice,
        left: slot.left,
        right: slot.right,
        top: slot.top,
        align: slot.align,
        width: slot.width,
        fontSize: slot.fontSize,
      }
    })
  }, [expenseSlices, labelSlots])

  type LeaderLine = { id: string; color: string; points: string }

  const leaderLines = useMemo<LeaderLine[]>(() => {
    const centerX = bannerSize.width / 2
    const centerY = bannerSize.height / 2
    const svgScale = donutSize / 100
    const outerRadius = (30 + strokeWidth / 2) * svgScale
    const radialStep = 8

    let startAngle = -Math.PI / 2
    return positionedLabels.map((label, idx) => {
      const slice = expenseSlices.find((s) => s.id === label.id) ?? expenseSlices[idx]
      const sliceAngle = (slice.percent / 100) * Math.PI * 2
      const midAngle = startAngle + sliceAngle / 2
      startAngle += sliceAngle

      const arcX = centerX + Math.cos(midAngle) * outerRadius
      const arcY = centerY + Math.sin(midAngle) * outerRadius
      const midX = centerX + Math.cos(midAngle) * (outerRadius + radialStep)
      const midY = centerY + Math.sin(midAngle) * (outerRadius + radialStep)

      let anchorX = centerX
      let anchorY = label.top
      if (label.align === "left") {
        const numericLeft = typeof label.left === "number" ? label.left : centerX
        anchorX = numericLeft + label.width
      } else if (label.align === "right") {
        const numericRight = label.right ?? 0
        anchorX = bannerSize.width - numericRight - label.width
      } else {
        anchorX = typeof label.left === "number" ? label.left : centerX
        anchorY = label.top + labelHeight / 2
      }

      let endX = anchorX
      let endY = anchorY
      if (label.align === "left") {
        endX = anchorX - 4
      } else if (label.align === "right") {
        endX = anchorX + 4
      } else {
        endY = anchorY - 4
      }

      const points = `${arcX.toFixed(1)},${arcY.toFixed(1)} ${midX.toFixed(1)},${midY.toFixed(1)} ${endX.toFixed(1)},${endY.toFixed(1)}`
      return { id: label.id, color: label.color, points }
    })
  }, [bannerSize.height, bannerSize.width, donutSize, positionedLabels, expenseSlices, strokeWidth])

  const periodButton = (
    <button
      type="button"
      ref={periodRef}
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
            ref={bannerRef}
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
            <div
              ref={titleRef}
              style={{ position: "absolute", top: 10, left: 10, fontSize: 14, fontWeight: 600, color: "#0f172a" }}
            >
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
                  width: donutSize,
                  height: donutSize,
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
                    strokeWidth={strokeWidth}
                  />
                  {donutArcs}
                </svg>
              </div>

              <svg
                viewBox={`0 0 ${bannerSize.width} ${bannerSize.height}`}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                {leaderLines.map((line) => (
                  <polyline
                    key={line.id}
                    points={line.points}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={1.25}
                    strokeOpacity={0.65}
                  />
                ))}
              </svg>

              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                {positionedLabels.map((label) => {
                  const textAlign = label.align === "right" ? "right" : label.align === "center" ? "center" : "left"
                  const translate =
                    label.align === "right"
                      ? "translate(-100%, -50%)"
                      : label.align === "center"
                        ? "translate(-50%, -50%)"
                        : "translate(0, -50%)"
                  return (
                    <div
                      key={label.id}
                      style={{
                        position: "absolute",
                        left: label.left ?? undefined,
                        right: label.right ?? undefined,
                        top: label.top,
                        transform: translate,
                        textAlign,
                        display: "grid",
                        gap: 1,
                        whiteSpace: "nowrap",
                        width: label.width,
                      }}
                    >
                      <div style={{ fontSize: label.fontSize, lineHeight: 1.2, color: "#6b7280" }}>{label.name}</div>
                      <div style={{ fontSize: label.fontSize, lineHeight: 1.2, color: label.color }}>
                        {formatRub(label.amount)} ({formatPercent(label.percent)})
                      </div>
                    </div>
                  )
                })}
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

      <button
        type="button"
        ref={detailsRef}
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
