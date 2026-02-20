import { useMemo, useState, useCallback } from "react"
import { useAppStore } from "../store/useAppStore"
import { formatMoney, normalizeCurrency } from "../utils/formatMoney"
import { createTransaction, getTransactions } from "../api/transactions"
import { getAccounts } from "../api/accounts"
import { AppIcon, type IconName } from "../components/AppIcon"

type QuickAddTab = "expense" | "income" | "transfer" | "debt" | "goal"

type Props = {
  onClose: () => void
}

export const QuickAddScreen: React.FC<Props> = ({ onClose }) => {
  const { accounts, categories, incomeSources, transactions, setAccounts, setTransactions, currency } = useAppStore()
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null), [])
  const baseCurrency = normalizeCurrency(currency || "RUB")

  const [activeTab, setActiveTab] = useState<QuickAddTab>("expense")
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedIncomeSourceId, setSelectedIncomeSourceId] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      iconEmoji?: string
      color?: string
      text?: string
      amount?: number
      budget?: number | null
      budgetTone?: "normal" | "warn" | "alert"
    },
    active: boolean,
    kind: "account" | "category" | "income-source",
  ) => (
    <button
      key={item.id}
      type="button"
      className={`tile-card ${kind === "category" ? "tile-card--category" : "tile-card--account"}`}
      onClick={() => {
        if (kind === "account") {
          setSelectedAccountId(item.id)
        } else if (kind === "category") {
          setSelectedCategoryId(item.id)
        } else {
          setSelectedIncomeSourceId(item.id)
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
        {kind === "income-source"
          ? item.iconEmoji
            ? <span style={{ fontSize: 16, lineHeight: 1 }}>{item.iconEmoji}</span>
            : null
          : <AppIcon name={(item.icon as IconName) ?? "wallet"} size={16} />}
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

  const expenseReady = selectedAccountId && selectedCategoryId && Number(amount.replace(",", ".")) > 0
  const incomeReady = selectedAccountId && selectedIncomeSourceId && Number(amount.replace(",", ".")) > 0

  const labelMap: Record<QuickAddTab, string> = {
    expense: "Расход",
    income: "Доход",
    transfer: "Перевод",
    debt: "Долг",
    goal: "Цель",
  }

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
              {accounts.map((acc) =>
                renderTile(
                    {
                      id: acc.id,
                      title: acc.name,
                      icon: "wallet",
                      color: acc.color ?? "#EEF2F7",
                      text: formatMoney(acc.balance.amount, baseCurrency),
                    },
                    selectedAccountId === acc.id,
                    "account",
                  ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Категория расходов</div>
              <div className="overview-expenses-row">
                {expenseCategories.map((cat) =>
                  renderTile(
                    {
                      id: cat.id,
                      title: cat.name,
                      icon: "tag",
                      amount: spendByCategory.get(cat.id) ?? 0,
                      budget: (cat as { budget?: number | null }).budget ?? null,
                      budgetTone: (() => {
                        const budget = (cat as { budget?: number | null }).budget ?? null
                        if (!budget || budget <= 0) return "normal"
                        const ratio = (spendByCategory.get(cat.id) ?? 0) / budget
                        if (ratio > 1) return "alert"
                        if (ratio > 0.7) return "warn"
                        return "normal"
                      })(),
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
              {incomeSourcesList.map((src) =>
                renderTile(
                  {
                    id: src.id,
                    title: src.name,
                    iconEmoji: src.icon && src.icon.trim().length > 0 ? src.icon.trim() : undefined,
                    amount: incomeBySource.get(src.id) ?? 0,
                    color: "#EEF2F7",
                  },
                  selectedIncomeSourceId === src.id,
                  "income-source",
                ),
              )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт для зачисления</div>
              <div className="overview-section__list overview-section__list--row overview-accounts-row" style={{ paddingBottom: 6 }}>
                {accounts.map((acc) =>
                  renderTile(
                    {
                      id: acc.id,
                      title: acc.name,
                      icon: "wallet",
                      color: acc.color ?? "#EEF2F7",
                      text: formatMoney(acc.balance.amount, baseCurrency),
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
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Скоро</div>
        )}
      </div>
    </div>
  )
}

export default QuickAddScreen
