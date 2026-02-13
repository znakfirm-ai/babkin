import React, { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import type { Transaction } from "../types/finance";
import "./OverviewScreen.css";

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

const formatMoney = (amountMinor: number) =>
  (amountMinor / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + " ₽";

const getCurrentMonthTag = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
};

const isCurrentMonth = (tx: Transaction, currentTag: string) => tx.date.slice(0, 7) === currentTag;

const Section: React.FC<{ title: string; items: CardItem[]; rowScroll?: boolean; compactGrid?: boolean }> = ({
  title,
  items,
  rowScroll,
  compactGrid,
}) => {
  const listClass = rowScroll
    ? "overview-section__list overview-section__list--row"
    : `overview-section__list ${compactGrid ? "overview-grid--compact" : "tile-grid"}`;
  return (
    <section className="overview-section">
      <div className="overview-section__title">{title}</div>
      <div className={listClass}>
        {items.map((item) => (
          <div
            key={item.id}
            className={`tile-card ${item.isAdd ? "tile-card--add" : ""} ${item.type ? `tile-card--${item.type}` : ""} tile--${item.size ?? "md"}`}
          >
            <div
              className="tile-card__icon"
              style={
                item.isAdd
                  ? undefined
                  : { background: "rgba(15, 23, 42, 0.05)", color: "rgba(15, 23, 42, 0.85)" }
              }
            >
              {item.icon}
            </div>
            <div className="tile-card__title">{item.title}</div>
            {!item.isAdd && <div className="tile-card__amount">{formatMoney(item.amount)}</div>}
          </div>
        ))}
      </div>
    </section>
  );
};

function OverviewScreen() {
  const { accounts, categories, incomeSources, transactions } = useAppStore();
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
    icon: idx % 2 === 0 ? "👛" : "💳",
    color: cardColors[idx % cardColors.length],
    type: "account" as const,
    size: "lg",
  }));

  const expenseCategories = categories.filter((c) => c.type === "expense");

  const incomeItems: CardItem[] = incomeSources.map((src, idx) => ({
    id: src.id,
    title: src.name,
    amount: incomeBySource.get(src.id) ?? 0,
    icon: "⬇️",
    color: cardColors[(idx + 1) % cardColors.length],
    type: "category" as const,
  }));

  const uncategorizedIncome = incomeBySource.get("uncategorized");
  if (uncategorizedIncome) {
    incomeItems.push({
      id: "income-uncategorized",
      title: "Без категории",
      amount: uncategorizedIncome,
      icon: "⬇️",
      color: "#0f172a",
      type: "category" as const,
    });
  }

  const expenseItems: CardItem[] = expenseCategories
    .map((cat, idx) => ({
      id: cat.id,
      title: cat.name,
      amount: expenseByCategory.get(cat.id) ?? 0,
      icon: "⬇️",
      color: cardColors[(idx + 2) % cardColors.length],
      type: "category" as const,
      size: "md" as const,
    }))
    .sort((a, b) => b.amount - a.amount);

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

  const maxExpenseAmount = Math.max(0, ...expenseItems.map((i) => i.amount));
  const sizedExpenseItems = expenseItems.map((i) => ({ ...i, size: i.size ?? computeSize(i.amount, maxExpenseAmount) }));

  const goalsItems: CardItem[] = [
    { id: "goal-trip", title: "Путешествие", amount: 0, icon: "🧭", color: "#0ea5e9" },
    { id: "goal-tech", title: "Гаджеты", amount: 0, icon: "💻", color: "#8b5cf6" },
  ];

  const debtsItems: CardItem[] = [
    { id: "debt-bank", title: "Банк", amount: 0, icon: "🏦", color: "#ea580c" },
    { id: "debt-friend", title: "Друзья", amount: 0, icon: "👥", color: "#1e293b" },
  ];

  const addCard = (suffix: string): CardItem => ({
    id: `add-${suffix}`,
    title: "Добавить",
    amount: 0,
    icon: "+",
    color: "transparent",
    isAdd: true,
  });

  const summaryBalance = incomeSum - expenseSum;

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
            <div className="summary__value summary__value--negative">{formatMoney(expenseSum)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">БАЛАНС</div>
            <div className="summary__value">{formatMoney(summaryBalance)}</div>
          </div>
          <div className="summary__col">
            <div className="summary__label">ДОХОДЫ</div>
            <div className="summary__value summary__value--positive">{formatMoney(incomeSum)}</div>
          </div>
        </div>
      </section>

      <Section title="Счета" items={[...accountItems, addCard("accounts")]} rowScroll />

      <Section title="Источники дохода" items={[...incomeItems, addCard("income")]} compactGrid />

      <Section title="Расходы" items={[...sizedExpenseItems, addCard("expense")]} compactGrid />

      <Section title="Цели" items={[...goalsItems, addCard("goals")]} />

      <Section title="Долги / Кредиты" items={[...debtsItems, addCard("debts")]} />
    </div>
  );
}

export default OverviewScreen;
