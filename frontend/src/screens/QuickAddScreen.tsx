import { useMemo, useState, useCallback, useRef } from "react"
import { useAppStore } from "../store/useAppStore"
import { formatMoney, normalizeCurrency } from "../utils/formatMoney"
import { createTransaction, getTransactions } from "../api/transactions"
import { getGoals } from "../api/goals"
import { getAccounts } from "../api/accounts"
import { AppIcon, type IconName } from "../components/AppIcon"
import { FinanceIcon, isFinanceIconKey } from "../shared/icons/financeIcons"
import { getAccountDisplay, getCategoryDisplay, getGoalDisplay, getIncomeSourceDisplay } from "../shared/display"
import { GoalList } from "../components/GoalList"

type QuickAddTab = "expense" | "income" | "transfer" | "debt" | "goal"

type Props = {
  onClose: () => void
}

export const QuickAddScreen: React.FC<Props> = ({ onClose }) => {
  const { accounts, categories, incomeSources, goals, transactions, setAccounts, setTransactions, setGoals, currency } = useAppStore()
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null), [])
  const baseCurrency = normalizeCurrency(currency || "RUB")

  const [activeTab, setActiveTab] = useState<QuickAddTab>("expense")
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedIncomeSourceId, setSelectedIncomeSourceId] = useState<string | null>(null)
  const [transferFromAccountId, setTransferFromAccountId] = useState<string | null>(null)
  const [transferToAccountId, setTransferToAccountId] = useState<string | null>(null)
  const [transferTargetType, setTransferTargetType] = useState<"account" | "goal" | "debt">("account")
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isGoalPickerOpen, setIsGoalPickerOpen] = useState(false)
  const goalsFetchInFlight = useRef(false)

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories])
  const incomeSourcesList = useMemo(() => incomeSources, [incomeSources])
  const spendByCategory = useMemo(() => {
    const map = new Map<string, number>()
    transactions.forEach((t) => {
      if (t.type !== "expense") return
      if (!t.categoryId) return
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount.amount)
    })
    return map
  }, [transactions])

