import { useCallback, useMemo, useState } from "react"
import { useAppStore } from "../store/useAppStore"
import type { Transaction } from "../types/finance"
import "./OverviewScreen.css"
import { AppIcon, type IconName } from "../components/AppIcon"
import { createAccount, getAccounts } from "../api/accounts"
import { createCategory, deleteCategory, getCategories, renameCategory } from "../api/categories"
import { createIncomeSource, deleteIncomeSource, getIncomeSources, renameIncomeSource } from "../api/incomeSources"
import { createTransaction, deleteTransaction, getTransactions } from "../api/transactions"
import { formatMoney, normalizeCurrency } from "../utils/formatMoney"

type TileType = "account" | "category"
type TileSize = "sm" | "md" | "lg"
type TxKind = "income" | "expense" | "transfer"

type CardItem = {
  id: string
  title: string
  amount: number
  icon: string
  color: string
  isAdd?: boolean
  type?: TileType
  size?: TileSize
}

const cardColors = ["#111827", "#166534", "#92400e", "#2563eb", "#b91c1c", "#0f172a"]

const getCurrentMonthTag = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${now.getFullYear()}-${month}`
}

const isCurrentMonth = (tx: Transaction, currentTag: string) => tx.date.slice(0, 7) === currentTag

const Section: React.FC<{
  title: string
  items: CardItem[]
  rowScroll?: boolean
  rowClass?: string
  onAddAccounts?: () => void
  onAddCategory?: () => void
  onAddIncomeSource?: () => void
  onCategoryClick?: (id: string, title: string) => void
  onAccountClick?: (id: string, title: string) => void
  baseCurrency: string
}> = ({
  title,
  items,
  rowScroll,
  rowClass,
  onAddAccounts,
  onAddCategory,
  onAddIncomeSource,
  onCategoryClick,
  onAccountClick,
  baseCurrency,
}) => {
  const listClass = rowScroll
    ? `overview-section__list overview-section__list--row ${rowClass ?? ""}`.trim()
    : "overview-section__list tile-grid"
  return (
    <section className="overview-section">
      <div className="overview-section__title overview-section__title--muted">{title}</div>
      <div className={listClass}>
        {items.map((item) => (
          <div
            key={item.id}
            className={`tile-card ${item.isAdd ? "tile-card--add overview-add-tile" : ""} ${
              item.type ? `tile-card--${item.type}` : ""
            } tile--${item.size ?? "md"}`}
            role={item.isAdd ? "button" : "button"}
            tabIndex={0}
            onClick={() => {
              if (item.isAdd && item.id === "add-accounts") onAddAccounts?.()
              if (item.isAdd && item.id === "add-category") onAddCategory?.()
              if (item.isAdd && item.id === "add-income-source") onAddIncomeSource?.()
              if (!item.isAdd && item.type === "category") onCategoryClick?.(item.id, item.title)
              if (!item.isAdd && item.type === "account") onAccountClick?.(item.id, item.title)
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return
              if (item.isAdd && item.id === "add-accounts") onAddAccounts?.()
              if (item.isAdd && item.id === "add-category") onAddCategory?.()
              if (item.isAdd && item.id === "add-income-source") onAddIncomeSource?.()
              if (!item.isAdd && item.type === "category") onCategoryClick?.(item.id, item.title)
              if (!item.isAdd && item.type === "account") onAccountClick?.(item.id, item.title)
            }}
          >
            <div
              className="tile-card__icon"
              style={
                item.isAdd
                  ? undefined
                  : { background: "rgba(15, 23, 42, 0.05)", color: "rgba(15, 23, 42, 0.85)" }
              }
            >
              <AppIcon name={item.icon as IconName} size={16} />
            </div>
            <div className="tile-card__title">{item.title}</div>
            {!item.isAdd && <div className="tile-card__amount">{formatMoney(item.amount, baseCurrency)}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

function OverviewScreen() {
  const {
    accounts,
    categories,
    incomeSources,
    transactions,
    setAccounts,
    setCategories,
    setIncomeSources,
    setTransactions,
    currency,
  } = useAppStore()
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState("cash")
  const [balance, setBalance] = useState("0")
  const [categorySheetMode, setCategorySheetMode] = useState<"create" | "edit" | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState("")
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [incomeSourceSheetMode, setIncomeSourceSheetMode] = useState<"create" | "edit" | null>(null)
  const [editingIncomeSourceId, setEditingIncomeSourceId] = useState<string | null>(null)
  const [incomeSourceName, setIncomeSourceName] = useState("")
  const [isSavingIncomeSource, setIsSavingIncomeSource] = useState(false)
  const [deletingIncomeSourceId, setDeletingIncomeSourceId] = useState<string | null>(null)
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null)
  const [detailCategoryId, setDetailCategoryId] = useState<string | null>(null)
  const [detailTitle, setDetailTitle] = useState<string>("")
  const [accountSearch, setAccountSearch] = useState("")
  const [accountPeriodType, setAccountPeriodType] = useState<"day" | "week" | "month" | "year" | "custom">("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [isCustomSheetOpen, setIsCustomSheetOpen] = useState(false)
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false)
  const [txActionId, setTxActionId] = useState<string | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [txMode, setTxMode] = useState<"none" | "actions" | "delete" | "edit">("none")
  const [txError, setTxError] = useState<string | null>(null)
  const [txLoading, setTxLoading] = useState(false)
  const [editKind, setEditKind] = useState<TxKind>("expense")
  const [editAmount, setEditAmount] = useState("")
  const [editAccountId, setEditAccountId] = useState("")
  const [editToAccountId, setEditToAccountId] = useState("")
  const [editCategoryId, setEditCategoryId] = useState("")
  const [editIncomeSourceId, setEditIncomeSourceId] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editNote, setEditNote] = useState("")
  const currentMonthTag = getCurrentMonthTag()

  const { incomeSum, expenseSum, incomeBySource, expenseByCategory } = useMemo(() => {
    let income = 0
    let expense = 0
    const incomeMap = new Map<string, number>()
    const expenseMap = new Map<string, number>()

    transactions.forEach((tx) => {
      if (!isCurrentMonth(tx, currentMonthTag)) return
      if (tx.type === "transfer") return

      if (tx.type === "income") {
        income += tx.amount.amount
        const key = tx.incomeSourceId ?? "uncategorized"
        incomeMap.set(key, (incomeMap.get(key) ?? 0) + tx.amount.amount)
      }

      if (tx.type === "expense") {
        expense += tx.amount.amount
        const key = tx.categoryId ?? "uncategorized"
        expenseMap.set(key, (expenseMap.get(key) ?? 0) + tx.amount.amount)
      }
    })

    return {
      incomeSum: income,
      expenseSum: expense,
      incomeBySource: incomeMap,
      expenseByCategory: expenseMap,
    }
  }, [transactions, currentMonthTag])

  const monthLabel = useMemo(() => {
    const now = new Date()
    return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(now)
  }, [])

  const baseCurrency = normalizeCurrency(currency || "RUB")
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null), [])

  const refetchCategories = useCallback(async () => {
    if (!token) return
    const data = await getCategories(token)
    const mapped = data.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon }))
    setCategories(mapped)
  }, [setCategories, token])

  const refetchIncomeSources = useCallback(async () => {
    if (!token) return
    const data = await getIncomeSources(token)
    const mapped = data.incomeSources.map((s) => ({ id: s.id, name: s.name }))
    setIncomeSources(mapped)
  }, [setIncomeSources, token])

  const refetchAccountsSeq = useCallback(async () => {
    if (!token) return
    const data = await getAccounts(token)
    const mapped = data.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: { amount: a.balance, currency: a.currency },
    }))
    setAccounts(mapped)
  }, [setAccounts, token])

  const refetchTransactions = useCallback(async () => {
    if (!token) return
    const data = await getTransactions(token)
    const mapped = data.transactions.map((t) => ({
      id: t.id,
      type: t.kind,
      amount: {
        amount: typeof t.amount === "string" ? Number(t.amount) : t.amount,
        currency: "RUB",
      },
      date: t.happenedAt,
      accountId: t.accountId ?? t.fromAccountId ?? "",
      categoryId: t.categoryId ?? undefined,
      incomeSourceId: t.incomeSourceId ?? undefined,
      toAccountId: t.toAccountId ?? undefined,
    }))
    setTransactions(mapped)
  }, [setTransactions, token])

  const openCreateCategory = useCallback(() => {
    setCategorySheetMode("create")
    setEditingCategoryId(null)
    setCategoryName("")
  }, [])

  const openEditCategory = useCallback((id: string, title: string) => {
    setDetailCategoryId(id)
    setDetailTitle(title)
  }, [])

  const openCreateIncomeSource = useCallback(() => {
    setIncomeSourceSheetMode("create")
    setEditingIncomeSourceId(null)
    setIncomeSourceName("")
  }, [])

  const openEditIncomeSource = useCallback((id: string, title: string) => {
    setIncomeSourceSheetMode("edit")
    setEditingIncomeSourceId(id)
    setIncomeSourceName(title)
  }, [])

  const closeCategorySheet = useCallback(() => {
    setCategorySheetMode(null)
    setEditingCategoryId(null)
    setCategoryName("")
    setIsSavingCategory(false)
    setDeletingCategoryId(null)
  }, [])

  const closeIncomeSourceSheet = useCallback(() => {
    setIncomeSourceSheetMode(null)
    setEditingIncomeSourceId(null)
    setIncomeSourceName("")
    setIsSavingIncomeSource(false)
    setDeletingIncomeSourceId(null)
  }, [])

  const openTxActions = useCallback(
    (id: string) => {
      setTxError(null)
      setTxLoading(false)
      setTxActionId(id)
      setTxMode("actions")
      const tx = transactions.find((t) => t.id === id)
      if (tx) {
        setEditKind((tx.type as TxKind) ?? "expense")
        setEditAmount(String(tx.amount.amount))
        setEditAccountId(tx.accountId)
        setEditToAccountId(tx.toAccountId ?? "")
        setEditCategoryId(tx.categoryId ?? "")
        setEditIncomeSourceId(tx.incomeSourceId ?? "")
        setEditDate(tx.date.slice(0, 10))
        setEditNote(tx.comment ?? "")
      }
    },
    [transactions]
  )

  const closeTxSheet = useCallback(() => {
    setTxMode("none")
    setTxActionId(null)
    setTxError(null)
    setTxLoading(false)
  }, [])

  const closeDetails = useCallback(() => {
    setDetailAccountId(null)
    setDetailCategoryId(null)
    setDetailTitle("")
  }, [])

  const handleDeleteTx = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    if (!token) {
      setTxError("Нет токена")
      return
    }
    if (!txActionId) return
    setTxLoading(true)
    setTxError(null)
    try {
      await deleteTransaction(token, txActionId)
      await refetchAccountsSeq()
      await refetchTransactions()
      closeTxSheet()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setTxLoading(false)
        return
      }
      setTxError("Не удалось удалить операцию")
    } finally {
      setTxLoading(false)
    }
  }, [closeTxSheet, refetchAccountsSeq, refetchTransactions, txActionId])

  const handleSaveEdit = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    if (!token) {
      setTxError("Нет токена")
      return
    }
    if (!txActionId) return
    const original = transactions.find((t) => t.id === txActionId)
    const num = Number(editAmount.replace(",", "."))
    if (!Number.isFinite(num) || num <= 0) {
      setTxError("Некорректная сумма")
      return
    }
    setTxLoading(true)
    setTxError(null)
    try {
      await deleteTransaction(token, txActionId)

      if (editKind === "transfer") {
        if (!editAccountId || !editToAccountId || editAccountId === editToAccountId) {
          setTxError("Укажите разные счета")
          setTxLoading(false)
          return
        }
        await createTransaction(token, {
          kind: "transfer",
          amount: num,
          fromAccountId: editAccountId,
          toAccountId: editToAccountId,
          happenedAt: editDate || undefined,
          note: editNote || null,
        })
      } else if (editKind === "income") {
        if (!editAccountId) {
          setTxError("Укажите счет")
          setTxLoading(false)
          return
        }
        await createTransaction(token, {
          kind: "income",
          amount: num,
          accountId: editAccountId,
          incomeSourceId: editIncomeSourceId || null,
          happenedAt: editDate || undefined,
          note: editNote || null,
        })
      } else {
        if (!editAccountId) {
          setTxError("Укажите счет")
          setTxLoading(false)
          return
        }
        await createTransaction(token, {
          kind: "expense",
          amount: num,
          accountId: editAccountId,
          categoryId: editCategoryId || null,
          happenedAt: editDate || undefined,
          note: editNote || null,
        })
      }

      await refetchAccountsSeq()
      await refetchTransactions()
      closeTxSheet()
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setTxLoading(false)
        return
      }
      const message = err instanceof Error ? err.message : "Не удалось сохранить"
      if (original && /5\d\d/.test(message)) {
        try {
          if (original.type === "transfer") {
            await createTransaction(token, {
              kind: "transfer",
              amount: original.amount.amount,
              fromAccountId: original.accountId,
              toAccountId: original.toAccountId ?? "",
              happenedAt: original.date,
              note: original.comment ?? null,
            })
          } else if (original.type === "income") {
            await createTransaction(token, {
              kind: "income",
              amount: original.amount.amount,
              accountId: original.accountId,
              incomeSourceId: original.incomeSourceId ?? null,
              happenedAt: original.date,
              note: original.comment ?? null,
            })
          } else {
            await createTransaction(token, {
              kind: "expense",
              amount: original.amount.amount,
              accountId: original.accountId,
              categoryId: original.categoryId ?? null,
              happenedAt: original.date,
              note: original.comment ?? null,
            })
          }
        } catch {
          // best-effort restore
        }
      }
      setTxError(message)
    } finally {
      setTxLoading(false)
    }
  }, [
    closeTxSheet,
    editAccountId,
    editAmount,
    editCategoryId,
    editDate,
    editIncomeSourceId,
    editKind,
    editNote,
    editToAccountId,
    refetchAccountsSeq,
    refetchTransactions,
    transactions,
    txActionId,
  ])

  const handleSaveCategory = useCallback(async () => {
    if (!token) {
      alert("Нет токена")
      return
    }
    const trimmed = categoryName.trim()
    if (!trimmed) {
      alert("Введите название категории")
      return
    }
    setIsSavingCategory(true)
    try {
      if (categorySheetMode === "create") {
        await createCategory(token, { name: trimmed, kind: "expense" })
      } else if (categorySheetMode === "edit" && editingCategoryId) {
        await renameCategory(token, editingCategoryId, trimmed)
      }
      await refetchCategories()
      closeCategorySheet()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка"
      if (msg.includes("CATEGORY_NAME_EXISTS")) {
        alert("Категория с таким названием уже есть")
      } else {
        alert(msg)
      }
    } finally {
      setIsSavingCategory(false)
    }
  }, [categoryName, categorySheetMode, closeCategorySheet, editingCategoryId, refetchCategories, token])

  const handleSaveIncomeSource = useCallback(async () => {
    if (!token) {
      alert("Нет токена")
      return
    }
    const trimmed = incomeSourceName.trim()
    if (!trimmed) {
      alert("Введите название источника")
      return
    }
    setIsSavingIncomeSource(true)
    try {
      if (incomeSourceSheetMode === "create") {
        await createIncomeSource(token, trimmed)
      } else if (incomeSourceSheetMode === "edit" && editingIncomeSourceId) {
        await renameIncomeSource(token, editingIncomeSourceId, trimmed)
      }
      await refetchIncomeSources()
      closeIncomeSourceSheet()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка"
      if (msg.includes("INCOME_SOURCE_NAME_EXISTS")) {
        alert("Источник с таким названием уже есть")
      } else {
        alert(msg)
      }
    } finally {
      setIsSavingIncomeSource(false)
    }
  }, [
    closeIncomeSourceSheet,
    editingIncomeSourceId,
    incomeSourceName,
    incomeSourceSheetMode,
    refetchIncomeSources,
    token,
  ])

  const handleDeleteCategory = useCallback(
    async (id: string) => {
      if (!token) {
        alert("Нет токена")
        return
      }
      const confirmed = window.confirm("Удалить категорию?")
      if (!confirmed) return
      setDeletingCategoryId(id)
      try {
        await deleteCategory(token, id)
        await refetchCategories()
        closeCategorySheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка"
        if (msg.includes("CATEGORY_IN_USE")) {
          alert("Категория используется в транзакциях и не может быть удалена")
        } else {
          alert(msg)
        }
      } finally {
        setDeletingCategoryId(null)
      }
    },
    [closeCategorySheet, refetchCategories, token]
  )

  const handleDeleteIncomeSource = useCallback(
    async (id: string) => {
      if (!token) {
        alert("Нет токена")
        return
      }
      const confirmed = window.confirm("Удалить источник дохода?")
      if (!confirmed) return
      setDeletingIncomeSourceId(id)
      try {
        await deleteIncomeSource(token, id)
        await refetchIncomeSources()
        closeIncomeSourceSheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка"
        if (msg.includes("INCOME_SOURCE_IN_USE")) {
          alert("Источник используется в транзакциях и не может быть удалён")
        } else {
          alert(msg)
        }
      } finally {
        setDeletingIncomeSourceId(null)
      }
    },
    [closeIncomeSourceSheet, refetchIncomeSources, token]
  )

  const accountItems: CardItem[] = accounts.map((account, idx) => ({
    id: account.id,
    title: account.name,
    amount: account.balance.amount,
    icon: idx % 2 === 0 ? "wallet" : "card",
    color: cardColors[idx % cardColors.length],
    type: "account" as const,
    size: "lg",
  }))

  const accountsToRender = accountItems

  const expenseCategories = categories.filter((c) => c.type === "expense")

  const incomeItems: CardItem[] = incomeSources.map((src, idx) => ({
    id: src.id,
    title: src.name,
    amount: incomeBySource.get(src.id) ?? 0,
    icon: "arrowDown",
    color: cardColors[(idx + 1) % cardColors.length],
    type: "category" as const,
  }))
  const incomeToRender = [...incomeItems]

  const expenseItems: CardItem[] = expenseCategories
    .map((cat, idx) => ({
      id: cat.id,
      title: cat.name,
      amount: expenseByCategory.get(cat.id) ?? 0,
      icon: "tag",
      color: cardColors[(idx + 2) % cardColors.length],
      type: "category" as const,
      size: "md" as const,
    }))
    .sort((a, b) => b.amount - a.amount)

  const uncategorizedExpense = expenseByCategory.get("uncategorized")
  if (uncategorizedExpense) {
    expenseItems.push({
      id: "expense-uncategorized",
      title: "Без категории",
      amount: uncategorizedExpense,
      icon: "⬇️",
      color: "#111827",
      type: "category" as const,
    })
  }

  const computeSize = (amount: number, max: number) => {
    if (max <= 0) return "md" as const
    const ratio = amount / max
    if (ratio >= 0.66) return "lg" as const
    if (ratio >= 0.33) return "md" as const
    return "sm" as const
  }

  const handleCreateAccount = async () => {
    const tokenLocal = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null
    if (!tokenLocal) {
      alert("Нет токена")
      return
    }
    if (!name.trim()) {
      alert("Введите название")
      return
    }
    const parsed = Number(balance.trim().replace(",", "."))
    if (!Number.isFinite(parsed)) {
      alert("Некорректная сумма")
      return
    }
    const balanceNumber = Math.round(parsed * 100) / 100
    try {
      await createAccount(tokenLocal, {
        name: name.trim(),
        type: type || "cash",
        currency: baseCurrency,
        balance: balanceNumber,
      })
      const res = await getAccounts(tokenLocal)
      const mapped = res.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: { amount: a.balance, currency: a.currency },
      }))
      setAccounts(mapped)
      setIsAccountSheetOpen(false)
      setName("")
      setBalance("0")
    } catch {
      alert("Не удалось создать счёт")
    }
  }

  const maxExpenseAmount = Math.max(0, ...expenseItems.map((i) => i.amount))
  const sizedExpenseItems = expenseItems.map((i) => ({ ...i, size: i.size ?? computeSize(i.amount, maxExpenseAmount) }))

  const expenseToRender = [...sizedExpenseItems]

  const goalsItems: CardItem[] = [
    { id: "goal-trip", title: "Путешествие", amount: 0, icon: "plane", color: "#0ea5e9" },
    { id: "goal-tech", title: "Гаджеты", amount: 0, icon: "chart", color: "#8b5cf6" },
  ]

  const placeholderGoals: CardItem[] = [
    { id: "ph-goal-1", title: "Цель (шаблон)", amount: 0, icon: "goal", color: "#e5e7eb", type: "category", size: "md" },
    { id: "ph-goal-2", title: "Цель (шаблон)", amount: 0, icon: "goal", color: "#e5e7eb", type: "category", size: "md" },
  ]

  const goalsToRender = [...goalsItems, ...placeholderGoals]

  const debtsItems: CardItem[] = [
    { id: "debt-bank", title: "Банк", amount: 0, icon: "bank", color: "#ea580c" },
    { id: "debt-friend", title: "Друзья", amount: 0, icon: "repeat", color: "#1e293b" },
  ]

  const addCard = (suffix: string): CardItem => ({
    id: `add-${suffix}`,
    title: "Добавить",
    amount: 0,
    icon: "plus",
    color: "transparent",
    isAdd: true,
  })

  const summaryBalance = accounts.reduce((sum, acc) => sum + acc.balance.amount, 0)
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(iso))
  const accountNameById = useMemo(() => {
    const map = new Map<string, string>()
    accounts.forEach((a) => map.set(a.id, a.name))
    return map
  }, [accounts])
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])
  const incomeSourceNameById = useMemo(() => {
    const map = new Map<string, string>()
    incomeSources.forEach((s) => map.set(s.id, s.name))
    return map
  }, [incomeSources])

  const accountTx = useMemo(() => {
    if (!detailAccountId) return []
    return transactions
      .filter(
        (t) =>
          t.accountId === detailAccountId ||
          t.toAccountId === detailAccountId ||
          (t.type === "transfer" && t.accountId === detailAccountId)
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [detailAccountId, transactions])

  const categoryTx = useMemo(() => {
    if (!detailCategoryId) return []
    return transactions
      .filter((t) => t.type === "expense" && t.categoryId === detailCategoryId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [detailCategoryId, transactions])

  const accountPeriod = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    if (accountPeriodType === "week") {
      const day = start.getDay()
      const diff = day === 0 ? 6 : day - 1
      start.setDate(start.getDate() - diff)
    } else if (accountPeriodType === "month") {
      start.setDate(1)
    } else if (accountPeriodType === "year") {
      start.setMonth(0, 1)
    } else if (accountPeriodType === "custom") {
      const from = customFrom ? new Date(`${customFrom}T00:00:00.000Z`) : start
      const to = customTo ? new Date(`${customTo}T00:00:00.000Z`) : start
      return {
        start: from,
        end: new Date(to.getTime() + 24 * 60 * 60 * 1000),
        label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(from) +
          " - " +
          new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(to),
      }
    }
    const end = new Date(start)
    if (accountPeriodType === "day") end.setDate(end.getDate() + 1)
    else if (accountPeriodType === "week") end.setDate(end.getDate() + 7)
    else if (accountPeriodType === "month") end.setMonth(end.getMonth() + 1)
    else if (accountPeriodType === "year") end.setFullYear(end.getFullYear() + 1)
    else end.setDate(end.getDate() + 1)
    const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    const endPrev = new Date(end.getTime() - 1)
    return { start, end, label: `${fmt.format(start)} - ${fmt.format(endPrev)}` }
  }, [accountPeriodType, customFrom, customTo])

  const filteredAccountTx = useMemo(() => {
    if (!detailAccountId) return []
    const { start, end } = accountPeriod
    const periodFiltered = accountTx.filter((tx) => {
      const d = new Date(tx.date)
      return d >= start && d < end
    })
    const query = accountSearch.trim().toLowerCase()
    if (!query) return periodFiltered
    return periodFiltered.filter((tx) => {
      const absAmount = Math.abs(tx.amount.amount)
      const amountText = String(absAmount)
      const title =
        tx.type === "income"
          ? incomeSourceNameById.get(tx.incomeSourceId ?? "") ?? "Доход"
          : tx.type === "expense"
          ? categoryNameById.get(tx.categoryId ?? "") ?? "Расход"
          : "Перевод"
      return title.toLowerCase().includes(query) || amountText.includes(query)
    })
  }, [accountPeriod, accountSearch, accountTx, categoryNameById, detailAccountId, incomeSourceNameById])

  const groupedAccountTx = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    filteredAccountTx.forEach((tx) => {
      const key = tx.date.slice(0, 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(tx)
    })
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        dateLabel: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(date)),
        items: items.sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
  }, [filteredAccountTx])

  return (
    <div className="overview">
      <div className="overview__header">
        <div className="overview__header-spacer" />
        <button type="button" className="profile-selector">
          <span className="profile-selector__label">default</span>
          <span className="profile-selector__caret">▾</span>
        </button>
        <div className="overview__month">{monthLabel}</div>
      </div>

      <section className="summary">
        <div className="summary__pill">
          <div className="summary__col">
            <div className="summary__label">РАСХОДЫ</div>
            <div className="summary__value summary__value--negative">{formatMoney(expenseSum, baseCurrency)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">БАЛАНС</div>
            <div className="summary__value">{formatMoney(summaryBalance, baseCurrency)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">ДОХОДЫ</div>
            <div className="summary__value summary__value--positive">{formatMoney(incomeSum, baseCurrency)}</div>
          </div>
        </div>
      </section>

      <Section
        title="Счета"
        items={[...accountsToRender, addCard("accounts")]}
        rowScroll
        rowClass="overview-accounts-row"
        onAddAccounts={() => setIsAccountSheetOpen(true)}
        onAccountClick={(id, title) => {
          setDetailAccountId(id)
          setDetailTitle(title || "Счёт")
        }}
        baseCurrency={baseCurrency}
      />

      <Section
        title="Источники дохода"
        items={[...incomeToRender, addCard("income-source")]}
        rowScroll
        onAddIncomeSource={openCreateIncomeSource}
        onCategoryClick={openEditIncomeSource}
        baseCurrency={baseCurrency}
      />

      <Section
        title="Расходы"
        items={[...expenseToRender, addCard("category")]}
        rowScroll
        rowClass="overview-expenses-row"
        onAddCategory={openCreateCategory}
        onCategoryClick={(id, title) => openEditCategory(id, title)}
        baseCurrency={baseCurrency}
      />

      <Section title="Цели" items={[...goalsToRender, addCard("goals")]} rowScroll baseCurrency={baseCurrency} />
      <Section title="Долги / Кредиты" items={[...debtsItems, addCard("debts")]} rowScroll baseCurrency={baseCurrency} />

      {(detailAccountId || detailCategoryId) && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeDetails}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 58,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 620,
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              maxHeight:
                "min(82vh, calc(100vh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px))",
              boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
              display: "grid",
              gridTemplateRows: "auto auto 1fr auto",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{detailTitle || "Детали"}</div>
              <button
                type="button"
                onClick={closeDetails}
                style={{
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Закрыть
              </button>
            </div>
            {detailAccountId ? (
              <div style={{ display: "grid", gap: 12, minHeight: 0 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <input
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => {
                      if (!accountSearch) setSearchFocused(false)
                    }}
                    placeholder="Поиск по названию или сумме"
                    style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 15 }}
                  />
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setIsPeriodMenuOpen(true)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      background: "#f8fafc",
                      fontWeight: 600,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      width: "fit-content",
                    }}
                  >
                    Период
                    <span style={{ fontSize: 12, color: "#6b7280" }}>▾</span>
                  </button>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "#6b7280",
                      maxWidth: "100%",
                      flex: 1,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "clip",
                    }}
                  >
                    {accountPeriod.label}
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 18,
                    background: "#fff",
                    padding: 12,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                    display: "grid",
                    gap: 10,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      maxHeight: searchFocused || accountSearch ? "58vh" : "48vh",
                      overflowY: "auto",
                      paddingRight: 2,
                    }}
                  >
                    {groupedAccountTx.length === 0 ? (
                      <div style={{ color: "#6b7280", fontSize: 14 }}>Нет операций</div>
                    ) : (
                      groupedAccountTx.map((group) => {
                        const dayExpense = group.items
                          .filter((tx) => tx.type === "expense")
                          .reduce((sum, tx) => sum + tx.amount.amount, 0)

                        return (
                          <div key={group.dateLabel} style={{ display: "grid", gap: 6, marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                              <div style={{ fontSize: 13, color: "#6b7280" }}>{group.dateLabel}</div>
                              {dayExpense > 0 ? (
                                <div style={{ fontSize: 12, color: "#94a3b8" }}>{formatMoney(dayExpense, baseCurrency)}</div>
                              ) : null}
                            </div>

                            {group.items.map((tx, idx) => {
                              const isIncome = tx.type === "income"
                              const isExpense = tx.type === "expense"
                              const sign = isIncome ? "+" : isExpense ? "-" : ""
                              const color = isIncome ? "#16a34a" : "#0f172a"
                              const amountText = `${sign}${formatMoney(tx.amount.amount, baseCurrency)}`

                              return (
                                <div
                                  key={tx.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 10px",
                                    borderRadius: 12,
                                    background: "#f8fafc",
                                    border: "1px solid rgba(226,232,240,0.7)",
                                    marginTop: idx === 0 ? 0 : 6,
                                    gap: 10,
                                  }}
                                  onClick={() => {
                                    setTxActionId(tx.id)
                                    setTxMode("actions")
                                  }}
                                >
                                  <div style={{ display: "grid", gap: 2 }}>
                                    <div style={{ fontWeight: 500, color: "#0f172a", fontSize: 14.5 }}>
                                      {tx.type === "income"
                                        ? incomeSourceNameById.get(tx.incomeSourceId ?? "") ?? "Доход"
                                        : tx.type === "expense"
                                        ? categoryNameById.get(tx.categoryId ?? "") ?? "Расход"
                                        : "Перевод"}
                                    </div>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ fontWeight: 600, color, textAlign: "right", fontSize: 13.5 }}>
                                      {amountText}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setTxActionId(tx.id)
                                        setTxMode("actions")
                                      }}
                                      style={{
                                        padding: "4px 8px",
                                        borderRadius: 8,
                                        border: "1px solid #e5e7eb",
                                        background: "#fff",
                                        cursor: "pointer",
                                      }}
                                    >
                                      ✎
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
                {/* список */}
              </div>
              {!searchFocused && !accountSearch ? (
                <button
                  type="button"
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#fff",
                    fontWeight: 700,
                    marginTop: 10,
                    marginBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))",
                  }}
                  onClick={() => setIsAccountSheetOpen(true)}
                >
                  Редактировать счет
                </button>
              ) : null}
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {categoryTx.map((tx) => {
                  const amountText = `-${formatMoney(tx.amount.amount, baseCurrency)}`
                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(226,232,240,0.7)",
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 15 }}>
                          {accountNameById.get(tx.accountId) ?? "Счёт"}
                        </div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>{formatDate(tx.date)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13.5 }}>{amountText}</div>
                        <button
                          type="button"
                          onClick={() => openTxActions(tx.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                  )
                })}
                {categoryTx.length === 0 ? <div style={{ color: "#6b7280", fontSize: 14 }}>Нет операций</div> : null}
              </div>
            )}
          </div>
        </div>
      )}

      {txMode !== "none" ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeTxSheet}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              maxHeight:
                "min(70vh, calc(100vh - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - 24px))",
              overflowY: "auto",
              boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            }}
          >
            {txMode === "actions" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setTxMode("edit")}
                  disabled={txLoading}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: txLoading ? "not-allowed" : "pointer",
                  }}
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  onClick={() => setTxMode("delete")}
                  disabled={txLoading}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #fee2e2",
                    background: "#fff",
                    color: "#b91c1c",
                    cursor: txLoading ? "not-allowed" : "pointer",
                  }}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  onClick={closeTxSheet}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                  }}
                >
                  Отмена
                </button>
              </div>
            ) : null}

            {txMode === "delete" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Удалить операцию?</div>
                {txError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{txError}</div> : null}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={closeTxSheet}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      flex: 1,
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteTx}
                    disabled={txLoading}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #fee2e2",
                      background: txLoading ? "#fecdd3" : "#b91c1c",
                      color: "#fff",
                      flex: 1,
                      cursor: txLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {txLoading ? "Удаляем…" : "Удалить"}
                  </button>
                </div>
              </div>
            ) : null}

            {txMode === "edit" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Редактировать операцию</div>
                {txError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{txError}</div> : null}
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Тип</span>
                  <select
                    value={editKind}
                    onChange={(e) => setEditKind(e.target.value as TxKind)}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    disabled={txLoading}
                  >
                    <option value="expense">Расход</option>
                    <option value="income">Доход</option>
                    <option value="transfer">Перевод</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Сумма</span>
                  <input
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    inputMode="decimal"
                    disabled={txLoading}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Дата</span>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    disabled={txLoading}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                </label>

                {editKind === "transfer" ? (
                  <>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 13, color: "#4b5563" }}>Со счёта</span>
                      <select
                        value={editAccountId}
                        onChange={(e) => setEditAccountId(e.target.value)}
                        disabled={txLoading || accounts.length < 1}
                        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 13, color: "#4b5563" }}>На счёт</span>
                      <select
                        value={editToAccountId}
                        onChange={(e) => setEditToAccountId(e.target.value)}
                        disabled={txLoading || accounts.length < 2}
                        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                      >
                        {accounts
                          .filter((a) => a.id !== editAccountId)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#4b5563" }}>Счёт</span>
                    <select
                      value={editAccountId}
                      onChange={(e) => setEditAccountId(e.target.value)}
                      disabled={txLoading || accounts.length === 0}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {editKind === "expense" ? (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#4b5563" }}>Категория</span>
                    <select
                      value={editCategoryId}
                      onChange={(e) => setEditCategoryId(e.target.value)}
                      disabled={txLoading}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">Без категории</option>
                      {categories
                        .filter((c) => c.type === "expense")
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}

                {editKind === "income" ? (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#4b5563" }}>Источник дохода</span>
                    <select
                      value={editIncomeSourceId}
                      onChange={(e) => setEditIncomeSourceId(e.target.value)}
                      disabled={txLoading}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">Без источника</option>
                      {incomeSources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#4b5563" }}>Комментарий</span>
                  <input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    disabled={txLoading}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={closeTxSheet}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      flex: 1,
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={txLoading}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #0f172a",
                      background: txLoading ? "#e5e7eb" : "#0f172a",
                      color: txLoading ? "#6b7280" : "#fff",
                      flex: 1,
                      cursor: txLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {txLoading ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isCustomSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsCustomSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 62,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "#fff",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
              display: "grid",
              gap: 12,
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>Свой период</div>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "#4b5563" }}>С</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "#4b5563" }}>По</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb" }}
              />
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setIsCustomSheetOpen(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  if (customFrom && customTo) {
                    setAccountPeriodType("custom")
                    setIsCustomSheetOpen(false)
                  }
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: customFrom && customTo ? "pointer" : "not-allowed",
                  opacity: customFrom && customTo ? 1 : 0.6,
                }}
                disabled={!customFrom || !customTo}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPeriodMenuOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsPeriodMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 63,
            padding: "12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "70%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 16,
              padding: 12,
              boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
              display: "grid",
              gap: 8,
            }}
          >
            {(["day", "week", "month", "year"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setAccountPeriodType(p)
                  setIsPeriodMenuOpen(false)
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid " + (accountPeriodType === p ? "#0f172a" : "#e5e7eb"),
                  background: accountPeriodType === p ? "#0f172a" : "#fff",
                  color: accountPeriodType === p ? "#fff" : "#0f172a",
                  fontWeight: 600,
                  fontSize: 14,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {p === "day" ? "День" : p === "week" ? "Неделя" : p === "month" ? "Месяц" : "Год"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setAccountPeriodType("custom")
                setIsPeriodMenuOpen(false)
                setIsCustomSheetOpen(true)
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid " + (accountPeriodType === "custom" ? "#0f172a" : "#e5e7eb"),
                background: accountPeriodType === "custom" ? "#0f172a" : "#fff",
                color: accountPeriodType === "custom" ? "#fff" : "#0f172a",
                fontWeight: 600,
                fontSize: 14,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              Свой
            </button>
            <button
              type="button"
              onClick={() => setIsPeriodMenuOpen(false)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}

      {isAccountSheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 40,
          }}
          onClick={() => setIsAccountSheetOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "16px 16px 20px",
              boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              Новый счёт
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                Название
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например, Кошелёк"
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
                />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                Тип
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
                >
                  <option value="cash">Наличные</option>
                  <option value="card">Карта</option>
                  <option value="bank">Банк</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#4b5563" }}>
                Баланс
                <input
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  inputMode="decimal"
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
                />
              </label>
              <button
                type="button"
                onClick={handleCreateAccount}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categorySheetMode ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 45,
            padding: "0 12px 12px",
          }}
          onClick={closeCategorySheet}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              {categorySheetMode === "create" ? "Новая категория" : "Редактировать категорию"}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Название"
                style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 16 }}
              />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                {categorySheetMode === "edit" && editingCategoryId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(editingCategoryId)}
                    disabled={deletingCategoryId === editingCategoryId}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #fee2e2",
                      background: deletingCategoryId === editingCategoryId ? "#fecdd3" : "#fff",
                      color: "#b91c1c",
                      cursor: deletingCategoryId === editingCategoryId ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingCategoryId === editingCategoryId ? "Удаляем…" : "Удалить"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeCategorySheet}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSaveCategory}
                  disabled={isSavingCategory}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: isSavingCategory ? "#e5e7eb" : "#0f172a",
                    color: isSavingCategory ? "#6b7280" : "#fff",
                    cursor: isSavingCategory ? "not-allowed" : "pointer",
                  }}
                >
                  {isSavingCategory ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {incomeSourceSheetMode ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 45,
            padding: "0 12px 12px",
          }}
          onClick={closeIncomeSourceSheet}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
              maxHeight: "70vh",
              overflowY: "auto",
              paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              {incomeSourceSheetMode === "create" ? "Новый источник дохода" : "Редактировать источник"}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                value={incomeSourceName}
                onChange={(e) => setIncomeSourceName(e.target.value)}
                placeholder="Название"
                style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 16 }}
              />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                {incomeSourceSheetMode === "edit" && editingIncomeSourceId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteIncomeSource(editingIncomeSourceId)}
                    disabled={deletingIncomeSourceId === editingIncomeSourceId}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #fee2e2",
                      background: deletingIncomeSourceId === editingIncomeSourceId ? "#fecdd3" : "#fff",
                      color: "#b91c1c",
                      cursor: deletingIncomeSourceId === editingIncomeSourceId ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingIncomeSourceId === editingIncomeSourceId ? "Удаляем…" : "Удалить"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeIncomeSourceSheet}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSaveIncomeSource}
                  disabled={isSavingIncomeSource}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: isSavingIncomeSource ? "#e5e7eb" : "#0f172a",
                    color: isSavingIncomeSource ? "#6b7280" : "#fff",
                    cursor: isSavingIncomeSource ? "not-allowed" : "pointer",
                  }}
                >
                  {isSavingIncomeSource ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default OverviewScreen

// Custom period sheet
;(() => {
  /* placeholder to avoid eslint empty file footer */
})()
