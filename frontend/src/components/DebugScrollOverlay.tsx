import { useCallback, useEffect, useRef, useState } from "react"

type DebugScrollOverlayProps = {
  activeScreen: string
}

type EventRecord = {
  id: string
  at: string
  label: string
  details: Record<string, unknown>
}

type ElementState = {
  selector: string
  exists: boolean
  tag?: string
  className?: string
  clientHeight?: number
  scrollHeight?: number
  scrollTop?: number
  hasOverflowY?: boolean
  overflowY?: string
  touchAction?: string
  overscrollBehaviorY?: string
  webkitOverflowScrolling?: string
  position?: string
  pointerEvents?: string
}

type Snapshot = {
  at: string
  activeScreen: string
  window: {
    innerHeight: number
    outerHeight: number
    visualViewportHeight: number | null
    visualViewportOffsetTop: number | null
    visualViewportPageTop: number | null
  }
  activeElement: {
    tag: string | null
    name: string | null
    type: string | null
    id: string | null
    className: string | null
  }
  body: ElementState
  documentElement: ElementState
  elements: ElementState[]
}

const MAX_EVENTS = 20
const MOVE_EVENT_INTERVAL_MS = 220

const copyText = async (value: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  if (typeof document === "undefined") return
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)
}

const describeElement = (selector: string, element: HTMLElement | null): ElementState => {
  if (!element) {
    return { selector, exists: false }
  }
  const style = window.getComputedStyle(element)
  return {
    selector,
    exists: true,
    tag: element.tagName.toLowerCase(),
    className: element.className || "",
    clientHeight: Math.round(element.clientHeight),
    scrollHeight: Math.round(element.scrollHeight),
    scrollTop: Math.round(element.scrollTop),
    hasOverflowY: element.scrollHeight > element.clientHeight + 1,
    overflowY: style.overflowY,
    touchAction: style.touchAction,
    overscrollBehaviorY: style.overscrollBehaviorY,
    webkitOverflowScrolling: style.getPropertyValue("-webkit-overflow-scrolling"),
    position: style.position,
    pointerEvents: style.pointerEvents,
  }
}

const getViewportInfo = () => {
  const viewport = window.visualViewport
  return {
    innerHeight: window.innerHeight,
    outerHeight: window.outerHeight,
    visualViewportHeight: viewport ? Math.round(viewport.height) : null,
    visualViewportOffsetTop: viewport ? Math.round(viewport.offsetTop) : null,
    visualViewportPageTop: viewport ? Math.round(viewport.pageTop) : null,
  }
}

const getActiveElementInfo = () => {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) {
    return { tag: null, name: null, type: null, id: null, className: null }
  }
  const inputLike = active as HTMLInputElement
  return {
    tag: active.tagName.toLowerCase(),
    name: "name" in inputLike ? inputLike.name || null : null,
    type: "type" in inputLike ? inputLike.type || null : null,
    id: active.id || null,
    className: active.className || null,
  }
}

const collectSnapshot = (activeScreen: string): Snapshot => {
  const body = document.body
  const html = document.documentElement
  const appShell = document.querySelector<HTMLElement>(".app-shell")
  const appInner = document.querySelector<HTMLElement>(".app-shell__inner")
  const quickAddRoot = document.querySelector<HTMLElement>("[data-quick-add-root='1']")
  const quickAddFooter = document.querySelector<HTMLElement>("[data-quick-add-footer='1']")
  const firstHorizontalList = document.querySelector<HTMLElement>("[data-quick-add-root='1'] [data-hscroll='1']")
  const quickAddForm = quickAddRoot?.firstElementChild instanceof HTMLElement ? quickAddRoot.firstElementChild : null

  return {
    at: new Date().toISOString(),
    activeScreen,
    window: getViewportInfo(),
    activeElement: getActiveElementInfo(),
    body: describeElement("body", body),
    documentElement: describeElement("documentElement", html),
    elements: [
      describeElement(".app-shell", appShell),
      describeElement(".app-shell__inner", appInner),
      describeElement("[data-quick-add-root='1']", quickAddRoot),
      describeElement("[data-quick-add-root='1'] > div", quickAddForm),
      describeElement("[data-quick-add-footer='1']", quickAddFooter),
      describeElement("[data-quick-add-root='1'] [data-hscroll='1']", firstHorizontalList),
    ],
  }
}

const buildReport = (snapshot: Snapshot | null, events: EventRecord[]) =>
  JSON.stringify(
    {
      snapshot,
      events,
    },
    null,
    2,
  )

const targetSummary = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return "unknown"
  const tag = target.tagName.toLowerCase()
  const id = target.id ? `#${target.id}` : ""
  const className =
    typeof target.className === "string" && target.className.trim().length > 0
      ? `.${target.className.trim().split(/\s+/).slice(0, 2).join(".")}`
      : ""
  return `${tag}${id}${className}`
}

