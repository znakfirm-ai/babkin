import { normalizeCurrency } from "./formatMoney"

export type DiagnosticsLevel = "info" | "warn" | "error"

type DiagnosticsEvent = {
  id: number
  at: number
  isoTime: string
  level: DiagnosticsLevel
  type: string
  screen: string | null
  detailFlow: string | null
  actionId: string | null
  payload?: unknown
}

type DiagnosticsErrorRecord = {
  at: number
  isoTime: string
  source: string
  actionId: string | null
  name: string
  message: string
  stack: string | null
  cause: string | null
}

type DiagnosticsPersistenceRecord = {
  at: number
  isoTime: string
  key: string
  operation: "read" | "write"
  phase: "start" | "success" | "fail"
  size: number | null
  error: string | null
}

type DiagnosticsUiState = {
  screen: string | null
  detailFlow: string | null
  openSheets: string[]
  datePickerOpen: boolean
  bottomNavHidden: boolean
  navigationState: string | null
}

type DiagnosticsFormState = {
  formType: string | null
  mode: string | null
  keyFields: Record<string, unknown>
  validationState: string | null
  dirty: boolean
  isSubmitting: boolean
  submitAttempts: number
  lastChangedField: string | null
}

type DiagnosticsLastAction = {
  actionId: string
  actionType: string
  phase: string
  startedAt: number
  startedAtIso: string
  sourceScreen: string | null
  entityType: string | null
  entityId: string | null
}

type CrashSnapshot = {
  capturedAt: string
  capturedAtMs: number
  source: string
  actionId: string | null
  error: {
    name: string
    message: string
    stack: string | null
    cause: string | null
  }
  uiState: DiagnosticsUiState
  formState: DiagnosticsFormState
  pendingFlags: Record<string, boolean>
  lastAction: DiagnosticsLastAction | null
  recentEvents: DiagnosticsEvent[]
  recentErrors: DiagnosticsErrorRecord[]
  persistence: DiagnosticsPersistenceRecord[]
}

type StartActionOptions = {
  sourceScreen?: string | null
  entityType?: string | null
  entityId?: string | null
  payload?: Record<string, unknown>
}

const DIAGNOSTICS_UNLOCK_KEY = "__bf_diag_unlocked__"
const DIAGNOSTICS_LAST_CRASH_KEY = "__bf_diag_last_crash__"
const DIAGNOSTICS_MAX_EVENTS = 320
const DIAGNOSTICS_MAX_ERRORS = 60
const DIAGNOSTICS_MAX_PERSISTENCE = 80
const DIAGNOSTICS_REPORT_EVENTS = 120
const DIAGNOSTICS_REPORT_ERRORS = 20
const DIAGNOSTICS_REPORT_PERSISTENCE = 40

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0"
const GIT_SHA = import.meta.env.VITE_GIT_SHA ?? "unknown"
const BUILD_TIME = import.meta.env.VITE_BUILD_TIME ?? "unknown"

let eventIdCounter = 0
let actionCounter = 0
let sessionInitialized = false
let sessionStartedAtIso = ""
let sessionId = ""
let unlockTapCount = 0
let unlockLastTapAt = 0

const events: DiagnosticsEvent[] = []
const errorRecords: DiagnosticsErrorRecord[] = []
const persistenceRecords: DiagnosticsPersistenceRecord[] = []
const pendingFlags = new Map<string, boolean>()
const componentMountCounts = new Map<string, number>()
const lastRefetchByScope = new Map<string, number>()
const actionById = new Map<string, { actionType: string; startedAt: number }>()
const actionIdByType = new Map<string, string>()

let uiState: DiagnosticsUiState = {
  screen: null,
  detailFlow: null,
  openSheets: [],
  datePickerOpen: false,
  bottomNavHidden: false,
  navigationState: null,
}

let formState: DiagnosticsFormState = {
  formType: null,
  mode: null,
  keyFields: {},
  validationState: null,
  dirty: false,
  isSubmitting: false,
  submitAttempts: 0,
  lastChangedField: null,
}

let lastAction: DiagnosticsLastAction | null = null
let persistedCrashSnapshot: CrashSnapshot | null = null

