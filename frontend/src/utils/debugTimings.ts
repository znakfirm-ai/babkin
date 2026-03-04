type StartupTimingLabel = "appStart" | "telegramReady" | "initBegin" | "initEnd"
type RequestStatus = "ok" | "error"

export type DebugTimingRequestRecord = {
  id: string
  label: string
  method: string
  url: string
  startTime: number
  endTime: number
  durationMs: number
  status: RequestStatus
  statusCode?: number
}

export type DebugTimingSnapshot = {
  stages: Readonly<Partial<Record<StartupTimingLabel, number>>>
  requests: readonly DebugTimingRequestRecord[]
}

const DEBUG_STORAGE_KEY = "__debug_timings__"
const REQUESTS_LIMIT = 200
const listeners = new Set<() => void>()
const marks = new Map<string, number>()
const stageTimes: Partial<Record<StartupTimingLabel, number>> = {}
const requests: DebugTimingRequestRecord[] = []
let requestCounter = 0
let debugTapCount = 0
let debugLastTapAtMs = 0

const getNow = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now()
  }
  return Date.now()
}

const getMethod = (input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase()
  return "GET"
}

const getPathWithoutQuery = (input: RequestInfo | URL) => {
  if (typeof input === "string") {
    try {
      return new URL(input, window.location.origin).pathname
    } catch {
      return input.split("?")[0]
    }
  }
  if (input instanceof URL) return input.pathname
  try {
    return new URL(input.url, window.location.origin).pathname
  } catch {
    return input.url.split("?")[0]
  }
}

const emit = () => {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // ignore listener errors in debug-only stream
    }
  }
}

export const isDebugTimingsEnabled = () => {
  if (typeof window === "undefined") return import.meta.env.VITE_DEBUG_TIMINGS === "1"
  const fromStorage = window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1"
  const fromQuery = new URLSearchParams(window.location.search).get("debugTimings") === "1"
  return fromStorage || fromQuery || import.meta.env.VITE_DEBUG_TIMINGS === "1"
}

export const isDebugTimingsStorageEnabled = () => {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1"
}

export const setDebugTimingsStorageEnabled = (enabled: boolean) => {
  if (typeof window === "undefined") return
  if (enabled) {
    window.localStorage.setItem(DEBUG_STORAGE_KEY, "1")
  } else {
    window.localStorage.removeItem(DEBUG_STORAGE_KEY)
  }
  emit()
}

export const registerDebugTimingsTap = () => {
  if (typeof window === "undefined") return null
  const nowMs = Date.now()
  if (nowMs - debugLastTapAtMs > 1200) {
    debugTapCount = 0
  }
  debugLastTapAtMs = nowMs
  debugTapCount += 1
  if (debugTapCount < 7) return null
  debugTapCount = 0

  const currentlyEnabled = window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1"
  setDebugTimingsStorageEnabled(!currentlyEnabled)
  return !currentlyEnabled
}

const addRequestRecord = (record: DebugTimingRequestRecord) => {
  requests.push(record)
  if (requests.length > REQUESTS_LIMIT) {
    requests.splice(0, requests.length - REQUESTS_LIMIT)
  }
  emit()
}

export const markTimingStage = (label: StartupTimingLabel) => {
  if (!isDebugTimingsEnabled()) return
  stageTimes[label] = getNow()
  emit()
}

export const getSnapshot = (): DebugTimingSnapshot => ({
  stages: stageTimes,
  requests,
})

export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getDebugTimingsSnapshot = getSnapshot
export const subscribeDebugTimings = subscribe

const formatMs = (value: number) => `${Math.round(value)}ms`

export const formatDebugTimingsReport = (snapshot: DebugTimingSnapshot) => {
  const orderedStages: StartupTimingLabel[] = ["appStart", "telegramReady", "initBegin", "initEnd"]
  const appStart = snapshot.stages.appStart
  const lines: string[] = ["Startup stages:"]
  for (const stage of orderedStages) {
    const value = snapshot.stages[stage]
    if (value === undefined) {
      lines.push(`- ${stage}: n/a`)
      continue
    }
    if (appStart === undefined) {
      lines.push(`- ${stage}: ${formatMs(value)}`)
      continue
    }
    lines.push(`- ${stage}: +${formatMs(value - appStart)}`)
  }
  lines.push("")
  lines.push("Network:")
  for (const item of snapshot.requests) {
    const statusCode = item.statusCode !== undefined ? ` ${item.statusCode}` : ""
    lines.push(`- ${item.label} ${item.method} ${item.url} ${item.status}${statusCode} ${formatMs(item.durationMs)}`)
  }
  return lines.join("\n")
}

export const timedFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  meta?: { label?: string },
): Promise<Response> => {
  if (!isDebugTimingsEnabled()) {
    return fetch(input, init)
  }

  const startTime = getNow()
  const method = getMethod(input, init)
  const url = getPathWithoutQuery(input)
  const label = meta?.label ?? url
  const id = `${Date.now().toString(36)}-${(requestCounter += 1).toString(36)}`

  try {
    const response = await fetch(input, init)
    const endTime = getNow()
    addRequestRecord({
      id,
      label,
      method,
      url,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      status: "ok",
      statusCode: response.status,
    })
    return response
  } catch (error) {
    const endTime = getNow()
    addRequestRecord({
      id,
      label,
      method,
      url,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      status: "error",
    })
    throw error
  }
}

export const createTimingProbe = (scope: string) => {
  return {
    start(label: string) {
      if (!isDebugTimingsEnabled()) return
      marks.set(`${scope}:${label}`, getNow())
    },
    end(label: string) {
      if (!isDebugTimingsEnabled()) return
      const key = `${scope}:${label}`
      const startedAt = marks.get(key)
      if (startedAt === undefined) return
      marks.delete(key)
    },
    point(_label: string) {
      if (!isDebugTimingsEnabled()) return
    },
  }
}
