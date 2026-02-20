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
  const { accounts, categories, transactions, setAccounts, setTransactions, currency } = useAppStore()
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null), [])
  const baseCurrency = normalizeCurrency(currency || "RUB")

  const [activeTab, setActiveTab] = useState<QuickAddTab>("expense")
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories])
  const spendByCategory = useMemo(() => {
    const map = new Map<string, number>()
    transactions.forEach((t) => {
      if (t.type !== "expense") return
      if (!t.categoryId) return
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount.amount)
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

  const renderTile = (
    item: { id: string; title: string; icon?: string; color?: string; text?: string; amount?: number; budget?: number | null },
    active: boolean,
    isAccount: boolean,
  ) => (
    <button
      key={item.id}
      type="button"
      className={`tile-card ${isAccount ? "tile-card--account" : "tile-card--category"}`}
      onClick={() => {
        if (isAccount) {
          setSelectedAccountId(item.id)
        } else {
          setSelectedCategoryId(item.id)
        }
      }}
      style={{
        background: item.color || undefined,
        border: undefined,
        boxShadow: active ? "0 0 0 2px #0f172a inset" : undefined,
        color: "#0f172a",
      }}
    >
      <div className="tile-card__icon" style={{ background: "rgba(15,23,42,0.06)", opacity: 1 }}>
        <AppIcon name={(item.icon as IconName) ?? "wallet"} size={16} />
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

  const labelMap: Record<QuickAddTab, string> = {
    expense: "Расход",
    income: "Доход",
    transfer: "Перевод",
    debt: "Долг",
    goal: "Цель",
  }

  return (
    <div className="app-shell" style={{ background: "#f5f6f8" }}>
      <div
        className="app-shell__inner overview"
        style={{ paddingBottom: "calc(var(--bottom-nav-height,56px) + env(safe-area-inset-bottom,0px))", overflowY: "auto" }}
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
                    onClick={() => setActiveTab(tab)}
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

        {activeTab !== "expense" ? (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Скоро</div>
        ) : (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Счёт для списания</div>
            <div className="overview-section__list overview-section__list--row overview-accounts-row" style={{ paddingBottom: 6 }}>
              {accounts.map((acc) =>
                renderTile(
                  {
                    id: acc.id,
                    title: acc.name,
                    icon: "wallet",
                    color: acc.color,
                    text: formatMoney(acc.balance.amount, baseCurrency),
                  },
                  selectedAccountId === acc.id,
                  true,
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
                      icon: (cat.icon as string) ?? "category",
                      amount: spendByCategory.get(cat.id) ?? 0,
                      budget: (cat as { budget?: number | null }).budget ?? null,
                    },
                    selectedCategoryId === cat.id,
                    false,
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
              <button
                type="button"
                disabled={!expenseReady || loading}
                onClick={() => void submitExpense()}
                style={{
                  marginTop: 4,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: expenseReady ? "#0f172a" : "#e5e7eb",
                  color: expenseReady ? "#fff" : "#9ca3af",
                  fontWeight: 700,
                  cursor: expenseReady ? "pointer" : "not-allowed",
                }}
              >
                {loading ? "Сохранение..." : "Готово"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickAddScreen
