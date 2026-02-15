import React, { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { Transaction } from "../types/finance";
import "./OverviewScreen.css";
import { AppIcon, type IconName } from "../components/AppIcon";
import { createAccount, getAccounts } from "../api/accounts";
import { CURRENCIES, formatMoney, normalizeCurrency } from "../utils/formatMoney";

type TileType = "account" | "category";
type TileSize = "sm" | "md" | "lg";

type CardItem = {
  id: string;
  title: string;
  amount: number;
  icon: string;
  color: string;
  isAdd?: boolean;
  type?: TileType;
  size?: TileSize;
};

const cardColors = ["#111827", "#166534", "#92400e", "#2563eb", "#b91c1c", "#0f172a"];

const getCurrentMonthTag = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
};

const isCurrentMonth = (tx: Transaction, currentTag: string) => tx.date.slice(0, 7) === currentTag;

const Section: React.FC<{
  title: string
  items: CardItem[]
  rowScroll?: boolean
  rowClass?: string
  onAddAccounts?: () => void
}> = ({
  title,
  items,
  rowScroll,
  rowClass,
  onAddAccounts,
}) => {
  const listClass = rowScroll
    ? `overview-section__list overview-section__list--row ${rowClass ?? ""}`.trim()
    : "overview-section__list tile-grid";
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
            role={item.isAdd ? "button" : undefined}
            tabIndex={item.isAdd ? 0 : undefined}
            onClick={() => {
              if (item.isAdd && item.id === "add-accounts") {
                onAddAccounts?.();
              }
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
            {!item.isAdd && <div className="tile-card__amount">{formatMoney(item.amount, currency)}</div>}
          </div>
        ))}
      </div>
    </section>
  );
};