export default function DebugScrollOverlay({ activeScreen }: DebugScrollOverlayProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [, setVersion] = useState(0)
  const eventsRef = useRef<EventRecord[]>([])
  const moveEventAtRef = useRef(0)

  const debugEnabled = true

  const pushEvent = useCallback((label: string, details: Record<string, unknown> = {}) => {
    const next: EventRecord = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      label,
      details,
    }
    eventsRef.current = [...eventsRef.current.slice(-(MAX_EVENTS - 1)), next]
    setVersion((value) => value + 1)
  }, [])

  const refreshSnapshot = useCallback((label?: string) => {
    if (typeof window === "undefined" || typeof document === "undefined") return
    if (label) {
      pushEvent(label, {
        ...getViewportInfo(),
        activeElement: getActiveElementInfo().tag,
      })
    }
    setSnapshot(collectSnapshot(activeScreen))
  }, [activeScreen, pushEvent])

  useEffect(() => {
    if (!debugEnabled) return
    refreshSnapshot("debug_scroll_mounted")
  }, [debugEnabled, refreshSnapshot])

  useEffect(() => {
    if (!debugEnabled) return
    const onResize = () => {
      pushEvent("window_resize", getViewportInfo())
      if (isOpen) setSnapshot(collectSnapshot(activeScreen))
    }
    const onFocusIn = (event: FocusEvent) => {
      pushEvent("focus_in", {
        target: targetSummary(event.target),
        activeElement: getActiveElementInfo(),
      })
      if (isOpen) setSnapshot(collectSnapshot(activeScreen))
    }
    const onFocusOut = (event: FocusEvent) => {
      pushEvent("focus_out", {
        target: targetSummary(event.target),
        activeElement: getActiveElementInfo(),
      })
      if (isOpen) setSnapshot(collectSnapshot(activeScreen))
    }

    window.addEventListener("resize", onResize)
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)

    const viewport = window.visualViewport
    const onViewportResize = () => {
      pushEvent("visual_viewport_resize", getViewportInfo())
      if (isOpen) setSnapshot(collectSnapshot(activeScreen))
    }
    const onViewportScroll = () => {
      pushEvent("visual_viewport_scroll", getViewportInfo())
      if (isOpen) setSnapshot(collectSnapshot(activeScreen))
    }

    viewport?.addEventListener("resize", onViewportResize)
    viewport?.addEventListener("scroll", onViewportScroll)

    return () => {
      window.removeEventListener("resize", onResize)
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      viewport?.removeEventListener("resize", onViewportResize)
      viewport?.removeEventListener("scroll", onViewportScroll)
    }
  }, [activeScreen, debugEnabled, isOpen, pushEvent])

  useEffect(() => {
    if (!debugEnabled || activeScreen !== "quick-add") return
    const root = document.querySelector<HTMLElement>("[data-quick-add-root='1']")
    if (!root) {
      pushEvent("quick_add_root_missing")
      return
    }
    pushEvent("quick_add_root_attached")
    const onPointerDown = (event: Event) => {
      const pointer = event as PointerEvent
      pushEvent("quick_add_pointer_down", {
        target: targetSummary(pointer.target),
        defaultPrevented: pointer.defaultPrevented,
        pointerType: pointer.pointerType,
      })
    }
    const onPointerMove = (event: Event) => {
      const pointer = event as PointerEvent
      const now = Date.now()
      if (now - moveEventAtRef.current < MOVE_EVENT_INTERVAL_MS) return
      moveEventAtRef.current = now
      pushEvent("quick_add_pointer_move", {
        target: targetSummary(pointer.target),
        defaultPrevented: pointer.defaultPrevented,
        pointerType: pointer.pointerType,
      })
    }
    const onPointerUp = (event: Event) => {
      const pointer = event as PointerEvent
      pushEvent("quick_add_pointer_up", {
        target: targetSummary(pointer.target),
        defaultPrevented: pointer.defaultPrevented,
        pointerType: pointer.pointerType,
      })
    }
    const onScroll = () => {
      pushEvent("quick_add_scroll", {
        scrollTop: Math.round(root.scrollTop),
      })
    }

    root.addEventListener("pointerdown", onPointerDown, { capture: true })
    root.addEventListener("pointermove", onPointerMove, { capture: true })
    root.addEventListener("pointerup", onPointerUp, { capture: true })
    root.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true)
      root.removeEventListener("pointermove", onPointerMove, true)
      root.removeEventListener("pointerup", onPointerUp, true)
      root.removeEventListener("scroll", onScroll)
    }
  }, [activeScreen, debugEnabled, pushEvent])

  const handleOpen = useCallback(() => {
    refreshSnapshot("debug_panel_opened")
    setIsOpen(true)
  }, [refreshSnapshot])

  const handleCopy = useCallback(() => {
    void copyText(buildReport(snapshot, eventsRef.current))
  }, [snapshot])

  const reportText = buildReport(snapshot, eventsRef.current)

  if (!debugEnabled) return null

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          position: "fixed",
          right: 16,
          bottom: 90,
          zIndex: 9999,
          border: "1px solid rgba(15,23,42,0.16)",
          background: "#fff",
          color: "#0f172a",
          borderRadius: 12,
          width: 44,
          height: 44,
          minWidth: 44,
          minHeight: 44,
          fontSize: 10,
          fontWeight: 700,
          padding: 0,
          lineHeight: 1,
        }}
      >
        DEBUG
      </button>
      {isOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 101,
            background: "rgba(2,6,23,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              width: "min(760px, 100%)",
              maxHeight: "80vh",
              overflowY: "auto",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.1)",
              background: "#fff",
              boxShadow: "0 16px 40px rgba(15,23,42,0.2)",
              padding: 14,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Scroll debug</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => refreshSnapshot("debug_snapshot_refresh")}
                  style={{
                    border: "1px solid rgba(15,23,42,0.15)",
                    borderRadius: 10,
                    background: "#fff",
                    padding: "7px 10px",
                    fontSize: 12,
                  }}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    border: "1px solid rgba(15,23,42,0.15)",
                    borderRadius: 10,
                    background: "#fff",
                    padding: "7px 10px",
                    fontSize: 12,
                  }}
                >
                  Copy debug
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    border: "1px solid rgba(15,23,42,0.15)",
                    borderRadius: 10,
                    background: "#fff",
                    padding: "7px 10px",
                    fontSize: 12,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 11,
                lineHeight: 1.4,
                color: "#0f172a",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: 10,
              }}
            >
              {reportText}
            </pre>
          </div>
        </div>
      ) : null}
    </>
  )
}
