import React, { useCallback, useMemo, useRef, useState } from "react"
import { useAppStore } from "../store/useAppStore"
import { isDebugTimingsStorageEnabled, setDebugTimingsStorageEnabled } from "../utils/debugTimings"
import { CURRENCIES, normalizeCurrency } from "../utils/formatMoney"
import { buildSharedWorkspaceInviteUrl } from "../utils/sharedInviteLink"

type SharedWorkspaceInvite = {
  code: string
  expiresAt: string | null
  maxUses: number | null
  usesCount: number
  botUsername?: string | null
}
type SharedWorkspaceMember = {
  userId: string
  role: "owner" | "member"
  firstName: string | null
  username: string | null
  telegramUserId: string
}

type SettingsPage = "root" | "currency" | "reset" | "shared-access" | "member-remove"

type Props = {
  onOpenCategories?: () => void
  onOpenIconsPreview?: () => void
  canResetWorkspace?: boolean
  onResetWorkspace?: () => Promise<{ ok: boolean; error?: string }>
  isResetWorkspaceRunning?: boolean
  canManageSharedAccess?: boolean
  onLoadSharedInvite?: () => Promise<{ invite: SharedWorkspaceInvite | null; error?: string }>
  onLoadSharedMembers?: () => Promise<{ members: SharedWorkspaceMember[]; error?: string }>
  onRegenerateSharedInvite?: () => Promise<{ ok: boolean; invite: SharedWorkspaceInvite | null; error?: string }>
  isSharedInviteRegenerating?: boolean
  onRemoveSharedMember?: (userId: string) => Promise<{ ok: boolean; error?: string }>
  isSharedMemberRemoving?: boolean
}

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

const SHARED_INVITE_MESSAGE = "Давай вместе вести бюджет 👇"