function OverviewScreen() {
  const { accounts, categories, incomeSources, transactions, setAccounts, currency, setCurrency } = useAppStore();
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [balance, setBalance] = useState("0");
  const currentMonthTag = getCurrentMonthTag();

  const { incomeSum, expenseSum, incomeBySource, expenseByCategory } = useMemo(() => {
    let income = 0;
    let expense = 0;
    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();

    transactions.forEach((tx) => {
      if (!isCurrentMonth(tx, currentMonthTag)) return;
      if (tx.type === "transfer") return;

      if (tx.type === "income") {
        income += tx.amount.amount;
        const key = tx.incomeSourceId ?? "uncategorized";
        incomeMap.set(key, (incomeMap.get(key) ?? 0) + tx.amount.amount);
      }

      if (tx.type === "expense") {
        expense += tx.amount.amount;
        const key = tx.categoryId ?? "uncategorized";
        expenseMap.set(key, (expenseMap.get(key) ?? 0) + tx.amount.amount);
      }
    });

    return {
      incomeSum: income,
      expenseSum: expense,
      incomeBySource: incomeMap,
      expenseByCategory: expenseMap,
    };
  }, [transactions, currentMonthTag]);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(now);
  }, []);

  const accountItems: CardItem[] = accounts.map((account, idx) => ({
    id: account.id,
    title: account.name,
    amount: account.balance.amount,
    icon: idx % 2 === 0 ? "wallet" : "card",
    color: cardColors[idx % cardColors.length],
    type: "account" as const,
    size: "lg",
  }));

  const accountsToRender = accountItems;

  const expenseCategories = categories.filter((c) => c.type === "expense");

  const incomeItems: CardItem[] = incomeSources.map((src, idx) => ({
    id: src.id,
    title: src.name,
    amount: incomeBySource.get(src.id) ?? 0,
    icon: "arrowDown",
    color: cardColors[(idx + 1) % cardColors.length],
    type: "category" as const,
  }));
  const placeholderIncome: CardItem[] = [
    { id: "ph-income-1", title: "Доход (шаблон)", amount: 0, icon: "arrowDown", color: "#e5e7eb", type: "category", size: "lg" },
    { id: "ph-income-2", title: "Доход (шаблон)", amount: 0, icon: "arrowDown", color: "#e5e7eb", type: "category", size: "lg" },
  ];

  const incomeToRender = [...incomeItems, ...placeholderIncome];

  const uncategorizedIncome = incomeBySource.get("uncategorized");
  if (uncategorizedIncome) {
    incomeItems.push({
      id: "income-uncategorized",
      title: "Без категории",
      amount: uncategorizedIncome,
      icon: "arrowDown",
      color: "#0f172a",
      type: "category" as const,
    });
  }

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
    .sort((a, b) => b.amount - a.amount);

  const placeholderExpense: CardItem[] = Array.from({ length: 10 }).map((_, i) => ({
    id: `ph-exp-${i + 1}`,
    title: "Расход (шаблон)",
    amount: 0,
    icon: "tag",
    color: "#e5e7eb",
    type: "category" as const,
    size: "md" as const,
  }));

  const uncategorizedExpense = expenseByCategory.get("uncategorized");
  if (uncategorizedExpense) {
    expenseItems.push({
      id: "expense-uncategorized",
      title: "Без категории",
      amount: uncategorizedExpense,
      icon: "⬇️",
      color: "#111827",
      type: "category" as const,
    });
  }

  const computeSize = (amount: number, max: number) => {
    if (max <= 0) return "md" as const;
    const ratio = amount / max;
    if (ratio >= 0.66) return "lg" as const;
    if (ratio >= 0.33) return "md" as const;
    return "sm" as const;
  };

  const handleCreateAccount = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
    if (!token) {
      alert("Нет токена");
      return;
    }
    if (!name.trim()) {
      alert("Введите название");
      return;
    }
    const parsed = Number(balance.trim().replace(",", "."));
    if (!Number.isFinite(parsed)) {
      alert("Некорректная сумма");
      return;
    }
    const balanceNumber = Math.round(parsed * 100) / 100;
    try {
      await createAccount(token, {
        name: name.trim(),
        type: type || "cash",
        currency: normalizeCurrency(currency),
        balance: balanceNumber,
      });
      const res = await getAccounts(token);
      const mapped = res.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: { amount: a.balance, currency: a.currency },
      }));
      setAccounts(mapped);
      setIsAccountSheetOpen(false);
      setName("");
      setBalance("0");
    } catch {
      alert("Не удалось создать счёт");
    }
  };

  const maxExpenseAmount = Math.max(0, ...expenseItems.map((i) => i.amount));
  const sizedExpenseItems = expenseItems.map((i) => ({ ...i, size: i.size ?? computeSize(i.amount, maxExpenseAmount) }));

  const expenseToRender = [...sizedExpenseItems, ...placeholderExpense];

  const goalsItems: CardItem[] = [
    { id: "goal-trip", title: "Путешествие", amount: 0, icon: "plane", color: "#0ea5e9" },
    { id: "goal-tech", title: "Гаджеты", amount: 0, icon: "chart", color: "#8b5cf6" },
  ];

  const placeholderGoals: CardItem[] = [
    { id: "ph-goal-1", title: "Цель (шаблон)", amount: 0, icon: "goal", color: "#e5e7eb", type: "category", size: "md" },
    { id: "ph-goal-2", title: "Цель (шаблон)", amount: 0, icon: "goal", color: "#e5e7eb", type: "category", size: "md" },
  ];

  const goalsToRender = [...goalsItems, ...placeholderGoals];

  const debtsItems: CardItem[] = [
    { id: "debt-bank", title: "Банк", amount: 0, icon: "bank", color: "#ea580c" },
    { id: "debt-friend", title: "Друзья", amount: 0, icon: "repeat", color: "#1e293b" },
  ];

  const addCard = (suffix: string): CardItem => ({
    id: `add-${suffix}`,
    title: "Добавить",
    amount: 0,
    icon: "plus",
    color: "transparent",
    isAdd: true,
  });

  const summaryBalance = accounts.reduce((sum, acc) => sum + acc.balance.amount, 0);

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
            <div className="summary__value summary__value--negative">{formatMoney(expenseSum, currency)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">БАЛАНС</div>
            <div className="summary__value">{formatMoney(summaryBalance, currency)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">ДОХОДЫ</div>
            <div className="summary__value summary__value--positive">{formatMoney(incomeSum, currency)}</div>
          </div>
        </div>
      </section>

      <Section
        title="Счета"
        items={[...accountsToRender, addCard("accounts")]}
        rowScroll
        rowClass="overview-accounts-row"
        onAddAccounts={() => setIsAccountSheetOpen(true)}
      />

      <Section title="Источники дохода" items={[...incomeToRender, addCard("income")]} rowScroll />

      <Section title="Расходы" items={[...expenseToRender, addCard("expense")]} rowScroll rowClass="overview-expenses-row" />

      <Section title="Цели" items={[...goalsToRender, addCard("goals")]} rowScroll />
      <Section title="Долги / Кредиты" items={[...debtsItems, addCard("debts")]} rowScroll />

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
                Валюта
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label}
                    </option>
                  ))}
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
    </div>
  );
}

export default OverviewScreen;
