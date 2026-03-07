import React, { useCallback, useMemo, useState } from "react"
import "../components/TransactionModal.css"
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

const buildTelegramShareUrl = (inviteUrl: string) => {
  const url = new URL("https://t.me/share/url")
  url.searchParams.set("url", inviteUrl)
  url.searchParams.set("text", SHARED_INVITE_MESSAGE)
  return url.toString()
}

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
  const [isCurrencySheetOpen, setIsCurrencySheetOpen] = useState(false)
  const [currencySearch, setCurrencySearch] = useState("")
  const [pendingCurrencyCode, setPendingCurrencyCode] = useState<string | null>(null)
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0)
  const [resetError, setResetError] = useState<string | null>(null)
  const [isSharedAccessSheetOpen, setIsSharedAccessSheetOpen] = useState(false)
  const [sharedInvite, setSharedInvite] = useState<SharedWorkspaceInvite | null>(null)
  const [isSharedInviteLoading, setIsSharedInviteLoading] = useState(false)
  const [sharedInviteError, setSharedInviteError] = useState<string | null>(null)
  const [sharedInviteNotice, setSharedInviteNotice] = useState<string | null>(null)
  const [sharedMembers, setSharedMembers] = useState<SharedWorkspaceMember[]>([])
  const [isSharedMembersLoading, setIsSharedMembersLoading] = useState(false)
  const [sharedMembersError, setSharedMembersError] = useState<string | null>(null)
  const [sharedMembersNotice, setSharedMembersNotice] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<SharedWorkspaceMember | null>(null)

  const handleToggleDebugTimings = useCallback(() => {
    const nextValue = !debugTimingsEnabled
    setDebugTimingsStorageEnabled(nextValue)
    setDebugTimingsEnabledState(nextValue)
  }, [debugTimingsEnabled])

  const openCurrencySheet = useCallback(() => {
    setPendingCurrencyCode(current)
    setCurrencySearch("")
    setIsCurrencySheetOpen(true)
  }, [current])

  const closeCurrencySheet = useCallback(() => {
    setIsCurrencySheetOpen(false)
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
    setIsSharedAccessSheetOpen(true)
    void (async () => {
      await loadSharedInvite()
      await loadSharedMembers()
    })()
  }, [loadSharedInvite, loadSharedMembers])

  const closeSharedAccessSheet = useCallback(() => {
    if (isSharedInviteRegenerating || isSharedMemberRemoving) return
    setIsSharedAccessSheetOpen(false)
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
    if (!sharedInviteUrl || !sharedInviteShareText) return
    setSharedInviteError(null)
    setSharedInviteNotice(null)
    const shareUrl = buildTelegramShareUrl(sharedInviteUrl)
    try {
      const webApp = window.Telegram?.WebApp as
        | {
            openTelegramLink?: (url: string) => void
            openLink?: (url: string) => void
          }
        | undefined
      if (typeof webApp?.openTelegramLink === "function") {
        webApp.openTelegramLink(shareUrl)
        setSharedInviteNotice("Открыли окно отправки")
        return
      }
      if (typeof webApp?.openLink === "function") {
        webApp.openLink(shareUrl)
        setSharedInviteNotice("Открыли окно отправки")
        return
      }
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text: sharedInviteShareText, url: sharedInviteUrl })
        setSharedInviteNotice("Открыли окно отправки")
        return
      }
      window.open(shareUrl, "_blank", "noopener,noreferrer")
      setSharedInviteNotice("Открыли окно отправки")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      setSharedInviteError("Не удалось поделиться ссылкой")
    }
  }, [sharedInviteShareText, sharedInviteUrl])

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
  }, [])

  const handleCloseMemberRemove = useCallback(() => {
    if (isSharedMemberRemoving) return
    setMemberToRemove(null)
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
    await loadSharedMembers()
    setSharedMembersNotice("Участник удален")
  }, [isSharedMemberRemoving, loadSharedMembers, memberToRemove, onRemoveSharedMember])

  const openResetSheet = useCallback(() => {
    setResetError(null)
    setResetStep(1)
  }, [])

  const closeResetSheet = useCallback(() => {
    if (isResetWorkspaceRunning) return
    setResetError(null)
    setResetStep(0)
  }, [isResetWorkspaceRunning])

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
      setResetStep(0)
      return
    }
    setResetError(result.error ?? "Не удалось очистить аккаунт")
  }, [isResetWorkspaceRunning, onResetWorkspace])

  const applyCurrencySelection = useCallback(() => {
    if (!pendingCurrencyCode) return
    setCurrency(pendingCurrencyCode)
    setIsCurrencySheetOpen(false)
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

      {isCurrencySheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeCurrencySheet}
          className="tx-modal__backdrop"
          style={{ padding: "0 12px calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="tx-modal"
            style={{
              maxWidth: 640,
              width: "100%",
              padding: "16px",
              margin: "0 auto",
              borderRadius: "18px 18px 20px 20px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
              maxHeight: "calc(100dvh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px)",
            }}
          >
            <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Валюта приложения</div>
                <button
                  type="button"
                  onClick={closeCurrencySheet}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Закрыть
                </button>
              </div>

              <input
                value={currencySearch}
                onChange={(event) => setCurrencySearch(event.target.value)}
                placeholder="Поиск валюты"
                style={{
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

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: "#fff",
                  height: 320,
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  WebkitOverflowScrolling: "touch",
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

              <button
                type="button"
                onClick={applyCurrencySelection}
                disabled={!pendingCurrencyCode}
                style={{
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
      ) : null}

      {resetStep !== 0 ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeResetSheet}
          className="tx-modal__backdrop"
          style={{
            alignItems: "center",
            padding: "12px 12px calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 18,
              background: "#fff",
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 45px rgba(15, 23, 42, 0.14)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
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
                    onClick={closeResetSheet}
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
      ) : null}

      {isSharedAccessSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeSharedAccessSheet}
          className="tx-modal__backdrop"
          style={{
            alignItems: "center",
            padding: "12px 12px calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 460,
              borderRadius: 18,
              background: "#fff",
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 45px rgba(15, 23, 42, 0.14)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Пригласить пользователя</div>
              <button
                type="button"
                onClick={closeSharedAccessSheet}
                disabled={isSharedInviteRegenerating}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  fontWeight: 600,
                  color: "#0f172a",
                  cursor: isSharedInviteRegenerating ? "not-allowed" : "pointer",
                  opacity: isSharedInviteRegenerating ? 0.6 : 1,
                }}
              >
                Закрыть
              </button>
            </div>

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
                  maxHeight: 220,
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
      ) : null}

      {memberToRemove ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={handleCloseMemberRemove}
          className="tx-modal__backdrop"
          style={{
            alignItems: "center",
            padding: "12px 12px calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 18,
              background: "#fff",
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 45px rgba(15, 23, 42, 0.14)",
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
      ) : null}
    </>
  )
}

export default SettingsScreen