const SettingsScreen: React.FC<Props> = ({
  onOpenCategories,
  onOpenIconsPreview,
  canResetWorkspace = false,
  onResetWorkspace,
  isResetWorkspaceRunning = false,
  canManageSharedAccess = false,
  onLoadSharedInvite,
  onLoadSharedMembers,
  onRegenerateSharedInvite,
  isSharedInviteRegenerating = false,
  onRemoveSharedMember,
  isSharedMemberRemoving = false,
}) => {
  const { currency, setCurrency } = useAppStore()
  const current = normalizeCurrency(currency)
  const [debugTimingsEnabled, setDebugTimingsEnabledState] = useState(() => isDebugTimingsStorageEnabled())
  const [activePage, setActivePage] = useState<SettingsPage>("root")
  const [currencySearch, setCurrencySearch] = useState("")
  const [pendingCurrencyCode, setPendingCurrencyCode] = useState<string | null>(null)
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0)
  const [resetError, setResetError] = useState<string | null>(null)
  const [sharedInvite, setSharedInvite] = useState<SharedWorkspaceInvite | null>(null)
  const [isSharedInviteLoading, setIsSharedInviteLoading] = useState(false)
  const [sharedInviteError, setSharedInviteError] = useState<string | null>(null)
  const [sharedInviteNotice, setSharedInviteNotice] = useState<string | null>(null)
  const [sharedMembers, setSharedMembers] = useState<SharedWorkspaceMember[]>([])
  const [isSharedMembersLoading, setIsSharedMembersLoading] = useState(false)
  const [sharedMembersError, setSharedMembersError] = useState<string | null>(null)
  const [sharedMembersNotice, setSharedMembersNotice] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<SharedWorkspaceMember | null>(null)
  const resetSheetRef = useRef<HTMLDivElement | null>(null)
  const resetSheetGestureRef = useRef<{
    pointerId: number | null
    startY: number
    dragging: boolean
    tracking: boolean
  }>({
    pointerId: null,
    startY: 0,
    dragging: false,
    tracking: false,
  })
  const [resetSheetDragOffset, setResetSheetDragOffset] = useState(0)
  const [resetSheetClosing, setResetSheetClosing] = useState(false)

  const handleToggleDebugTimings = useCallback(() => {
    const nextValue = !debugTimingsEnabled
    setDebugTimingsStorageEnabled(nextValue)
    setDebugTimingsEnabledState(nextValue)
  }, [debugTimingsEnabled])

  const openCurrencySheet = useCallback(() => {
    setPendingCurrencyCode(current)
    setCurrencySearch("")
    setActivePage("currency")
  }, [current])

  const closeCurrencySheet = useCallback(() => {
    setActivePage("root")
  }, [])

  const loadSharedInvite = useCallback(async () => {
    if (!onLoadSharedInvite) return
    setSharedInviteError(null)
    setSharedInviteNotice(null)
    setIsSharedInviteLoading(true)
    const result = await onLoadSharedInvite()
    if (result.error) {
      setSharedInviteError(result.error)
      setSharedInvite(null)
    } else {
      setSharedInvite(result.invite)
    }
    setIsSharedInviteLoading(false)
  }, [onLoadSharedInvite])

  const loadSharedMembers = useCallback(async () => {
    if (!onLoadSharedMembers) return
    setSharedMembersError(null)
    setSharedMembersNotice(null)
    setIsSharedMembersLoading(true)
    const result = await onLoadSharedMembers()
    if (result.error) {
      setSharedMembersError(result.error)
      setSharedMembers([])
    } else {
      setSharedMembers(result.members)
    }
    setIsSharedMembersLoading(false)
  }, [onLoadSharedMembers])

  const openSharedAccessSheet = useCallback(() => {
    setActivePage("shared-access")
    void (async () => {
      await loadSharedInvite()
      await loadSharedMembers()
    })()
  }, [loadSharedInvite, loadSharedMembers])

  const closeSharedAccessSheet = useCallback(() => {
    if (isSharedInviteRegenerating || isSharedMemberRemoving) return
    setActivePage("root")
    setSharedInviteError(null)
    setSharedInviteNotice(null)
    setSharedMembersError(null)
    setSharedMembersNotice(null)
    setMemberToRemove(null)
  }, [isSharedInviteRegenerating, isSharedMemberRemoving])

  const sharedInviteUrl = useMemo(() => {
    if (!sharedInvite?.code) return ""
    return buildSharedWorkspaceInviteUrl(sharedInvite.code, { botUsername: sharedInvite.botUsername })
  }, [sharedInvite?.botUsername, sharedInvite?.code])

  const sharedInviteShareText = useMemo(() => {
    if (!sharedInviteUrl) return ""
    return `${SHARED_INVITE_MESSAGE}\n\n${sharedInviteUrl}`
  }, [sharedInviteUrl])

  const handleCopySharedInvite = useCallback(async () => {
    if (!sharedInviteShareText) return
    setSharedInviteError(null)
    setSharedInviteNotice(null)
    try {
      await copyText(sharedInviteShareText)
      setSharedInviteNotice("Ссылка скопирована")
    } catch {
      setSharedInviteError("Не удалось скопировать ссылку")
    }
  }, [sharedInviteShareText])

  const handleShareSharedInvite = useCallback(async () => {
    if (!sharedInviteShareText) return
    setSharedInviteError(null)
    setSharedInviteNotice(null)
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text: sharedInviteShareText })
        setSharedInviteNotice("Открыли окно отправки")
        return
      }
      await copyText(sharedInviteShareText)
      setSharedInviteNotice("Ссылка скопирована")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      setSharedInviteError("Не удалось поделиться ссылкой")
    }
  }, [sharedInviteShareText])

  const handleRegenerateSharedInvite = useCallback(async () => {
    if (!onRegenerateSharedInvite || isSharedInviteRegenerating) return
    setSharedInviteError(null)
    setSharedInviteNotice(null)
    const result = await onRegenerateSharedInvite()
    if (!result.ok) {
      setSharedInviteError(result.error ?? "Не удалось создать ссылку")
      return
    }
    setSharedInvite(result.invite)
  }, [isSharedInviteRegenerating, onRegenerateSharedInvite])

  const handleOpenMemberRemove = useCallback((member: SharedWorkspaceMember) => {
    setSharedMembersError(null)
    setSharedMembersNotice(null)
    setMemberToRemove(member)
    setActivePage("member-remove")
  }, [])

  const handleCloseMemberRemove = useCallback(() => {
    if (isSharedMemberRemoving) return
    setMemberToRemove(null)
    setActivePage("shared-access")
  }, [isSharedMemberRemoving])

  const handleConfirmMemberRemove = useCallback(async () => {
    if (!memberToRemove || !onRemoveSharedMember || isSharedMemberRemoving) return
    setSharedMembersError(null)
    setSharedMembersNotice(null)
    const result = await onRemoveSharedMember(memberToRemove.userId)
    if (!result.ok) {
      setSharedMembersError(result.error ?? "Не удалось удалить участника")
      return
    }
    setMemberToRemove(null)
    setActivePage("shared-access")
    await loadSharedMembers()
    setSharedMembersNotice("Участник удален")
  }, [isSharedMemberRemoving, loadSharedMembers, memberToRemove, onRemoveSharedMember])

  const openResetSheet = useCallback(() => {
    setResetError(null)
    setResetStep(1)
    setActivePage("reset")
    setResetSheetDragOffset(0)
    setResetSheetClosing(false)
  }, [])

  const closeResetSheet = useCallback(() => {
    if (isResetWorkspaceRunning) return
    setResetError(null)
    setResetStep(0)
    setActivePage("root")
    setResetSheetDragOffset(0)
    setResetSheetClosing(false)
  }, [isResetWorkspaceRunning])

  const requestCloseResetSheet = useCallback(() => {
    if (isResetWorkspaceRunning) return
    setResetSheetClosing(true)
  }, [isResetWorkspaceRunning])

  const finalizeCloseResetSheet = useCallback(() => {
    setResetSheetClosing(false)
    setResetSheetDragOffset(0)
    closeResetSheet()
  }, [closeResetSheet])

  const handleResetSheetPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isResetWorkspaceRunning || resetSheetClosing) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    const sheet = resetSheetRef.current
    if (!sheet) return
    sheet.setPointerCapture(event.pointerId)
    resetSheetGestureRef.current.pointerId = event.pointerId
    resetSheetGestureRef.current.startY = event.clientY
    resetSheetGestureRef.current.dragging = false
    resetSheetGestureRef.current.tracking = true
  }, [isResetWorkspaceRunning, resetSheetClosing])

  const handleResetSheetPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = resetSheetGestureRef.current
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return
    const deltaY = event.clientY - gesture.startY
    if (deltaY <= 0) {
      if (gesture.dragging && resetSheetDragOffset !== 0) {
        setResetSheetDragOffset(0)
      }
      return
    }
    if (!gesture.dragging) gesture.dragging = true
    setResetSheetDragOffset(deltaY)
  }, [resetSheetDragOffset])

  const finishResetSheetGesture = useCallback((pointerId: number) => {
    const gesture = resetSheetGestureRef.current
    if (!gesture.tracking || gesture.pointerId !== pointerId) return
    const shouldClose = gesture.dragging && resetSheetDragOffset > 90
    gesture.pointerId = null
    gesture.startY = 0
    gesture.dragging = false
    gesture.tracking = false
    if (shouldClose) {
      requestCloseResetSheet()
      return
    }
    setResetSheetDragOffset(0)
  }, [requestCloseResetSheet, resetSheetDragOffset])

  const handleResetSheetPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const sheet = resetSheetRef.current
    if (sheet && sheet.hasPointerCapture(event.pointerId)) {
      sheet.releasePointerCapture(event.pointerId)
    }
    finishResetSheetGesture(event.pointerId)
  }, [finishResetSheetGesture])

  const handleResetSheetPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const sheet = resetSheetRef.current
    if (sheet && sheet.hasPointerCapture(event.pointerId)) {
      sheet.releasePointerCapture(event.pointerId)
    }
    finishResetSheetGesture(event.pointerId)
  }, [finishResetSheetGesture])

  const continueResetSheet = useCallback(() => {
    setResetError(null)
    setResetStep(2)
  }, [])

  const goBackResetSheet = useCallback(() => {
    if (isResetWorkspaceRunning) return
    setResetError(null)
    setResetStep(1)
  }, [isResetWorkspaceRunning])

  const confirmReset = useCallback(async () => {
    if (!onResetWorkspace || isResetWorkspaceRunning) return
    setResetError(null)
    const result = await onResetWorkspace()
    if (result.ok) {
      closeResetSheet()
      return
    }
    setResetError(result.error ?? "Не удалось очистить аккаунт")
  }, [closeResetSheet, isResetWorkspaceRunning, onResetWorkspace])

  const applyCurrencySelection = useCallback(() => {
    if (!pendingCurrencyCode) return
    setCurrency(pendingCurrencyCode)
    setActivePage("root")
  }, [pendingCurrencyCode, setCurrency])

  const selectedCurrencyCode = pendingCurrencyCode ?? current

  const currentCurrencyMeta = useMemo(
    () => CURRENCIES.find((item) => item.code === current) ?? CURRENCIES[0],
    [current],
  )

  const currencySubtitle = currentCurrencyMeta.symbol
    ? `${currentCurrencyMeta.code} (${currentCurrencyMeta.symbol}) — ${currentCurrencyMeta.label}`
    : `${currentCurrencyMeta.code} — ${currentCurrencyMeta.label}`

  const normalizedCurrencySearch = currencySearch.trim().toLowerCase()
  const filteredCurrencies = useMemo(() => {
    if (!normalizedCurrencySearch) return CURRENCIES
    return CURRENCIES.filter(
      (item) =>
        item.code.toLowerCase().includes(normalizedCurrencySearch) ||
        item.label.toLowerCase().includes(normalizedCurrencySearch),
    )
  }, [normalizedCurrencySearch])

  const sharedMembersView = useMemo(
    () =>
      sharedMembers.map((member) => {
        const trimmedFirstName = member.firstName?.trim() ?? ""
        const username = member.username?.trim() ? `@${member.username.trim()}` : null
        const title = trimmedFirstName || username || `Пользователь ${member.telegramUserId}`
        const subtitle = member.role === "owner" ? "Создатель пространства" : username ?? `ID: ${member.telegramUserId}`
        return { ...member, title, subtitle }
      }),
    [sharedMembers],
  )

  const listCardStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    textAlign: "left",
    cursor: "pointer",
    display: "grid",
    gap: 6,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
    position: "relative",
  }
  const listTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "#0f172a" }
  const listSubtitleStyle: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.35,
    color: "#64748b",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    paddingRight: 20,
  }
  const chevronStyle: React.CSSProperties = {
    fontSize: 16,
    color: "#94a3b8",
    lineHeight: 1,
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
  }
  const pageOverlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "#f5f6f8",
    display: "flex",
    justifyContent: "center",
    zIndex: 210,
    overflow: "hidden",
  }
  const pageSurfaceStyle: React.CSSProperties = {
    width: "min(480px, 100%)",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#f5f6f8",
    overflow: "hidden",
  }
  const pageHeaderStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 10px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f5f6f8",
    flexShrink: 0,
  }
  const pageCloseButtonStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  }
  const pageBodyStyle: React.CSSProperties = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
    padding: "12px 16px calc(var(--bottom-nav-height, 72px) + env(safe-area-inset-bottom, 0px) + 12px)",
    display: "grid",
    gap: 12,
    alignContent: "start",
  }

  return (
    <>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Настройки</div>

        <div style={{ display: "grid", gap: 10 }}>
          <button type="button" onClick={openCurrencySheet} style={listCardStyle}>
            <span style={listTitleStyle}>Валюта приложения</span>
            <span style={listSubtitleStyle}>{currencySubtitle}</span>
            <span style={chevronStyle}>›</span>
          </button>

          <button type="button" onClick={onOpenCategories} style={listCardStyle}>
            <span style={listTitleStyle}>Категории</span>
            <span style={listSubtitleStyle}>Управление списком категорий расходов и доходов.</span>
            <span style={chevronStyle}>›</span>
          </button>

          <button type="button" onClick={onOpenIconsPreview} style={listCardStyle}>
            <span style={listTitleStyle}>Иконки (preview)</span>
            <span style={listSubtitleStyle}>Предпросмотр доступных иконок интерфейса.</span>
            <span style={chevronStyle}>›</span>
          </button>

          <div style={{ ...listCardStyle, cursor: "default" }}>
            <span style={listTitleStyle}>Debug timings</span>
            <span style={listSubtitleStyle}>Отладочные тайминги старта приложения.</span>
            <button
              type="button"
              onClick={handleToggleDebugTimings}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                padding: 0,
                fontSize: 14,
                color: "#0f172a",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                textAlign: "left",
              }}
              aria-pressed={debugTimingsEnabled}
            >
              <span>Debug timings</span>
              <span style={{ fontSize: 12, color: debugTimingsEnabled ? "#0369a1" : "#6b7280" }}>
                {debugTimingsEnabled ? "ON" : "OFF"}
              </span>
            </button>
            {debugTimingsEnabled ? (
              <div style={{ fontSize: 12, color: "#0369a1" }}>Enabled. Restart app to measure cold start.</div>
            ) : null}
          </div>

          {canResetWorkspace ? (
            <button type="button" onClick={openResetSheet} style={listCardStyle}>
              <span style={listTitleStyle}>Очистить аккаунт</span>
              <span style={listSubtitleStyle}>Удалит все данные и начнет учет заново</span>
              <span style={chevronStyle}>›</span>
            </button>
          ) : null}

          {canManageSharedAccess ? (
            <button type="button" onClick={openSharedAccessSheet} style={listCardStyle}>
              <span style={listTitleStyle}>Совместный доступ</span>
              <span style={listSubtitleStyle}>Для учета в малом бизнесе или ведения совместного бюджета семьи</span>
              <span style={chevronStyle}>›</span>
            </button>
          ) : null}
        </div>
      </div>

      {activePage === "currency" ? (
        <div role="dialog" aria-modal="true" style={pageOverlayStyle}>
          <div style={pageSurfaceStyle}>
            <div style={pageHeaderStyle}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Валюта приложения</div>
              <button type="button" onClick={closeCurrencySheet} style={pageCloseButtonStyle}>
                Закрыть
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: "1 1 auto", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px 0", flexShrink: 0 }}>
                <input
                  value={currencySearch}
                  onChange={(event) => setCurrencySearch(event.target.value)}
                  placeholder="Поиск валюты"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 15,
                    outline: "none",
                    boxShadow: "none",
                    WebkitAppearance: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                />
              </div>

              <div style={{ padding: "12px 16px 0", minHeight: 0, flex: "1 1 auto", display: "flex" }}>
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    background: "#fff",
                    minHeight: 0,
                    overflow: "auto",
                    WebkitOverflowScrolling: "touch",
                    flex: "1 1 auto",
                  }}
                >
                  {filteredCurrencies.map((item, index) => {
                    const isSelected = selectedCurrencyCode === item.code
                    const trailing = item.symbol ? `${item.code} • ${item.symbol}` : item.code
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => setPendingCurrencyCode(item.code)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          border: "none",
                          borderBottom: index === filteredCurrencies.length - 1 ? "none" : "1px solid #f1f5f9",
                          background: isSelected ? "#f8fafc" : "#fff",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            border: "1px solid " + (isSelected ? "#0f172a" : "#cbd5e1"),
                            background: isSelected ? "#0f172a" : "#fff",
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            flex: "0 0 auto",
                          }}
                          aria-hidden="true"
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.label}
                        </span>
                        <span style={{ flex: "0 0 auto", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{trailing}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div
                style={{
                  flexShrink: 0,
                  padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)",
                }}
              >
                <button
                  type="button"
                  onClick={applyCurrencySelection}
                  disabled={!pendingCurrencyCode}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #0f172a",
                    background: pendingCurrencyCode ? "#0f172a" : "#e5e7eb",
                    color: pendingCurrencyCode ? "#fff" : "#6b7280",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: pendingCurrencyCode ? "pointer" : "not-allowed",
                  }}
                >
                  Выбрать валюту
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activePage === "reset" && resetStep !== 0 ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={requestCloseResetSheet}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 220,
            opacity: resetSheetClosing ? 0 : 1,
            transition: "opacity 180ms ease-out",
          }}
        >
          <div
            ref={resetSheetRef}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={handleResetSheetPointerDown}
            onPointerMove={handleResetSheetPointerMove}
            onPointerUp={handleResetSheetPointerUp}
            onPointerCancel={handleResetSheetPointerCancel}
            onTransitionEnd={(event) => {
              if (event.propertyName !== "transform") return
              if (!resetSheetClosing) return
              finalizeCloseResetSheet()
            }}
            style={{
              width: "min(480px, 100%)",
              background: "#fff",
              borderRadius: "16px 16px 0 0",
              borderTop: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 -12px 30px rgba(15,23,42,0.2)",
              height: "min(50dvh, calc(var(--app-height, 100dvh) - 20px))",
              minHeight: "min(50dvh, calc(var(--app-height, 100dvh) - 20px))",
              maxHeight: "min(50dvh, calc(var(--app-height, 100dvh) - 20px))",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
              transform: resetSheetClosing
                ? "translateY(100%)"
                : resetSheetDragOffset > 0
                  ? `translateY(${resetSheetDragOffset}px)`
                  : "translateY(0)",
              transition: resetSheetDragOffset > 0 && !resetSheetClosing ? "none" : "transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              touchAction: "pan-y",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Очистить аккаунт</div>
              <button
                type="button"
                onClick={requestCloseResetSheet}
                disabled={isResetWorkspaceRunning}
                style={{
                  ...pageCloseButtonStyle,
                  opacity: isResetWorkspaceRunning ? 0.6 : 1,
                  cursor: isResetWorkspaceRunning ? "not-allowed" : "pointer",
                }}
              >
                Закрыть
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gap: 12,
                alignContent: "start",
                padding: "12px 16px",
                overflowY: "auto",
                minHeight: 0,
                flex: "1 1 auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                {resetStep === 1 ? "Вы уверены?" : "Подтвердите очистку аккаунта"}
              </div>
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.4 }}>
                {resetStep === 1
                  ? "Все операции, счета, цели, долги и пользовательские категории будут удалены. Это действие нельзя отменить."
                  : "После очистки останутся только данные по умолчанию. Валюта приложения сохранится."}
              </div>
              {resetError ? <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.35 }}>{resetError}</div> : null}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                {resetStep === 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={requestCloseResetSheet}
                      style={{
                        padding: "11px 14px",
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        color: "#0f172a",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={continueResetSheet}
                      style={{
                        padding: "11px 14px",
                        borderRadius: 12,
                        border: "1px solid #0f172a",
                        background: "#0f172a",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Продолжить
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={goBackResetSheet}
                      disabled={isResetWorkspaceRunning}
                      style={{
                        padding: "11px 14px",
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        color: "#0f172a",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: isResetWorkspaceRunning ? "not-allowed" : "pointer",
                        opacity: isResetWorkspaceRunning ? 0.6 : 1,
                      }}
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={confirmReset}
                      disabled={isResetWorkspaceRunning}
                      style={{
                        padding: "11px 14px",
                        borderRadius: 12,
                        border: "1px solid #b91c1c",
                        background: "#b91c1c",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: isResetWorkspaceRunning ? "not-allowed" : "pointer",
                        opacity: isResetWorkspaceRunning ? 0.75 : 1,
                      }}
                    >
                      {isResetWorkspaceRunning ? "Очищаем..." : "Очистить аккаунт"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activePage === "shared-access" ? (
        <div role="dialog" aria-modal="true" style={pageOverlayStyle}>
          <div style={pageSurfaceStyle}>
            <div style={pageHeaderStyle}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Совместный доступ</div>
              <button
                type="button"
                onClick={closeSharedAccessSheet}
                disabled={isSharedInviteRegenerating || isSharedMemberRemoving}
                style={{
                  ...pageCloseButtonStyle,
                  opacity: isSharedInviteRegenerating || isSharedMemberRemoving ? 0.6 : 1,
                  cursor: isSharedInviteRegenerating || isSharedMemberRemoving ? "not-allowed" : "pointer",
                }}
              >
                Закрыть
              </button>
            </div>
            <div style={pageBodyStyle}>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.35 }}>
                По этой ссылке пользователь сможет присоединиться к вашему пространству
              </div>

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: "#f8fafc",
                  padding: "10px 12px",
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    color: sharedInviteUrl ? "#0f172a" : "#94a3b8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {isSharedInviteLoading ? "Загружаем ссылку..." : sharedInviteUrl || "Ссылка еще не создана"}
                </span>
                <button
                  type="button"
                  onClick={handleShareSharedInvite}
                  disabled={!sharedInviteUrl || isSharedInviteLoading || isSharedInviteRegenerating}
                  title="Поделиться"
                  aria-label="Поделиться ссылкой приглашения"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: !sharedInviteUrl || isSharedInviteLoading || isSharedInviteRegenerating ? "not-allowed" : "pointer",
                    opacity: !sharedInviteUrl || isSharedInviteLoading || isSharedInviteRegenerating ? 0.6 : 1,
                    flex: "0 0 auto",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 12.5V18a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="m8.5 6.5 3.5-3.5 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {sharedInviteError ? <div style={{ fontSize: 13, color: "#b91c1c" }}>{sharedInviteError}</div> : null}
              {sharedInviteNotice ? <div style={{ fontSize: 13, color: "#0369a1" }}>{sharedInviteNotice}</div> : null}

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Участники</div>
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    background: "#fff",
                    overflow: "hidden",
                    maxHeight: 300,
                    overflowY: "auto",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {isSharedMembersLoading ? (
                    <div style={{ padding: "10px 12px", fontSize: 13, color: "#64748b" }}>Загружаем участников...</div>
                  ) : sharedMembersView.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 13, color: "#64748b" }}>Участников пока нет</div>
                  ) : (
                    sharedMembersView.map((member, index) => (
                      <div
                        key={member.userId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderBottom: index === sharedMembersView.length - 1 ? "none" : "1px solid #f1f5f9",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                          <div style={{ fontSize: 13, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {member.title}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {member.subtitle}
                          </div>
                        </div>
                        {member.role === "owner" ? (
                          <span style={{ fontSize: 11, color: "#0369a1", fontWeight: 600, flex: "0 0 auto" }}>owner</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenMemberRemove(member)}
                            disabled={isSharedMemberRemoving || isSharedInviteRegenerating}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 8,
                              border: "1px solid #fecaca",
                              background: "#fff5f5",
                              color: "#b91c1c",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: isSharedMemberRemoving || isSharedInviteRegenerating ? "not-allowed" : "pointer",
                              opacity: isSharedMemberRemoving || isSharedInviteRegenerating ? 0.65 : 1,
                              flex: "0 0 auto",
                            }}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {sharedMembersError ? <div style={{ fontSize: 13, color: "#b91c1c" }}>{sharedMembersError}</div> : null}
                {sharedMembersNotice ? <div style={{ fontSize: 13, color: "#0369a1" }}>{sharedMembersNotice}</div> : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <button
                  type="button"
                  onClick={handleCopySharedInvite}
                  disabled={!sharedInviteUrl || isSharedInviteLoading || isSharedInviteRegenerating}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "#0f172a",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: !sharedInviteUrl || isSharedInviteLoading || isSharedInviteRegenerating ? "not-allowed" : "pointer",
                    opacity: !sharedInviteUrl || isSharedInviteLoading || isSharedInviteRegenerating ? 0.6 : 1,
                  }}
                >
                  Скопировать ссылку
                </button>

                <button
                  type="button"
                  onClick={handleRegenerateSharedInvite}
                  disabled={isSharedInviteLoading || isSharedInviteRegenerating || isSharedMemberRemoving}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: isSharedInviteLoading || isSharedInviteRegenerating || isSharedMemberRemoving ? "not-allowed" : "pointer",
                    opacity: isSharedInviteLoading || isSharedInviteRegenerating || isSharedMemberRemoving ? 0.7 : 1,
                  }}
                >
                  {isSharedInviteRegenerating ? "Обновляем..." : sharedInvite ? "Перевыпустить ссылку" : "Создать ссылку"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activePage === "member-remove" && memberToRemove ? (
        <div role="dialog" aria-modal="true" style={pageOverlayStyle}>
          <div style={pageSurfaceStyle}>
            <div style={pageHeaderStyle}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Удалить участника</div>
              <button
                type="button"
                onClick={handleCloseMemberRemove}
                disabled={isSharedMemberRemoving}
                style={{
                  ...pageCloseButtonStyle,
                  opacity: isSharedMemberRemoving ? 0.6 : 1,
                  cursor: isSharedMemberRemoving ? "not-allowed" : "pointer",
                }}
              >
                Назад
              </button>
            </div>
            <div style={pageBodyStyle}>
              <div
                style={{
                  borderRadius: 16,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
                  padding: 16,
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Удалить участника?</div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.4 }}>
                  Пользователь будет исключен из общего пространства и потеряет к нему доступ.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleCloseMemberRemove}
                    disabled={isSharedMemberRemoving}
                    style={{
                      padding: "11px 14px",
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#0f172a",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: isSharedMemberRemoving ? "not-allowed" : "pointer",
                      opacity: isSharedMemberRemoving ? 0.6 : 1,
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmMemberRemove}
                    disabled={isSharedMemberRemoving}
                    style={{
                      padding: "11px 14px",
                      borderRadius: 12,
                      border: "1px solid #b91c1c",
                      background: "#b91c1c",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: isSharedMemberRemoving ? "not-allowed" : "pointer",
                      opacity: isSharedMemberRemoving ? 0.7 : 1,
                    }}
                  >
                    {isSharedMemberRemoving ? "Удаляем..." : "Удалить"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default SettingsScreen
