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
