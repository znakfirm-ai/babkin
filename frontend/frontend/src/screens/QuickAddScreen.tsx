import { useMemo, useState, useCallback } from "react"
import { useAppStore } from "../store/useAppStore"
import { formatMoney, normalizeCurrency } from "../utils/formatMoney"
import { createTransaction, getTransactions } from "../api/transactions"
import { getAccounts } from "../api/accounts"
import { AppIcon, type IconName } from "../components/AppIcon"
import type { Account, Category } from "../types/finance"

type QuickAddTab = "expense" | "income" | "transfer" | "debt" | "goal"

type Props = {
  onClose: () => void
}

const tileStyle = {
  width: 120,
  minWidth: 120,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center" as const,
  gap: 8,
  cursor: "pointer",
}

export const QuickAddScreen: React.FC<Props> = ({ onClose }) => {
  const { accounts, categories, setAccounts, setTransactions, currency } = useAppStore()
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null), [])
  const baseCurrency = normalizeCurrency(currency || "RUB")

  const [activeTab, setActiveTab] = useState<QuickAddTab>("expense")
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense"),
    [categories],
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
        accountsData.accounts.map((a) => ({ id: a.id, name: a.name, balance: { amount: a.balance, currency: a.currency }, color: a.color ?? undefined })),
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

  const renderTile = (item: { id: string; title: string; icon?: string; color?: string; text?: string }, active: boolean) => (
    <button
      key={item.id}
      type="button"
      onClick={() => {
        if ((item as Account).balance) {
          setSelectedAccountId(item.id)
        } else {
          setSelectedCategoryId(item.id)
        }
      }}
      style={{
        ...tileStyle,
        border: active ? "2px solid #0f172a" : tileStyle.border,
        background: item.color || tileStyle.background,
        color: "#0f172a",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: "rgba(15,23,42,0.05)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppIcon name={(item.icon as IconName) ?? "wallet"} size={16} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
      {item.text ? <div style={{ fontSize: 12, color: "#6b7280" }}>{item.text}</div> : null}
    </button>
  )

  const expenseReady = selectedAccountId && selectedCategoryId && Number(amount.replace(",", ".")) > 0

  return (
    <div className="app-shell" style={{ background: "#f5f6f8" }}>
      <div className="app-shell__inner" style={{ paddingBottom: "calc(var(--bottom-nav-height,56px) + env(safe-area-inset-bottom,0px))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {["expense", "income", "transfer", "debt", "goal"].map((tab) => {
              const labelMap: Record<QuickAddTab, string> = {
                expense: "Расход",
                income: "Доход",
                transfer: "Перевод",
                debt: "Долг",
                goal: "Цель",
              }
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab as QuickAddTab)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: activeTab === tab ? "1px solid #0f172a" : "1px solid #e5e7eb",
                    background: activeTab === tab ? "#0f172a" : "#fff",
                    color: activeTab === tab ? "#fff" : "#0f172a",
                    fontWeight: 600,
                  }}
                >
                  {labelMap[tab as QuickAddTab]}
                </button>
              )
            })}
          </div>
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

        {activeTab !== "expense" ? (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Скоро</div>
        ) : (
          <div style={{ display: "grid", gap: 16, padding: "0 16px 24px" }}>
            <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Выберите счёт для списания</div>
            <div style={{ overflowX: "auto", paddingBottom: 6 }}>
              <div style={{ display: "flex", gap: 10 }}>
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
                  ),
                )}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 12 }}>
              <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>Выберите категорию расходов</div>
              <div style={{ overflowX: "auto", paddingBottom: 6 }}>
                <div
                  style={{
                    display: "grid",
                    gridAutoFlow: "column",
                    gridTemplateRows: "repeat(2, auto)",
                    gridAutoColumns: 124,
                    gap: 10,
                  }}
                >
                  {expenseCategories.map((cat) =>
                    renderTile(
                      {
                        id: cat.id,
                        title: cat.name,
                        icon: (cat.icon as string) ?? "category",
                      },
                      selectedCategoryId === cat.id,
                    ),
                  )}
                </div>
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
                className="tx-modal__button tx-modal__button--primary"
                style={{
                  marginTop: 4,
                  opacity: expenseReady && !loading ? 1 : 0.7,
                  cursor: expenseReady && !loading ? "pointer" : "not-allowed",
                  width: "100%",
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
