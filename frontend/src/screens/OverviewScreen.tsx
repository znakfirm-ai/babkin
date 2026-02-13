import React, { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import type { Transaction } from "../types/finance";
import "./OverviewScreen.css";

type CardItem = {
  id: string;
  title: string;
  amount: number;
  icon: string;
  color: string;
  isAdd?: boolean;
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

const Section: React.FC<{ title: string; items: CardItem[] }> = ({ title, items }) => {
  return (
    <section className="overview-section">
      <div className="overview-section__title">{title}</div>
      <div className="overview-section__list tile-grid">
        {items.map((item) => (
          <div
            key={item.id}
            className={`tile-card ${item.isAdd ? "tile-card--add" : ""}`}
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
  }));

  const expenseCategories = categories.filter((c) => c.type === "expense");

  const incomeItems: CardItem[] = incomeSources.map((src, idx) => ({
    id: src.id,
    title: src.name,
    amount: incomeBySource.get(src.id) ?? 0,
    icon: "⬇️",
    color: cardColors[(idx + 1) % cardColors.length],
  }));

  const uncategorizedIncome = incomeBySource.get("uncategorized");
  if (uncategorizedIncome) {
    incomeItems.push({
      id: "income-uncategorized",
      title: "Без категории",
      amount: uncategorizedIncome,
      icon: "⬇️",
      color: "#0f172a",
    });
  }

  const expenseItems: CardItem[] = expenseCategories
    .map((cat, idx) => ({
      id: cat.id,
      title: cat.name,
      amount: expenseByCategory.get(cat.id) ?? 0,
      icon: "⬇️",
      color: cardColors[(idx + 2) % cardColors.length],
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
    });
  }

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

      <Section title="Счета" items={[...accountItems, addCard("accounts")]} />

      <Section title="Источники дохода" items={[...incomeItems, addCard("income")]} />

      <Section title="Расходы" items={[...expenseItems, addCard("expense")]} />

      <Section title="Цели" items={[...goalsItems, addCard("goals")]} />

      <Section title="Долги / Кредиты" items={[...debtsItems, addCard("debts")]} />
    </div>
  );
}

export default OverviewScreen;
