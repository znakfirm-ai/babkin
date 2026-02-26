import type { Transaction } from "../types/finance"

export type MonthPoint = {
  year: number
  monthIndex: number
}

export type MonthlyTransactionMetrics = {
  incomeTotal: number
  expenseTotal: number
  incomeBySource: Map<string, number>
  expenseByCategory: Map<string, number>
}

export const getLocalMonthPoint = (referenceDate = new Date()): MonthPoint => ({
  year: referenceDate.getFullYear(),
  monthIndex: referenceDate.getMonth(),
})

export const isDateInMonthPoint = (dateValue: string, monthPoint: MonthPoint) => {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return false
  return date.getFullYear() === monthPoint.year && date.getMonth() === monthPoint.monthIndex
}

export const buildMonthlyTransactionMetrics = (
  transactions: Transaction[],
  monthPoint: MonthPoint,
): MonthlyTransactionMetrics => {
  const incomeBySource = new Map<string, number>()
  const expenseByCategory = new Map<string, number>()
  let incomeTotal = 0
  let expenseTotal = 0

  transactions.forEach((tx) => {
    if (!isDateInMonthPoint(tx.date, monthPoint)) return
    if (tx.goalId) return

    if (tx.type === "income") {
      const amount = tx.amount.amount
      incomeTotal += amount
      const sourceKey = tx.incomeSourceId ?? "uncategorized"
      incomeBySource.set(sourceKey, (incomeBySource.get(sourceKey) ?? 0) + amount)
      return
    }

    if (tx.type === "expense") {
      const amount = tx.amount.amount
      expenseTotal += amount
      const categoryKey = tx.categoryId ?? "uncategorized"
      expenseByCategory.set(categoryKey, (expenseByCategory.get(categoryKey) ?? 0) + amount)
    }
  })

  return { incomeTotal, expenseTotal, incomeBySource, expenseByCategory }
}
