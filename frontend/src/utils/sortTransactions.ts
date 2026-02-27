import type { Transaction } from "../types/finance"

const toUnixMs = (value: string | null | undefined) => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getCreatedUnixMs = (tx: Transaction) => {
  const withMeta = tx as Transaction & { createdAt?: string | null; updatedAt?: string | null }
  return toUnixMs(withMeta.createdAt ?? withMeta.updatedAt ?? null)
}

export const compareTransactionsDesc = (left: Transaction, right: Transaction) => {
  const happenedDiff = toUnixMs(right.date) - toUnixMs(left.date)
  if (happenedDiff !== 0) return happenedDiff

  const rightCreatedUnixMs = getCreatedUnixMs(right)
  const leftCreatedUnixMs = getCreatedUnixMs(left)
  const createdDiff = rightCreatedUnixMs - leftCreatedUnixMs
  if (createdDiff !== 0) return createdDiff

  // Keep input order for equal happenedAt when creation timestamps are not available.
  if (rightCreatedUnixMs <= 0 && leftCreatedUnixMs <= 0) return 0

  if (left.id === right.id) return 0
  return right.id.localeCompare(left.id)
}

export const sortTransactionsDesc = (transactions: Transaction[]) => [...transactions].sort(compareTransactionsDesc)

const toLocalDayKey = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const raw = value.slice(0, 10)
    return raw || "1970-01-01"
  }
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, "0")
  const d = String(parsed.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const toLocalDayDate = (dayKey: string) => {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(1970, 0, 1)
  }
  return new Date(year, month - 1, day)
}

export type TransactionDayGroup = {
  dayKey: string
  dayDate: Date
  items: Transaction[]
}

export const groupTransactionsByDayDesc = (transactions: Transaction[]): TransactionDayGroup[] => {
  const byDay = new Map<string, Transaction[]>()
  sortTransactionsDesc(transactions).forEach((tx) => {
    const key = toLocalDayKey(tx.date)
    const list = byDay.get(key)
    if (list) {
      list.push(tx)
      return
    }
    byDay.set(key, [tx])
  })

  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dayKey, items]) => ({
      dayKey,
      dayDate: toLocalDayDate(dayKey),
      items: sortTransactionsDesc(items),
    }))
}

export type TransactionDaySection = {
  dayKey: string
  dayDate: Date
  dayLabel: string
  items: Transaction[]
}

export const buildTransactionDaySections = (transactions: Transaction[]): TransactionDaySection[] => {
  const dateLabelFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
  const sortedEntries = [...transactions]
    .map((tx, index) => ({ tx, index }))
    .sort((left, right) => {
      const byTransaction = compareTransactionsDesc(left.tx, right.tx)
      if (byTransaction !== 0) return byTransaction
      if (left.index !== right.index) return left.index - right.index
      return right.tx.id.localeCompare(left.tx.id)
    })

  const sectionsByDay = new Map<string, { dayDate: Date; items: Transaction[] }>()
  sortedEntries.forEach(({ tx }) => {
    const dayKey = toLocalDayKey(tx.date)
    const existing = sectionsByDay.get(dayKey)
    if (existing) {
      existing.items.push(tx)
      return
    }
    sectionsByDay.set(dayKey, { dayDate: toLocalDayDate(dayKey), items: [tx] })
  })

  return Array.from(sectionsByDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dayKey, section]) => ({
      dayKey,
      dayDate: section.dayDate,
      dayLabel: dateLabelFormat.format(section.dayDate),
      items: section.items,
    }))
}
