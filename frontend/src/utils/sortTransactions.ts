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

  const createdDiff = getCreatedUnixMs(right) - getCreatedUnixMs(left)
  if (createdDiff !== 0) return createdDiff

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