const incomeBySource = useMemo(() => {
  const map = new Map<string, number>()
  transactions.forEach((t) => {
    if (t.type !== "income") return
    if (!t.incomeSourceId) return
    map.set(t.incomeSourceId, (map.get(t.incomeSourceId) ?? 0) + t.amount.amount)
  })
  return map
}, [transactions])

  const accountsById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts])
  const categoriesById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const incomeSourcesById = useMemo(() => Object.fromEntries(incomeSources.map((s) => [s.id, s])), [incomeSources])
  const goalsById = useMemo(() => Object.fromEntries(goals.map((g) => [g.id, g])), [goals])

  const accountTiles = useMemo(
    () =>
      accounts.map((acc) => {
        const display = getAccountDisplay(acc.id, accountsById)
        return {
          id: acc.id,
          title: display.title,
          iconKey: display.iconKey ?? null,
          color: display.color ?? "#EEF2F7",
          text: formatMoney(acc.balance.amount, baseCurrency),
        }
      }),
    [accounts, accountsById, baseCurrency],
  )

  const expenseCategoryTiles = useMemo(
    () =>
      expenseCategories.map((cat) => {
        const display = getCategoryDisplay(cat.id, categoriesById)
        const budget = (cat as { budget?: number | null }).budget ?? null
        const spent = spendByCategory.get(cat.id) ?? 0
        const budgetTone = (() => {
          if (!budget || budget <= 0) return "normal" as const
          const ratio = spent / budget
          if (ratio > 1) return "alert" as const
          if (ratio > 0.7) return "warn" as const
          return "normal" as const
        })()
        return {
          id: cat.id,
          title: display.title,
          iconKey: display.iconKey ?? null,
          amount: spent,
          budget,
          budgetTone,
        }
      }),
    [categoriesById, expenseCategories, spendByCategory],
  )

  const incomeSourceTiles = useMemo(
    () =>
      incomeSourcesList.map((src) => {
        const display = getIncomeSourceDisplay(src.id, incomeSourcesById)
        return {
          id: src.id,
          title: display.title,
          iconKey: display.iconKey ?? null,
          amount: incomeBySource.get(src.id) ?? 0,
          color: "#EEF2F7",
        }
      }),
    [incomeBySource, incomeSourcesById, incomeSourcesList],
  )

  const submitExpense = useCallback(async () => {
    if (!token) {
      setError("Нет токена")
      return
    }
    if (!selectedAccountId || !selectedCategoryId) {
      setError("Выберите счёт и категорию")
      return
    }
    const amt = Number(amount.replace(",", "."))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Введите сумму")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await createTransaction(token, {
        kind: "expense",
        amount: Math.round(amt * 100) / 100,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId,
      })
      const accountsData = await getAccounts(token)
      setAccounts(
        accountsData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        })),
      )
      const txData = await getTransactions(token)
      setTransactions(
        txData.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: { amount: typeof t.amount === "string" ? Number(t.amount) : t.amount, currency: "RUB" },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          accountName: t.accountName ?? null,
          fromAccountId: t.fromAccountId ?? undefined,
          fromAccountName: t.fromAccountName ?? null,
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
          toAccountName: t.toAccountName ?? null,
          goalId: (t as { goalId?: string | null }).goalId ?? undefined,
        })),
      )
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось сохранить"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [amount, onClose, selectedAccountId, selectedCategoryId, setAccounts, setTransactions, token])

  const submitIncome = useCallback(async () => {
    if (!token) {
      setError("Нет токена")
      return
    }
    if (!selectedIncomeSourceId || !selectedAccountId) {
      setError("Выберите источник и счёт")
      return
    }
    const amt = Number(amount.replace(",", "."))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Введите сумму")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await createTransaction(token, {
        kind: "income",
        amount: Math.round(amt * 100) / 100,
        accountId: selectedAccountId,
        incomeSourceId: selectedIncomeSourceId,
      })
      const accountsData = await getAccounts(token)
      setAccounts(
        accountsData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        })),
      )
      const txData = await getTransactions(token)
      setTransactions(
        txData.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: { amount: typeof t.amount === "string" ? Number(t.amount) : t.amount, currency: "RUB" },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          accountName: t.accountName ?? null,
          fromAccountId: t.fromAccountId ?? undefined,
          fromAccountName: t.fromAccountName ?? null,
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
          toAccountName: t.toAccountName ?? null,
          goalId: (t as { goalId?: string | null }).goalId ?? undefined,
        })),
      )
      setSelectedIncomeSourceId(null)
      setSelectedAccountId(null)
      setAmount("")
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось сохранить"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [amount, onClose, selectedAccountId, selectedIncomeSourceId, setAccounts, setTransactions, token])

  const renderTile = (
    item: {
      id: string
      title: string
      icon?: string
      iconKey?: string | null
      color?: string
      text?: string
      amount?: number
      budget?: number | null
      budgetTone?: "normal" | "warn" | "alert"
    },
    active: boolean,
    kind: "account" | "category" | "income-source" | "goal",
    onSelect?: (id: string) => void,
  ) => (
    <button
      key={item.id}
      type="button"
      className={`tile-card ${kind === "category" ? "tile-card--category" : "tile-card--account"}`}
      onClick={() => {
        if (onSelect) {
          onSelect(item.id)
          return
        }
        if (kind === "account") {
          setSelectedAccountId(item.id)
        } else if (kind === "category") {
          setSelectedCategoryId(item.id)
        } else if (kind === "income-source") {
          setSelectedIncomeSourceId(item.id)
        } else if (kind === "goal") {
          setSelectedGoalId(item.id)
        }
      }}
      style={{
        background: item.color || undefined,
        border: item.budgetTone
          ? item.budgetTone === "alert"
            ? "1px solid #ef4444"
            : item.budgetTone === "warn"
            ? "1px solid #f59e0b"
            : undefined
          : undefined,
        backgroundColor:
          item.budgetTone === "alert"
            ? "rgba(248,113,113,0.12)"
            : item.budgetTone === "warn"
            ? "rgba(251,191,36,0.12)"
            : item.color || undefined,
        boxShadow: active ? "0 0 0 2px #0f172a inset" : undefined,
        color: "#0f172a",
      }}
    >
      <div className="tile-card__icon" style={{ background: "rgba(15,23,42,0.06)", opacity: 1 }}>
        {item.iconKey && isFinanceIconKey(item.iconKey) ? (
          <FinanceIcon iconKey={item.iconKey} size={16} />
        ) : item.icon ? (
          <AppIcon name={(item.icon as IconName) ?? "wallet"} size={16} />
        ) : null}
      </div>
      <div className="tile-card__title" style={{ fontWeight: 600 }}>{item.title}</div>
      {item.text ? <div style={{ fontSize: 12, color: "#6b7280" }}>{item.text}</div> : null}
      {item.amount !== undefined ? (
        <div className="tile-card__amount">{formatMoney(item.amount, baseCurrency)}</div>
      ) : null}
      {item.budget != null ? (
        <div style={{ marginTop: 2, fontSize: 9, color: "#6b7280" }}>{formatMoney(item.budget, baseCurrency)}</div>
      ) : null}
    </button>
  )

  const submitTransfer = useCallback(async () => {
    if (!token) {
      setError("Нет токена")
      return
    }
    if (transferTargetType === "debt") {
      setError("Переводы в долги появятся позже")
      return
    }
    if (transferTargetType === "goal") {
      setError("Переводы на цели будут добавлены позже")
      return
    }
    if (!transferFromAccountId || !transferToAccountId) {
      setError("Выберите счета")
      return
    }
    if (transferFromAccountId === transferToAccountId) {
      setError("Счета должны различаться")
      return
    }
    const amt = Number(amount.replace(",", "."))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Введите сумму")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await createTransaction(token, {
        kind: "transfer",
        amount: Math.round(amt * 100) / 100,
        accountId: transferFromAccountId,
        toAccountId: transferToAccountId,
        happenedAt: `${transferDate}T00:00:00.000Z`,
      })
      const accountsData = await getAccounts(token)
      setAccounts(
        accountsData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
          color: a.color ?? undefined,
          icon: a.icon ?? null,
        })),
      )
      const txData = await getTransactions(token)
      setTransactions(
        txData.transactions.map((t) => ({
          id: t.id,
          type: t.kind,
          amount: { amount: typeof t.amount === "string" ? Number(t.amount) : t.amount, currency: "RUB" },
          date: t.happenedAt,
          accountId: t.accountId ?? t.fromAccountId ?? "",
          accountName: t.accountName ?? null,
          fromAccountId: t.fromAccountId ?? undefined,
          fromAccountName: t.fromAccountName ?? null,
          categoryId: t.categoryId ?? undefined,
          incomeSourceId: t.incomeSourceId ?? undefined,
          toAccountId: t.toAccountId ?? undefined,
          toAccountName: t.toAccountName ?? null,
          goalId: (t as { goalId?: string | null }).goalId ?? undefined,
        })),
      )
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось сохранить"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [amount, onClose, setAccounts, setTransactions, token, transferDate, transferFromAccountId, transferToAccountId, transferTargetType])

  const expenseReady = selectedAccountId && selectedCategoryId && Number(amount.replace(",", ".")) > 0
  const incomeReady = selectedAccountId && selectedIncomeSourceId && Number(amount.replace(",", ".")) > 0
  const transferAmountNumber = Number(amount.replace(",", "."))
  const transferReady =
    transferTargetType === "account"
      ? Boolean(transferFromAccountId && transferToAccountId && transferFromAccountId !== transferToAccountId && transferAmountNumber > 0)
      : transferTargetType === "goal"
      ? Boolean(transferFromAccountId && selectedGoalId && transferAmountNumber > 0)
      : false

  const labelMap: Record<QuickAddTab, string> = {
    expense: "Расход",
    income: "Доход",
    transfer: "Перевод",
    debt: "Долг",
    goal: "Цель",
  }

  const ensureGoalsLoaded = useCallback(async () => {
    if (goals.length > 0 || !token || goalsFetchInFlight.current) return
    goalsFetchInFlight.current = true
    try {
      const data = await getGoals(token)
      const mapped = data.goals.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ?? null,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        status: g.status,
      }))
      setGoals(mapped)
    } catch (err) {
      console.error(err)
    } finally {
      goalsFetchInFlight.current = false
    }
  }, [goals.length, setGoals, token])

  return (
    <div
      className="app-shell"
      style={{
        background: "#f5f6f8",
        position: "relative",
        minHeight: "100dvh",
        overflow: "visible",
      }}
    >
      <div
        className="app-shell__inner overview"
        style={{
          paddingBottom: "calc(var(--bottom-nav-height,56px) + env(safe-area-inset-bottom,0px))",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          minHeight: "100dvh",
        }}
      >
        <div style={{ display: "grid", gap: 10, padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, color: "#0f172a" }}>Выберите операцию</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#0f172a",
                fontWeight: 600,
              }}
            >
              Закрыть
            </button>
          </div>
          <div style={{ overflowX: "auto", paddingBottom: 2 }}>
            <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
              {(Object.keys(labelMap) as QuickAddTab[]).map((tab) => {
                const iconMap: Record<QuickAddTab, IconName> = {
                  expense: "report",
                  income: "plus",
                  transfer: "repeat",
                  debt: "bank",
                  goal: "goal",
                }
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab)
                      setError(null)
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: activeTab === tab ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: activeTab === tab ? "#0f172a" : "#fff",
                      color: activeTab === tab ? "#fff" : "#0f172a",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <AppIcon name={iconMap[tab]} size={14} />
                    {labelMap[tab]}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ borderBottom: "1px solid #e5e7eb" }} />
        </div>

        {activeTab === "expense" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт для списания</div>
            <div className="overview-section__list overview-section__list--row overview-accounts-row" style={{ paddingBottom: 6 }}>
              {accountTiles.map((acc) =>
                renderTile(
                    {
                      id: acc.id,
                      title: acc.title,
                      icon: "wallet",
                      iconKey: acc.iconKey,
                      color: acc.color,
                      text: acc.text,
                    },
                    selectedAccountId === acc.id,
                    "account",
                  ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Категория расходов</div>
              <div className="overview-expenses-row">
                {expenseCategoryTiles.map((cat) =>
                  renderTile(
                    {
                      id: cat.id,
                      title: cat.title,
                      iconKey: cat.iconKey,
                      amount: cat.amount,
                      budget: cat.budget,
                      budgetTone: cat.budgetTone,
                    },
                    selectedCategoryId === cat.id,
                    "category",
                  ),
                )}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 8 }}>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Сумма"
                inputMode="decimal"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontSize: 16,
                  outline: "none",
                  boxShadow: "none",
                }}
              />
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
              <div style={{ paddingTop: 8 }}>
                <button
                  type="button"
                  disabled={!expenseReady || loading}
                  onClick={() => void submitExpense()}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: expenseReady && !loading ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                    color: expenseReady && !loading ? "#ffffff" : "rgba(255,255,255,0.7)",
                    fontWeight: 700,
                    cursor: expenseReady && !loading ? "pointer" : "not-allowed",
                  }}
                >
                  {loading ? "Сохранение..." : "Готово"}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === "income" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Источник дохода</div>
            <div className="overview-section__list overview-section__list--row overview-accounts-row" style={{ paddingBottom: 6 }}>
              {incomeSourceTiles.map((src) =>
                renderTile(
                  {
                    id: src.id,
                    title: src.title,
                    iconKey: src.iconKey,
                    amount: src.amount,
                    color: src.color,
                  },
                  selectedIncomeSourceId === src.id,
                  "income-source",
                ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт для зачисления</div>
              <div className="overview-section__list overview-section__list--row overview-accounts-row" style={{ paddingBottom: 6 }}>
              {accountTiles.map((acc) =>
                renderTile(
                  {
                    id: acc.id,
                    title: acc.title,
                    icon: "wallet",
                    iconKey: acc.iconKey,
                    color: acc.color,
                    text: acc.text,
                  },
                  selectedAccountId === acc.id,
                  "account",
                  ),
              )}
            </div>
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 8 }}>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Сумма"
                inputMode="decimal"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontSize: 16,
                  outline: "none",
                  boxShadow: "none",
                }}
              />
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
              <div style={{ paddingTop: 8 }}>
                <button
                  type="button"
                  disabled={!incomeReady || loading}
                  onClick={() => void submitIncome()}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: incomeReady && !loading ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                    color: incomeReady && !loading ? "#ffffff" : "rgba(255,255,255,0.7)",
                    fontWeight: 700,
                    cursor: incomeReady && !loading ? "pointer" : "not-allowed",
                  }}
                >
                  {loading ? "Сохранение..." : "Готово"}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === "transfer" ? (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт — откуда</div>
            <div className="overview-section__list overview-section__list--row overview-accounts-row" style={{ paddingBottom: 6 }}>
              {accountTiles.map((acc) =>
                renderTile(
                  {
                    id: acc.id,
                    title: acc.title,
                    icon: "wallet",
                    iconKey: acc.iconKey,
                    color: acc.color,
                    text: acc.text,
                  },
                  transferFromAccountId === acc.id,
                  "account",
                  (id) => {
                    setTransferFromAccountId(id)
                    setError(null)
                  },
                ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 10 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Куда</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {[
                  { key: "account", label: "Счёт" },
                  { key: "goal", label: "Мои цели" },
                  { key: "debt", label: "Долги / Кредиты" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setTransferTargetType(opt.key as "account" | "goal" | "debt")
                      setError(null)
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: transferTargetType === opt.key ? "1px solid #0f172a" : "1px solid #e5e7eb",
                      background: transferTargetType === opt.key ? "#0f172a" : "#fff",
                      color: transferTargetType === opt.key ? "#fff" : "#0f172a",
                      fontWeight: 600,
                      minWidth: 90,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {transferTargetType === "account" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт — куда</div>
                  <div className="overview-section__list overview-section__list--row overview-accounts-row" style={{ paddingBottom: 6 }}>
                    {accountTiles.map((acc) =>
                      renderTile(
                        {
                          id: acc.id,
                          title: acc.title,
                          icon: "wallet",
                          iconKey: acc.iconKey,
                          color: acc.color,
                          text: acc.text,
                        },
                        transferToAccountId === acc.id,
                        "account",
                        (id) => {
                          setTransferToAccountId(id)
                          setError(null)
                        },
                      ),
                    )}
                  </div>
                </div>
              ) : transferTargetType === "goal" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Цель</div>
                  <button
                    type="button"
                    onClick={async () => {
                      setError(null)
                      await ensureGoalsLoaded()
                      setIsGoalPickerOpen(true)
                    }}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {selectedGoalId && isFinanceIconKey(getGoalDisplay(selectedGoalId, goalsById).iconKey ?? "") ? (
                        <FinanceIcon iconKey={getGoalDisplay(selectedGoalId, goalsById).iconKey ?? ""} size={16} />
                      ) : null}
                      <span style={{ fontSize: 15 }}>
                        {selectedGoalId ? getGoalDisplay(selectedGoalId, goalsById).title : "Выбрать цель"}
                      </span>
                    </span>
                    <span style={{ fontSize: 16, color: "#9ca3af" }}>▾</span>
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "#6b7280", fontSize: 13 }}>Долги и кредиты будут доступны позже</div>
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Сумма"
                  inputMode="decimal"
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 16,
                    outline: "none",
                    boxShadow: "none",
                  }}
                />
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 16,
                    outline: "none",
                    boxShadow: "none",
                  }}
                />
              </div>
              {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
              <div style={{ paddingTop: 4 }}>
                <button
                  type="button"
                  disabled={!transferReady || loading}
                  onClick={() => void submitTransfer()}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: transferReady && !loading ? "#0f0f0f" : "rgba(15,15,15,0.3)",
                    color: transferReady && !loading ? "#ffffff" : "rgba(255,255,255,0.7)",
                    fontWeight: 700,
                    cursor: transferReady && !loading ? "pointer" : "not-allowed",
                  }}
                >
                  {loading ? "Сохранение..." : "Готово"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Скоро</div>
        )}

        {isGoalPickerOpen ? (
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
              zIndex: 90,
              padding: "0 12px 12px",
            }}
            onClick={() => setIsGoalPickerOpen(false)}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 520,
                margin: "24px auto calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
                background: "#fff",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                padding: 16,
                boxShadow: "none",
                maxHeight: "75vh",
                overflowY: "auto",
                paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <div style={{ width: 32, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", textAlign: "center", marginBottom: 12 }}>
              Выбор цели
            </div>
              <GoalList
                goals={goals}
                selectedGoalId={selectedGoalId}
                onSelectGoal={(goal) => {
                  setSelectedGoalId(goal.id)
                  setIsGoalPickerOpen(false)
                  setError(null)
                }}
                emptyText="Цели отсутствуют"
              />
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}

export default QuickAddScreen
