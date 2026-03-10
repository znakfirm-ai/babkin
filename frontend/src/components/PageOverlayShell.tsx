import { useEffect, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react"
import "./PageOverlayShell.css"

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "style"> & {
  [key: `data-${string}`]: string | number | boolean | undefined
}

type PageOverlayShellProps = {
  header?: ReactNode
  children: ReactNode
  title?: ReactNode
  onClose?: () => void
  closeLabel?: string
  rootRef?: Ref<HTMLDivElement>
  scrollRef?: Ref<HTMLDivElement>
  rootClassName?: string
  scrollClassName?: string
  rootStyle?: CSSProperties
  scrollStyle?: CSSProperties
  rootProps?: DivProps
  scrollProps?: DivProps
  lockBackgroundScroll?: boolean
  animate?: boolean
  isClosing?: boolean
  safeAreaTop?: boolean
  safeAreaBottom?: boolean
  onCloseAnimationEnd?: () => void
}

type ScrollLockSnapshot = {
  rootOverflow: string
  rootOverscrollBehavior: string
  bodyOverflow: string
  appInnerOverflowY: string
  appInnerOverscrollBehavior: string
  appInnerWebkitOverflowScrolling: string
  appInnerScrollTop: number
}

let scrollLockCount = 0
let scrollLockSnapshot: ScrollLockSnapshot | null = null
let scrollLockAppInner: HTMLElement | null = null

const lockBackgroundScroll = () => {
  if (typeof document === "undefined") return
  scrollLockCount += 1
  if (scrollLockCount > 1) return
  const root = document.documentElement
  const body = document.body
  const appInner = document.querySelector<HTMLElement>(".app-shell__inner")
  scrollLockAppInner = appInner
  scrollLockSnapshot = {
    rootOverflow: root.style.overflow,
    rootOverscrollBehavior: root.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    appInnerOverflowY: appInner?.style.overflowY ?? "",
    appInnerOverscrollBehavior: appInner?.style.overscrollBehavior ?? "",
    appInnerWebkitOverflowScrolling: appInner?.style.getPropertyValue("-webkit-overflow-scrolling") ?? "",
    appInnerScrollTop: appInner?.scrollTop ?? 0,
  }
  root.style.overflow = "hidden"
  root.style.overscrollBehavior = "none"
  body.style.overflow = "hidden"
  if (appInner) {
    appInner.style.overflowY = "hidden"
    appInner.style.overscrollBehavior = "none"
    appInner.style.setProperty("-webkit-overflow-scrolling", "auto")
  }
}

const unlockBackgroundScroll = () => {
  if (typeof document === "undefined") return
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount > 0) return
  if (!scrollLockSnapshot) return

  const root = document.documentElement
  const body = document.body
  root.style.overflow = scrollLockSnapshot.rootOverflow
  root.style.overscrollBehavior = scrollLockSnapshot.rootOverscrollBehavior
  body.style.overflow = scrollLockSnapshot.bodyOverflow
  if (scrollLockAppInner) {
    scrollLockAppInner.style.overflowY = scrollLockSnapshot.appInnerOverflowY
    scrollLockAppInner.style.overscrollBehavior = scrollLockSnapshot.appInnerOverscrollBehavior
    if (scrollLockSnapshot.appInnerWebkitOverflowScrolling) {
      scrollLockAppInner.style.setProperty("-webkit-overflow-scrolling", scrollLockSnapshot.appInnerWebkitOverflowScrolling)
    } else {
      scrollLockAppInner.style.removeProperty("-webkit-overflow-scrolling")
    }
    scrollLockAppInner.scrollTop = scrollLockSnapshot.appInnerScrollTop
  }

  scrollLockSnapshot = null
  scrollLockAppInner = null
}

const buildClassName = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ")

const defaultRootStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
}

const defaultScrollStyle: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehaviorY: "contain",
  WebkitOverflowScrolling: "touch",
}

const defaultHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 16px",
  borderBottom: "1px solid #e5e7eb",
  flexShrink: 0,
  background: "inherit",
}

const defaultCloseButtonStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#2563eb",
  fontWeight: 600,
  cursor: "pointer",
}

export default function PageOverlayShell({
  header,
  children,
  title,
  onClose,
  closeLabel = "Закрыть",
  rootRef,
  scrollRef,
  rootClassName,
  scrollClassName,
  rootStyle,
  scrollStyle,
  rootProps,
  scrollProps,
  lockBackgroundScroll: shouldLockBackgroundScroll = false,
  animate = true,
  isClosing = false,
  safeAreaTop = false,
  safeAreaBottom = false,
  onCloseAnimationEnd,
}: PageOverlayShellProps) {
  useEffect(() => {
    if (!shouldLockBackgroundScroll) return
    lockBackgroundScroll()
    return () => {
      unlockBackgroundScroll()
    }
  }, [shouldLockBackgroundScroll])

  const composedRootClassName = buildClassName(
    "page-overlay-shell",
    animate && "page-overlay-shell--animated",
    isClosing && "page-overlay-shell--closing",
    safeAreaTop && "page-overlay-shell--safe-top",
    safeAreaBottom && "page-overlay-shell--safe-bottom",
    rootClassName,
  )
  const composedScrollClassName = buildClassName("page-overlay-shell__scroll", scrollClassName)
  const headerNode =
    header ??
    (title || onClose ? (
      <div className="page-overlay-shell__header" style={defaultHeaderStyle}>
        <div className="page-overlay-shell__title">{title}</div>
        {onClose ? (
          <button type="button" onClick={onClose} style={defaultCloseButtonStyle}>
            {closeLabel}
          </button>
        ) : null}
      </div>
    ) : null)

  return (
    <div
      ref={rootRef}
      className={composedRootClassName}
      style={{ ...defaultRootStyle, ...rootStyle }}
      {...rootProps}
      onAnimationEnd={isClosing ? onCloseAnimationEnd : undefined}
    >
      {headerNode}
      <div ref={scrollRef} className={composedScrollClassName} style={{ ...defaultScrollStyle, ...scrollStyle }} {...scrollProps}>
        {children}
      </div>
    </div>
  )
}
