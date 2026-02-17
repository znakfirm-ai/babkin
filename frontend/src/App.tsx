import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./store/useAppStore";
import { useAppStore } from "./store/useAppStore";
import HomeScreen from "./screens/HomeScreen";
import OverviewScreen from "./screens/OverviewScreen";
import AddScreen from "./screens/AddScreen";
import SettingsScreen from "./screens/SettingsScreen";
import BottomNav from "./BottomNav";
import type { NavItem } from "./BottomNav";
import "./BottomNav.css";
import "./App.css";

type ScreenKey = NavItem;

function App() {
  const telegramAvailable =
    typeof window !== "undefined" &&
    Boolean((window as typeof window & { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp);
  const [safeMode, setSafeMode] = useState<boolean>(telegramAvailable);
  const [normalLiteMode, setNormalLiteMode] = useState<boolean>(false);
  const [activeNav, setActiveNav] = useState<NavItem>("home");
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("home");
  const [isTelegram, setIsTelegram] = useState(telegramAvailable);
  const baseHeightRef = useRef<number | null>(null);
  const gestureBlockers = useRef<(() => void) | null>(null);
  const normalLiteWsAbort = useRef<AbortController | null>(null);
  const normalLiteAccAbort = useRef<AbortController | null>(null);
  const normalLiteCatAbort = useRef<AbortController | null>(null);
  const normalLiteTxAbort = useRef<AbortController | null>(null);
  const normalLiteAllAbort = useRef<AbortController | null>(null);
  const [uiOnlyMode, setUiOnlyMode] = useState<boolean>(false);
  const [workspacesDiag, setWorkspacesDiag] = useState<{
    status: "idle" | "loading" | "success" | "error";
    count: number | null;
    activeId: string | null;
    error: string | null;
  }>({ status: "idle", count: null, activeId: null, error: null });
  const [accountsDiag, setAccountsDiag] = useState<{
    status: "idle" | "loading" | "success" | "error";
    count: number | null;
    error: string | null;
  }>({ status: "idle", count: null, error: null });
  const [categoriesDiag, setCategoriesDiag] = useState<{
    status: "idle" | "loading" | "success" | "error";
    count: number | null;
    error: string | null;
  }>({ status: "idle", count: null, error: null });
  const [transactionsDiag, setTransactionsDiag] = useState<{
    status: "idle" | "loading" | "success" | "error";
    count: number | null;
    sample: string | null;
    error: string | null;
  }>({ status: "idle", count: null, sample: null, error: null });
  const [allDiag, setAllDiag] = useState<{
    status: "idle" | "running" | "success" | "error";
    step: number;
    workspaces: number | null;
    accounts: number | null;
    categories: number | null;
    transactions: number | null;
    error: string | null;
  }>({
    status: "idle",
    step: 0,
    workspaces: null,
    accounts: null,
    categories: null,
    transactions: null,
    error: null,
  });
  const { setAccounts, setCategories, setIncomeSources, setTransactions } = useAppStore();

  interface TelegramWebApp {
    ready(): void
    expand(): void
    setHeaderColor?: (color: string) => void
    setBackgroundColor?: (color: string) => void
  }

  useEffect(() => {
    if (safeMode) {
      const tg = (window as typeof window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
      setIsTelegram(Boolean(tg));
      return;
    }
    if (typeof window === "undefined") return;
    if (normalLiteMode || uiOnlyMode) {
      const tg = (window as typeof window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
      setIsTelegram(Boolean(tg));
      return () => {
        normalLiteWsAbort.current?.abort();
        normalLiteAccAbort.current?.abort();
        normalLiteCatAbort.current?.abort();
        normalLiteTxAbort.current?.abort();
        normalLiteAllAbort.current?.abort();
      };
    }
    if (baseHeightRef.current === null) {
      baseHeightRef.current = window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
    }

    const handleViewportChange = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const baseHeight = baseHeightRef.current ?? window.innerHeight;
      const visibleHeight = vv.height + (vv.offsetTop || 0);
      const keyboardLikelyClosed = visibleHeight >= baseHeight * 0.9;

      if (keyboardLikelyClosed) {
        const nextHeight = Math.round(window.innerHeight);
        baseHeightRef.current = nextHeight;
        document.documentElement.style.setProperty("--app-height", `${nextHeight}px`);
      }
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", handleViewportChange);
    vv?.addEventListener("scroll", handleViewportChange);
    handleViewportChange();

    const tg = (window as typeof window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    const available = Boolean(tg);
    setIsTelegram(available);

    if (tg) {
      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor?.("#f5f6f8");
        tg.setBackgroundColor?.("#f5f6f8");
      } catch {
        // ignore to avoid breaking runtime
      }
    } else {
      // dev hint in browser
      // eslint-disable-next-line no-console
      console.log("Telegram WebApp не найден — браузерный режим");
    }

    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener("gesturestart", handleGesture, { passive: false });
    document.addEventListener("gesturechange", handleGesture, { passive: false });
    document.addEventListener("gestureend", handleGesture, { passive: false });
    gestureBlockers.current = () => {
      document.removeEventListener("gesturestart", handleGesture);
      document.removeEventListener("gesturechange", handleGesture);
      document.removeEventListener("gestureend", handleGesture);
    };

    return () => {
      vv?.removeEventListener("resize", handleViewportChange);
      vv?.removeEventListener("scroll", handleViewportChange);
      gestureBlockers.current?.();
    };
  }, [safeMode, normalLiteMode, uiOnlyMode]);

  const renderScreen = () => {
    switch (activeScreen) {
      case "home":
        return <HomeScreen />;
      case "overview":
        return <OverviewScreen />;
      case "add":
        return <AddScreen />;
      case "settings":
        return <SettingsScreen />;
      default:
        return <HomeScreen />;
    }
  };

  const fetchWorkspacesDiag = async () => {
    if (normalLiteMode === false) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
    if (!token) {
      setWorkspacesDiag({ status: "error", count: null, activeId: null, error: "Нет токена" });
      return;
    }
    normalLiteWsAbort.current?.abort();
    const controller = new AbortController();
    normalLiteWsAbort.current = controller;
    setWorkspacesDiag({ status: "loading", count: null, activeId: null, error: null });
    try {
      const res = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка ${res.status} ${text}`);
      }
      const data: { activeWorkspace: { id: string } | null; workspaces: { id: string }[] } = await res.json();
      setWorkspacesDiag({
        status: "success",
        count: Array.isArray(data.workspaces) ? data.workspaces.length : 0,
        activeId: data.activeWorkspace?.id ?? null,
        error: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setWorkspacesDiag({
        status: "error",
        count: null,
        activeId: null,
        error: err instanceof Error ? err.message : "Не удалось загрузить workspaces",
      });
    }
  };

  const fetchAccountsDiag = async () => {
    if (normalLiteMode === false) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
    if (!token) {
      setAccountsDiag({ status: "error", count: null, error: "Нет токена" });
      return;
    }
    normalLiteAccAbort.current?.abort();
    const controller = new AbortController();
    normalLiteAccAbort.current = controller;
    setAccountsDiag({ status: "loading", count: null, error: null });
    try {
      const res = await fetch("https://babkin.onrender.com/api/v1/accounts", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка ${res.status} ${text}`);
      }
      const data: { accounts: unknown[] } = await res.json();
      setAccountsDiag({
        status: "success",
        count: Array.isArray(data.accounts) ? data.accounts.length : 0,
        error: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAccountsDiag({
        status: "error",
        count: null,
        error: err instanceof Error ? err.message : "Не удалось загрузить accounts",
      });
    }
  };

  const fetchCategoriesDiag = async () => {
    if (normalLiteMode === false) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
    if (!token) {
      setCategoriesDiag({ status: "error", count: null, error: "Нет токена" });
      return;
    }
    normalLiteCatAbort.current?.abort();
    const controller = new AbortController();
    normalLiteCatAbort.current = controller;
    setCategoriesDiag({ status: "loading", count: null, error: null });
    try {
      const res = await fetch("https://babkin.onrender.com/api/v1/categories", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка ${res.status} ${text}`);
      }
      const data: { categories: unknown[] } = await res.json();
      setCategoriesDiag({
        status: "success",
        count: Array.isArray(data.categories) ? data.categories.length : 0,
        error: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setCategoriesDiag({
        status: "error",
        count: null,
        error: err instanceof Error ? err.message : "Не удалось загрузить categories",
      });
    }
  };

  const fetchTransactionsDiag = async () => {
    if (normalLiteMode === false) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
    if (!token) {
      setTransactionsDiag({ status: "error", count: null, sample: null, error: "Нет токена" });
      return;
    }
    normalLiteTxAbort.current?.abort();
    const controller = new AbortController();
    normalLiteTxAbort.current = controller;
    setTransactionsDiag({ status: "loading", count: null, sample: null, error: null });
    try {
      const res = await fetch("https://babkin.onrender.com/api/v1/transactions", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка ${res.status} ${text}`);
      }
      const data: { transactions: { id?: string; kind?: string; amount?: unknown }[] } = await res.json();
      const list = Array.isArray(data.transactions) ? data.transactions : [];
      const first = list[0];
      const sample =
        first && typeof first === "object"
          ? `${first.id ?? "?"} / ${first.kind ?? "?"} / ${
              typeof first.amount === "string" || typeof first.amount === "number" ? first.amount : "?"
            }`
          : null;
      setTransactionsDiag({
        status: "success",
        count: list.length,
        sample,
        error: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setTransactionsDiag({
        status: "error",
        count: null,
        sample: null,
        error: err instanceof Error ? err.message : "Не удалось загрузить transactions",
      });
    }
  };

  const fetchAllSequentialDiag = async () => {
    if (normalLiteMode === false) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
    if (!token) {
      setAllDiag({
        status: "error",
        step: 0,
        workspaces: null,
        accounts: null,
        categories: null,
        transactions: null,
        error: "Нет токена",
      });
      return;
    }
    normalLiteAllAbort.current?.abort();
    const controller = new AbortController();
    normalLiteAllAbort.current = controller;
    setAllDiag({
      status: "running",
      step: 0,
      workspaces: null,
      accounts: null,
      categories: null,
      transactions: null,
      error: null,
    });
    try {
      const req = async (url: string) => {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Ошибка ${res.status} ${text}`);
        }
        return res.json();
      };

      const ws = await req("https://babkin.onrender.com/api/v1/workspaces");
      setAllDiag((prev) => ({
        ...prev,
        step: 1,
        workspaces: Array.isArray(ws.workspaces) ? ws.workspaces.length : 0,
      }));

      const acc = await req("https://babkin.onrender.com/api/v1/accounts");
      setAllDiag((prev) => ({
        ...prev,
        step: 2,
        accounts: Array.isArray(acc.accounts) ? acc.accounts.length : 0,
      }));

      const cats = await req("https://babkin.onrender.com/api/v1/categories");
      setAllDiag((prev) => ({
        ...prev,
        step: 3,
        categories: Array.isArray(cats.categories) ? cats.categories.length : 0,
      }));

      const txs = await req("https://babkin.onrender.com/api/v1/transactions");
      setAllDiag({
        status: "success",
        step: 4,
        workspaces: Array.isArray(ws.workspaces) ? ws.workspaces.length : 0,
        accounts: Array.isArray(acc.accounts) ? acc.accounts.length : 0,
        categories: Array.isArray(cats.categories) ? cats.categories.length : 0,
        transactions: Array.isArray(txs.transactions) ? txs.transactions.length : 0,
        error: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAllDiag((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Не удалось загрузить",
      }));
    }
  };

  if (safeMode) {
    return (
      <div className="app-shell">
        <div className="app-shell__inner" style={{ padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Safe mode</h1>
          <p style={{ fontSize: 14, color: "#4b5563", marginBottom: 16 }}>Диагностика iOS Telegram WebView</p>
          <button
            type="button"
            onClick={() => setSafeMode(false)}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Выключить safe mode
          </button>
          <button
            type="button"
            onClick={() => {
              setSafeMode(false);
              setNormalLiteMode(true);
            }}
            style={{
              marginTop: 12,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Перейти в normal lite
          </button>
          <button
            type="button"
            onClick={() => {
              setSafeMode(false);
              setUiOnlyMode(true);
              setNormalLiteMode(false);
            }}
            style={{
              marginTop: 12,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: "#fff",
              color: "#111827",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Перейти в UI only
          </button>
        </div>
      </div>
    );
  }

  if (normalLiteMode) {
    return (
      <div className="app-shell">
        <div className="app-shell__inner" style={{ padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Normal lite</h1>
          <p style={{ fontSize: 14, color: "#4b5563", marginBottom: 12 }}>init ok, data fetch disabled</p>
          <button
            type="button"
            onClick={fetchWorkspacesDiag}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            Fetch workspaces
          </button>
          <button
            type="button"
            onClick={fetchAccountsDiag}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            Fetch accounts
          </button>
          <button
            type="button"
            onClick={fetchCategoriesDiag}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            Fetch categories
          </button>
          <button
            type="button"
            onClick={fetchTransactionsDiag}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            Fetch transactions
          </button>
          <button
            type="button"
            onClick={fetchAllSequentialDiag}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #2563eb",
              background: "#fff",
              color: "#2563eb",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            Fetch ALL (sequential)
          </button>
          <div style={{ fontSize: 13, color: "#0f172a", marginBottom: 16, lineHeight: 1.5 }}>
            <div>Статус: {workspacesDiag.status}</div>
            {workspacesDiag.count !== null ? <div>Workspaces: {workspacesDiag.count}</div> : null}
            {workspacesDiag.activeId ? <div>Active workspace: {workspacesDiag.activeId}</div> : null}
            {workspacesDiag.error ? <div style={{ color: "#b91c1c" }}>Ошибка: {workspacesDiag.error}</div> : null}
            <div style={{ marginTop: 10 }}>Accounts: {accountsDiag.status}</div>
            {accountsDiag.count !== null ? <div>Accounts count: {accountsDiag.count}</div> : null}
            {accountsDiag.error ? <div style={{ color: "#b91c1c" }}>Ошибка: {accountsDiag.error}</div> : null}
            <div style={{ marginTop: 10 }}>Categories: {categoriesDiag.status}</div>
            {categoriesDiag.count !== null ? <div>Categories count: {categoriesDiag.count}</div> : null}
            {categoriesDiag.error ? <div style={{ color: "#b91c1c" }}>Ошибка: {categoriesDiag.error}</div> : null}
            <div style={{ marginTop: 10 }}>Transactions: {transactionsDiag.status}</div>
            {transactionsDiag.count !== null ? <div>Transactions count: {transactionsDiag.count}</div> : null}
            {transactionsDiag.sample ? <div>Sample: {transactionsDiag.sample}</div> : null}
            {transactionsDiag.error ? <div style={{ color: "#b91c1c" }}>Ошибка: {transactionsDiag.error}</div> : null}
            <div style={{ marginTop: 10 }}>All (seq): {allDiag.status} (step {allDiag.step}/4)</div>
            {allDiag.workspaces !== null ? <div>WS: {allDiag.workspaces}</div> : null}
            {allDiag.accounts !== null ? <div>ACC: {allDiag.accounts}</div> : null}
            {allDiag.categories !== null ? <div>CATS: {allDiag.categories}</div> : null}
            {allDiag.transactions !== null ? <div>TXS: {allDiag.transactions}</div> : null}
            {allDiag.error ? <div style={{ color: "#b91c1c" }}>Ошибка: {allDiag.error}</div> : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setNormalLiteMode(false);
              setSafeMode(true);
            }}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Вернуться в safe mode
          </button>
          <button
            type="button"
            onClick={() => {
              setNormalLiteMode(false);
              setUiOnlyMode(true);
            }}
            style={{
              marginTop: 12,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: "#fff",
              color: "#111827",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Перейти в UI only
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (uiOnlyMode) {
      setAccounts([]);
      setCategories([]);
      setIncomeSources([]);
      setTransactions([]);
    }
  }, [uiOnlyMode, setAccounts, setCategories, setIncomeSources, setTransactions]);

  if (uiOnlyMode) {
    return (
      <div className="app-shell">
        <div className="app-shell__inner">
          {renderScreen()}
          <BottomNav
            active={activeNav}
            onSelect={(key) => {
              setActiveNav(key);
              setActiveScreen(key);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {!isTelegram ? <div className="dev-banner">Telegram WebApp не найден — браузерный режим</div> : null}
      <div className="app-shell__inner">
        {renderScreen()}
        <BottomNav
          active={activeNav}
          onSelect={(key) => {
            setActiveNav(key);
            setActiveScreen(key);
          }}
        />
      </div>
    </div>
  );
}

export default App;
