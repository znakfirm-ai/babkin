import { isFinanceIconKey } from "./icons/financeIcons"
import type { Account, Category, IncomeSource, Goal } from "../types/finance"

type DisplayProps = {
  title: string
  iconKey?: string
  color?: string
}

export function getAccountDisplay(accountId: string | null | undefined, accountsById: Record<string, Account>): DisplayProps {
  const acc = accountId ? accountsById[accountId] : undefined
  if (!acc) {
    return { title: "Счёт", color: "#EEF2F7" }
  }
  return {
    title: acc.name,
    iconKey: acc.icon && isFinanceIconKey(acc.icon) ? acc.icon : undefined,
    color: acc.color ?? "#EEF2F7",
  }
}

export function getCategoryDisplay(categoryId: string | null | undefined, categoriesById: Record<string, Category>): DisplayProps {
  const cat = categoryId ? categoriesById[categoryId] : undefined
  if (!cat) return { title: "Категория" }
  return {
    title: cat.name,
    iconKey: cat.icon && isFinanceIconKey(cat.icon) ? cat.icon : undefined,
  }
}

export function getIncomeSourceDisplay(
  incomeSourceId: string | null | undefined,
  incomeSourcesById: Record<string, IncomeSource>,
): DisplayProps {
  const src = incomeSourceId ? incomeSourcesById[incomeSourceId] : undefined
  if (!src) return { title: "Доход" }
  return {
    title: src.name,
    iconKey: src.icon && isFinanceIconKey(src.icon) ? src.icon : undefined,
  }
}

export function getGoalDisplay(goalId: string | null | undefined, goalsById: Record<string, Goal>): DisplayProps {
  const goal = goalId ? goalsById[goalId] : undefined
  if (!goal) return { title: "Цель" }
  return {
    title: goal.name,
    iconKey: goal.icon && isFinanceIconKey(goal.icon) ? goal.icon : undefined,
  }
}