const getNow = () => Date.now()
const getIso = (time: number) => new Date(time).toISOString()

const trimString = (value: string, max = 280) => (value.length <= max ? value : `${value.slice(0, max)}…`)

const toCompactValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return trimString(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return {
      name: value.name,
      message: trimString(value.message),
      stack: value.stack ? trimString(value.stack, 800) : null,
    }
  }
  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`
    return value.slice(0, 20).map((item) => toCompactValue(item, depth + 1))
  }
  if (typeof value === "object") {
    if (depth >= 2) return "[object]"
    const record = value as Record<string, unknown>
    const entries = Object.entries(record).slice(0, 20)
    const compact: Record<string, unknown> = {}
    for (const [key, entryValue] of entries) {
      compact[key] = toCompactValue(entryValue, depth + 1)
    }
    return compact
  }
  return String(value)
}

const pushToRing = <T,>(target: T[], item: T, max: number) => {
  target.push(item)
  if (target.length > max) {
    target.splice(0, target.length - max)
  }
}

const safeParseJson = <T,>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const getStorage = () => {
  if (typeof window === "undefined") return null
  return window.localStorage
}

const getTelegramMeta = () => {
  if (typeof window === "undefined") {
    return {
      telegramVersion: "n/a",
      telegramPlatform: "n/a",
      hasTelegramUserId: false,
    }
  }
  const webApp = window.Telegram?.WebApp as
    | ({
        version?: string
        platform?: string
        initDataUnsafe?: { user?: { id?: string | number } | null }
      } & object)
    | undefined
  const userId = webApp?.initDataUnsafe?.user?.id
  return {
    telegramVersion: typeof webApp?.version === "string" ? webApp.version : "unknown",
    telegramPlatform: typeof webApp?.platform === "string" ? webApp.platform : "unknown",
    hasTelegramUserId: typeof userId === "string" || typeof userId === "number",
  }
}

const createSessionId = () => {
  const salt = Math.random().toString(36).slice(2, 8)
  return `session-${Date.now().toString(36)}-${salt}`
}

const persistCrashSnapshot = (snapshot: CrashSnapshot) => {
  persistedCrashSnapshot = snapshot
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(DIAGNOSTICS_LAST_CRASH_KEY, JSON.stringify(snapshot))
  } catch {
    // no-op
  }
}

const loadPersistedCrashSnapshot = () => {
  if (persistedCrashSnapshot) return persistedCrashSnapshot
  const storage = getStorage()
  if (!storage) return null
  const raw = storage.getItem(DIAGNOSTICS_LAST_CRASH_KEY)
  if (!raw) return null
  const parsed = safeParseJson<CrashSnapshot>(raw)
  persistedCrashSnapshot = parsed
  return persistedCrashSnapshot
}

const readPendingFlags = () => {
  const flags: Record<string, boolean> = {}
  pendingFlags.forEach((value, key) => {
    if (value) {
      flags[key] = true
    }
  })
  return flags
}

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: trimString(error.message, 500),
      stack: error.stack ? trimString(error.stack, 5000) : null,
      cause: error.cause ? trimString(String(error.cause), 500) : null,
    }
  }
  return {
    name: "UnknownError",
    message: trimString(typeof error === "string" ? error : JSON.stringify(toCompactValue(error))),
    stack: null,
    cause: null,
  }
}

export const initDiagnosticsSession = () => {
  if (sessionInitialized) return
  const now = getNow()
  sessionInitialized = true
  sessionStartedAtIso = getIso(now)
  sessionId = createSessionId()
  loadPersistedCrashSnapshot()
  logDiagnosticEvent("app.session.start", {
    appVersion: APP_VERSION,
    gitSha: GIT_SHA,
    buildTime: BUILD_TIME,
  })
}

export const isDiagnosticsUnlocked = () => {
  const storage = getStorage()
  return storage?.getItem(DIAGNOSTICS_UNLOCK_KEY) === "1"
}

export const setDiagnosticsUnlocked = (enabled: boolean) => {
  const storage = getStorage()
  if (!storage) return
  if (enabled) {
    storage.setItem(DIAGNOSTICS_UNLOCK_KEY, "1")
  } else {
    storage.removeItem(DIAGNOSTICS_UNLOCK_KEY)
  }
}

export const registerDiagnosticsUnlockTap = (requiredTaps = 5, timeoutMs = 1600) => {
  const now = getNow()
  if (now - unlockLastTapAt > timeoutMs) {
    unlockTapCount = 0
  }
  unlockLastTapAt = now
  unlockTapCount += 1
  if (unlockTapCount < requiredTaps) return false
  unlockTapCount = 0
  setDiagnosticsUnlocked(true)
  logDiagnosticEvent("diagnostics.unlock")
  return true
}

export const logDiagnosticEvent = (
  type: string,
  payload?: Record<string, unknown> | null,
  options?: { level?: DiagnosticsLevel; actionId?: string | null },
) => {
  initDiagnosticsSession()
  const at = getNow()
  const event: DiagnosticsEvent = {
    id: ++eventIdCounter,
    at,
    isoTime: getIso(at),
    level: options?.level ?? "info",
    type,
    screen: uiState.screen,
    detailFlow: uiState.detailFlow,
    actionId: options?.actionId ?? null,
  }
  if (payload && Object.keys(payload).length > 0) {
    event.payload = toCompactValue(payload)
  }
  pushToRing(events, event, DIAGNOSTICS_MAX_EVENTS)
}

export const setDiagnosticsUiState = (patch: Partial<DiagnosticsUiState>) => {
  initDiagnosticsSession()
  uiState = {
    ...uiState,
    ...patch,
    openSheets: patch.openSheets ? [...patch.openSheets] : uiState.openSheets,
  }
}

export const setDiagnosticsFormState = (patch: Partial<DiagnosticsFormState>) => {
  initDiagnosticsSession()
  formState = {
    ...formState,
    ...patch,
    keyFields: patch.keyFields ? { ...patch.keyFields } : formState.keyFields,
  }
}

const fieldChangeThrottle = new Map<string, number>()

export const logDiagnosticsFormFieldChange = (formType: string, field: string, value: unknown) => {
  const key = `${formType}:${field}`
  const now = getNow()
  const prev = fieldChangeThrottle.get(key) ?? 0
  if (now - prev < 180) return
  fieldChangeThrottle.set(key, now)
  setDiagnosticsFormState({ formType, lastChangedField: field, dirty: true })
  logDiagnosticEvent("form.field.change", {
    formType,
    field,
    value: toCompactValue(value),
  })
}

export const setDiagnosticsPendingFlag = (flag: string, active: boolean) => {
  if (!flag) return
  pendingFlags.set(flag, active)
}

export const markDiagnosticsMount = (component: string) => {
  const nextCount = (componentMountCounts.get(component) ?? 0) + 1
  componentMountCounts.set(component, nextCount)
  logDiagnosticEvent("component.mount", { component, count: nextCount })
  if (nextCount > 1) {
    logDiagnosticEvent(
      "unexpected.remount",
      { component, count: nextCount },
      {
        level: "warn",
      },
    )
  }
}

export const markDiagnosticsUnmount = (component: string) => {
  logDiagnosticEvent("component.unmount", { component })
}

export const markDiagnosticsRefetch = (scope: string, reason?: string) => {
  const now = getNow()
  const previous = lastRefetchByScope.get(scope)
  lastRefetchByScope.set(scope, now)
  logDiagnosticEvent("refetch.start", { scope, reason: reason ?? null })
  if (previous !== undefined && now - previous < 600) {
    logDiagnosticEvent(
      "unexpected.refetch",
      {
        scope,
        deltaMs: now - previous,
      },
      { level: "warn" },
    )
  }
}

const buildActionId = (actionType: string) => {
  actionCounter += 1
  const safeType = actionType.replace(/[^a-z0-9-_]/gi, "-").toLowerCase()
  return `${safeType}-${Date.now().toString(36)}-${actionCounter.toString(36)}`
}

export const startDiagnosticsAction = (actionType: string, options?: StartActionOptions) => {
  initDiagnosticsSession()
  const existingActionId = actionIdByType.get(actionType)
  if (existingActionId) {
    logDiagnosticEvent(
      "unexpected.second-submit",
      {
        actionType,
        activeActionId: existingActionId,
      },
      { level: "warn", actionId: existingActionId },
    )
  }

  const actionId = buildActionId(actionType)
  const startedAt = getNow()
  actionById.set(actionId, { actionType, startedAt })
  actionIdByType.set(actionType, actionId)

  lastAction = {
    actionId,
    actionType,
    phase: "start",
    startedAt,
    startedAtIso: getIso(startedAt),
    sourceScreen: options?.sourceScreen ?? uiState.screen,
    entityType: options?.entityType ?? null,
    entityId: options?.entityId ?? null,
  }

  logDiagnosticEvent(
    "action.start",
    {
      actionType,
      sourceScreen: lastAction.sourceScreen,
      entityType: lastAction.entityType,
      entityId: lastAction.entityId,
      ...(options?.payload ?? {}),
    },
    { actionId },
  )

  return actionId
}

export const updateDiagnosticsAction = (actionId: string, phase: string, payload?: Record<string, unknown>) => {
  const action = actionById.get(actionId)
  if (!action) return
  if (lastAction?.actionId === actionId) {
    lastAction = { ...lastAction, phase }
  }
  logDiagnosticEvent(`action.${phase}`, payload, { actionId })
}

export const finishDiagnosticsAction = (
  actionId: string,
  outcome: "success" | "fail" | "cancel",
  payload?: Record<string, unknown>,
) => {
  const action = actionById.get(actionId)
  if (!action) return
  actionById.delete(actionId)
  if (actionIdByType.get(action.actionType) === actionId) {
    actionIdByType.delete(action.actionType)
  }
  if (lastAction?.actionId === actionId) {
    lastAction = {
      ...lastAction,
      phase: outcome,
    }
  }
  logDiagnosticEvent(`action.${outcome}`, payload, { actionId, level: outcome === "fail" ? "error" : "info" })
}

const addErrorRecord = (record: DiagnosticsErrorRecord) => {
  pushToRing(errorRecords, record, DIAGNOSTICS_MAX_ERRORS)
}

export const captureDiagnosticsError = (
  source: string,
  error: unknown,
  extra?: { actionId?: string | null; payload?: Record<string, unknown> },
) => {
  initDiagnosticsSession()
  const at = getNow()
  const normalized = normalizeError(error)
  const actionId = extra?.actionId ?? lastAction?.actionId ?? null
  const errorRecord: DiagnosticsErrorRecord = {
    at,
    isoTime: getIso(at),
    source,
    actionId,
    ...normalized,
  }
  addErrorRecord(errorRecord)
  logDiagnosticEvent(
    "error.captured",
    {
      source,
      name: normalized.name,
      message: normalized.message,
      ...(extra?.payload ?? {}),
    },
    { level: "error", actionId },
  )

  const snapshot: CrashSnapshot = {
    capturedAt: getIso(at),
    capturedAtMs: at,
    source,
    actionId,
    error: normalized,
    uiState: { ...uiState, openSheets: [...uiState.openSheets] },
    formState: { ...formState, keyFields: { ...formState.keyFields } },
    pendingFlags: readPendingFlags(),
    lastAction: lastAction ? { ...lastAction } : null,
    recentEvents: events.slice(-DIAGNOSTICS_REPORT_EVENTS),
    recentErrors: errorRecords.slice(-DIAGNOSTICS_REPORT_ERRORS),
    persistence: persistenceRecords.slice(-DIAGNOSTICS_REPORT_PERSISTENCE),
  }
  persistCrashSnapshot(snapshot)
  logDiagnosticEvent("crash.snapshot.saved", { source, actionId }, { level: "error", actionId })
}

export const clearDiagnosticsCrashSnapshot = () => {
  persistedCrashSnapshot = null
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(DIAGNOSTICS_LAST_CRASH_KEY)
}

export const getDiagnosticsCrashSnapshot = () => {
  initDiagnosticsSession()
  return loadPersistedCrashSnapshot()
}

export const hasDiagnosticsCrashSnapshot = () => Boolean(getDiagnosticsCrashSnapshot())

export const clearDiagnosticsLogs = () => {
  events.length = 0
  errorRecords.length = 0
  persistenceRecords.length = 0
  componentMountCounts.clear()
  lastRefetchByScope.clear()
  actionById.clear()
  actionIdByType.clear()
  pendingFlags.clear()
  lastAction = null
  logDiagnosticEvent("diagnostics.logs.cleared")
}

export const logDiagnosticsStorageReadStart = (key: string) => {
  const at = getNow()
  const record: DiagnosticsPersistenceRecord = {
    at,
    isoTime: getIso(at),
    key,
    operation: "read",
    phase: "start",
    size: null,
    error: null,
  }
  pushToRing(persistenceRecords, record, DIAGNOSTICS_MAX_PERSISTENCE)
  logDiagnosticEvent("storage.read.start", { key })
}

export const logDiagnosticsStorageReadSuccess = (key: string, size: number | null) => {
  const at = getNow()
  const record: DiagnosticsPersistenceRecord = {
    at,
    isoTime: getIso(at),
    key,
    operation: "read",
    phase: "success",
    size,
    error: null,
  }
  pushToRing(persistenceRecords, record, DIAGNOSTICS_MAX_PERSISTENCE)
  logDiagnosticEvent("storage.read.success", { key, size })
}

export const logDiagnosticsStorageReadFail = (key: string, error: unknown) => {
  const at = getNow()
  const normalized = normalizeError(error)
  const record: DiagnosticsPersistenceRecord = {
    at,
    isoTime: getIso(at),
    key,
    operation: "read",
    phase: "fail",
    size: null,
    error: normalized.message,
  }
  pushToRing(persistenceRecords, record, DIAGNOSTICS_MAX_PERSISTENCE)
  logDiagnosticEvent("storage.read.fail", { key, error: normalized.message }, { level: "error" })
}

export const logDiagnosticsStorageWriteStart = (key: string, size: number | null) => {
  const at = getNow()
  const record: DiagnosticsPersistenceRecord = {
    at,
    isoTime: getIso(at),
    key,
    operation: "write",
    phase: "start",
    size,
    error: null,
  }
  pushToRing(persistenceRecords, record, DIAGNOSTICS_MAX_PERSISTENCE)
  logDiagnosticEvent("storage.write.start", { key, size })
}

export const logDiagnosticsStorageWriteSuccess = (key: string, size: number | null) => {
  const at = getNow()
  const record: DiagnosticsPersistenceRecord = {
    at,
    isoTime: getIso(at),
    key,
    operation: "write",
    phase: "success",
    size,
    error: null,
  }
  pushToRing(persistenceRecords, record, DIAGNOSTICS_MAX_PERSISTENCE)
  logDiagnosticEvent("storage.write.success", { key, size })
}

export const logDiagnosticsStorageWriteFail = (key: string, size: number | null, error: unknown) => {
  const at = getNow()
  const normalized = normalizeError(error)
  const record: DiagnosticsPersistenceRecord = {
    at,
    isoTime: getIso(at),
    key,
    operation: "write",
    phase: "fail",
    size,
    error: normalized.message,
  }
  pushToRing(persistenceRecords, record, DIAGNOSTICS_MAX_PERSISTENCE)
  logDiagnosticEvent("storage.write.fail", { key, size, error: normalized.message }, { level: "error" })
}

const buildEnvironment = () => {
  if (typeof window === "undefined") {
    return {
      userAgent: "n/a",
      platform: "n/a",
      viewport: "n/a",
      devicePixelRatio: "n/a",
      visibilityState: "hidden",
      online: "unknown",
      language: "n/a",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      currency: normalizeCurrency("RUB"),
      ...getTelegramMeta(),
    }
  }

  return {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    visibilityState: document.visibilityState,
    online: window.navigator.onLine,
    language: window.navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    currency: normalizeCurrency("RUB"),
    ...getTelegramMeta(),
  }
}

export const buildDiagnosticsReport = () => {
  initDiagnosticsSession()
  const now = getNow()
  const env = buildEnvironment()
  const crash = loadPersistedCrashSnapshot()
  const activeActionId = lastAction?.actionId ?? null

  const lines: string[] = []
  lines.push("=== BABKIN FINANCE DEBUG REPORT ===")
  lines.push("reportVersion: 1")
  lines.push(`sessionId: ${sessionId}`)
  lines.push(`appVersion: ${APP_VERSION}`)
  lines.push(`gitSha: ${GIT_SHA}`)
  lines.push(`buildTime: ${BUILD_TIME}`)
  lines.push(`createdAt: ${getIso(now)}`)
  lines.push(`sessionStartedAt: ${sessionStartedAtIso}`)
  lines.push("")

  lines.push("[SUMMARY]")
  lines.push(`eventsBuffered: ${events.length}`)
  lines.push(`errorsBuffered: ${errorRecords.length}`)
  lines.push(`persistenceRecords: ${persistenceRecords.length}`)
  lines.push(`activeActionId: ${activeActionId ?? "none"}`)
  lines.push(`hasPersistedCrashSnapshot: ${crash ? "yes" : "no"}`)
  lines.push("")

  lines.push("[ENV]")
  lines.push(JSON.stringify(env, null, 2))
  lines.push("")

  lines.push("[UI_STATE]")
  lines.push(JSON.stringify(uiState, null, 2))
  lines.push("")

  lines.push("[FORM_STATE]")
  lines.push(JSON.stringify(formState, null, 2))
  lines.push("")

  lines.push("[LAST_ACTION]")
  lines.push(JSON.stringify(lastAction, null, 2))
  lines.push("")

  lines.push("[ERRORS]")
  lines.push(JSON.stringify(errorRecords.slice(-DIAGNOSTICS_REPORT_ERRORS), null, 2))
  lines.push("")

  lines.push("[PERSISTENCE]")
  lines.push(JSON.stringify(persistenceRecords.slice(-DIAGNOSTICS_REPORT_PERSISTENCE), null, 2))
  lines.push("")

  lines.push("[RECENT_EVENTS]")
  lines.push(JSON.stringify(events.slice(-DIAGNOSTICS_REPORT_EVENTS), null, 2))
  lines.push("")

  lines.push("[LAST_CRASH_SNAPSHOT]")
  lines.push(JSON.stringify(crash, null, 2))

  return lines.join("\n")
}

const fallbackCopy = (value: string) => {
  if (typeof document === "undefined") return
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  textarea.style.pointerEvents = "none"
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)
}

export const copyDiagnosticsReport = async () => {
  const report = buildDiagnosticsReport()
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(report)
  } else {
    fallbackCopy(report)
  }
  logDiagnosticEvent("diagnostics.report.copied", { length: report.length })
  return report
}

export const getDiagnosticsRecentEvents = (limit = 60) => {
  initDiagnosticsSession()
  return events.slice(-Math.max(1, limit))
}

export const getDiagnosticsSummary = () => ({
  sessionId,
  eventsCount: events.length,
  errorsCount: errorRecords.length,
  hasCrashSnapshot: hasDiagnosticsCrashSnapshot(),
})

export const installDiagnosticsWindowObservers = () => {
  if (typeof window === "undefined") {
    return () => undefined
  }

  const onVisibilityChange = () => {
    logDiagnosticEvent("document.visibilitychange", {
      visibilityState: document.visibilityState,
    })
  }
  const onPageHide = () => {
    logDiagnosticEvent("window.pagehide")
  }
  const onFocus = () => {
    logDiagnosticEvent("window.focus")
  }
  const onBlur = () => {
    logDiagnosticEvent("window.blur")
  }

  window.addEventListener("pagehide", onPageHide)
  window.addEventListener("focus", onFocus)
  window.addEventListener("blur", onBlur)
  document.addEventListener("visibilitychange", onVisibilityChange)

  return () => {
    window.removeEventListener("pagehide", onPageHide)
    window.removeEventListener("focus", onFocus)
    window.removeEventListener("blur", onBlur)
    document.removeEventListener("visibilitychange", onVisibilityChange)
  }
}
