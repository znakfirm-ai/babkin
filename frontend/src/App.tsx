import React, { Component, useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "./store/useAppStore";
type Workspace = { id: string; type: "personal" | "family"; name: string | null };
import { getAccounts } from "./api/accounts";
import { getCategories } from "./api/categories";
import { getIncomeSources } from "./api/incomeSources";
import { getTransactions } from "./api/transactions";
import HomeScreen from "./screens/HomeScreen";
import OverviewScreen from "./screens/OverviewScreen";
import AddScreen from "./screens/AddScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ReportsScreen from "./screens/ReportsScreen";
import SummaryReportScreen from "./screens/SummaryReportScreen";
import ExpensesByCategoryScreen from "./screens/ExpensesByCategoryScreen";
import BottomNav from "./BottomNav";
import type { NavItem } from "./BottomNav";
import "./BottomNav.css";
import "./App.css";

class AppErrorBoundary extends Component<
  {
    onSafeMode: () => void;
    children: React.ReactNode;
    currentMode: string;
    externalError: Error | null;
    onClearExternalError: () => void;
  },
  { hasError: boolean; error: Error | null }
> {
  constructor(
    props: {
      onSafeMode: () => void;
      children: React.ReactNode;
      currentMode: string;
      externalError: Error | null;
      onClearExternalError: () => void;
    }
  ) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("App crashed", error, info);
  }

  render() {
    const effectiveError = this.props.externalError ?? this.state.error;
    const hasError = this.props.externalError !== null || this.state.hasError;
    if (!hasError) return this.props.children;
    return (
      <div className="app-shell" style={{ padding: 16 }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>App error</h1>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Mode: {this.props.currentMode}</div>
        <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 8 }}>
          {effectiveError?.message ?? "Unknown error"}
        </div>
        <pre
          style={{
            background: "#f3f4f6",
            padding: 8,
            borderRadius: 8,
            maxHeight: 180,
            overflow: "auto",
            fontSize: 11,
            lineHeight: 1.3,
          }}
        >
          {effectiveError?.stack}
        </pre>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              this.props.onClearExternalError();
              this.setState({ hasError: false, error: null });
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={this.props.onSafeMode}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Go to SAFE_MODE
          </button>
        </div>
      </div>
    );
  }
}

type ScreenKey = NavItem | "report-summary" | "report-expenses-by-category";

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
  const uiOnlyWsAbort = useRef<AbortController | null>(null);
  const uiOnlyAccAbort = useRef<AbortController | null>(null);
  const uiOnlyCatAbort = useRef<AbortController | null>(null);
  const uiOnlyIncAbort = useRef<AbortController | null>(null);
  const uiOnlyTxAbort = useRef<AbortController | null>(null);
  const initDone = useRef<boolean>(false);
  const [uiOnlyMode, setUiOnlyMode] = useState<boolean>(false);
  const [appLoading, setAppLoading] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<Error | null>(null);
  const [appInitError, setAppInitError] = useState<string | null>(null);
  const [appWorkspaces, setAppWorkspaces] = useState<Workspace[]>([]);
  const [appActiveWorkspace, setAppActiveWorkspace] = useState<Workspace | null>(null);
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
  const [uiOnlyDiag, setUiOnlyDiag] = useState<{
    workspaces: { status: "idle" | "loading" | "success" | "error"; count: number | null; activeId: string | null; error: string | null };
    accounts: { status: "idle" | "loading" | "success" | "error"; count: number | null; error: string | null };
    categories: { status: "idle" | "loading" | "success" | "error"; count: number | null; error: string | null };
    income: { status: "idle" | "loading" | "success" | "error"; count: number | null; error: string | null };
    transactions: { status: "idle" | "loading" | "success" | "error"; count: number | null; sample: string | null; error: string | null };
  }>({
    workspaces: { status: "idle", count: null, activeId: null, error: null },
    accounts: { status: "idle", count: null, error: null },
    categories: { status: "idle", count: null, error: null },
    income: { status: "idle", count: null, error: null },
    transactions: { status: "idle", count: null, sample: null, error: null },
  });
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
  const { setAccounts, setCategories, setIncomeSources, setTransactions, accounts, categories, incomeSources, transactions } =
    useAppStore();

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
        uiOnlyWsAbort.current?.abort();
        uiOnlyAccAbort.current?.abort();
        uiOnlyCatAbort.current?.abort();
        uiOnlyIncAbort.current?.abort();
        uiOnlyTxAbort.current?.abort();
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

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error instanceof Error) setGlobalError(event.error);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof Error) setGlobalError(reason);
      else setGlobalError(new Error(typeof reason === "string" ? reason : "Unhandled rejection"));
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    if (safeMode || normalLiteMode || uiOnlyMode) return;
    if (initDone.current) return;
    if (typeof window === "undefined") return;
    const runInit = async () => {
      setAppLoading(true);
      setAppInitError(null);
      try {
        let token = localStorage.getItem("auth_access_token");
        if (!token) {
          const initData = window.Telegram?.WebApp?.initData ?? "";
          if (!initData) throw new Error("Нет Telegram initData");
          const res = await fetch("https://babkin.onrender.com/api/v1/auth/telegram", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Telegram-InitData": initData,
            },
            body: "{}",
          });
          if (!res.ok) throw new Error(`Auth error: ${res.status}`);
          const data: { accessToken?: string } = await res.json();
          if (!data.accessToken) throw new Error("Auth error");
          token = data.accessToken;
          localStorage.setItem("auth_access_token", token);
        }

        const wsRes = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!wsRes.ok) throw new Error(`Workspaces error: ${wsRes.status}`);
        const wsData: { activeWorkspace: Workspace | null; workspaces: Workspace[] } = await wsRes.json();
        setAppWorkspaces(wsData.workspaces ?? []);
        setAppActiveWorkspace(wsData.activeWorkspace ?? null);

        const accData = await getAccounts(token);
        setAccounts(
          accData.accounts.map((a) => ({
            id: a.id,
            name: a.name,
            balance: { amount: a.balance, currency: a.currency },
          }))
        );

        const catData = await getCategories(token);
        setCategories(catData.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon })));

        const incData = await getIncomeSources(token);
        setIncomeSources(incData.incomeSources.map((s) => ({ id: s.id, name: s.name })));

        const txData = await getTransactions(token);
        setTransactions(
          txData.transactions.map((t) => ({
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
        );

        initDone.current = true;
        setAppLoading(false);
      } catch (err) {
        setAppInitError(err instanceof Error ? err.message : "Init error");
        setAppLoading(false);
      }
    };
    void runInit();
  }, [safeMode, normalLiteMode, uiOnlyMode, setAccounts, setCategories, setIncomeSources, setTransactions]);

  const renderScreen = () => {
    switch (activeScreen) {
      case "home":
        return (
          <HomeScreen
            disableDataFetch={uiOnlyMode}
            initialWorkspaces={appWorkspaces}
            initialActiveWorkspace={appActiveWorkspace}
          />
        );
      case "overview":
        return <OverviewScreen />;
      case "add":
        return <AddScreen />;
      case "reports":
        return (
          <ReportsScreen
            onOpenSummary={() => setActiveScreen("report-summary")}
            onOpenExpensesByCategory={() => setActiveScreen("report-expenses-by-category")}
          />
        );
      case "settings":
        return <SettingsScreen />;
      case "report-summary":
        return <SummaryReportScreen onBack={() => setActiveScreen("reports")} />;
      case "report-expenses-by-category":
        return <ExpensesByCategoryScreen onBack={() => setActiveScreen("reports")} />;
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

  const currentMode = safeMode ? "SAFE_MODE" : normalLiteMode ? "NORMAL_LITE" : uiOnlyMode ? "UI_ONLY_MODE" : "NORMAL";

  const renderUiOnlyShell = () => (
    <div className="app-shell">
      {!isTelegram ? <div className="dev-banner">Telegram WebApp не найден — браузерный режим</div> : null}
      <div className="app-shell__inner">
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 11,
            color: "#6b7280",
            padding: "6px 4px",
            zIndex: 50,
          }}
        >
          UI_ONLY_MODE ACTIVE
        </div>
        <div
          style={{
            position: "fixed",
            top: 24,
            left: 8,
            right: 8,
            zIndex: 49,
            background: "rgba(255,255,255,0.9)",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            fontSize: 12,
            color: "#0f172a",
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 12 }}>DATA STEPPER (UI only)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              onClick={async () => {
                const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
                if (!token) {
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    workspaces: { status: "error", count: null, activeId: null, error: "Нет токена" },
                  }));
                  return;
                }
                uiOnlyWsAbort.current?.abort();
                const controller = new AbortController();
                uiOnlyWsAbort.current = controller;
                setUiOnlyDiag((prev) => ({
                  ...prev,
                  workspaces: { status: "loading", count: prev.workspaces.count, activeId: prev.workspaces.activeId, error: null },
                }));
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
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    workspaces: {
                      status: "success",
                      count: Array.isArray(data.workspaces) ? data.workspaces.length : 0,
                      activeId: data.activeWorkspace?.id ?? null,
                      error: null,
                    },
                  }));
                } catch (err) {
                  if (err instanceof DOMException && err.name === "AbortError") return;
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    workspaces: {
                      status: "error",
                      count: null,
                      activeId: null,
                      error: err instanceof Error ? err.message : "Не удалось загрузить workspaces",
                    },
                  }));
                }
              }}
              style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
            >
              Load workspaces
            </button>
            <button
              type="button"
              onClick={async () => {
                const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
                if (!token) {
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    accounts: { status: "error", count: null, error: "Нет токена" },
                  }));
                  return;
                }
                uiOnlyAccAbort.current?.abort();
                const controller = new AbortController();
                uiOnlyAccAbort.current = controller;
                setUiOnlyDiag((prev) => ({
                  ...prev,
                  accounts: { status: "loading", count: prev.accounts.count, error: null },
                }));
                try {
                  const data = await getAccounts(token);
                  setAccounts(
                    data.accounts.map((a) => ({
                      id: a.id,
                      name: a.name,
                      balance: { amount: a.balance, currency: a.currency },
                    }))
                  );
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    accounts: { status: "success", count: Array.isArray(data.accounts) ? data.accounts.length : 0, error: null },
                  }));
                } catch (err) {
                  if (err instanceof DOMException && err.name === "AbortError") return;
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    accounts: { status: "error", count: null, error: err instanceof Error ? err.message : "Не удалось загрузить accounts" },
                  }));
                }
              }}
              style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
            >
              Load accounts
            </button>
            <button
              type="button"
              onClick={async () => {
                const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
                if (!token) {
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    categories: { status: "error", count: null, error: "Нет токена" },
                  }));
                  return;
                }
                uiOnlyCatAbort.current?.abort();
                const controller = new AbortController();
                uiOnlyCatAbort.current = controller;
                setUiOnlyDiag((prev) => ({
                  ...prev,
                  categories: { status: "loading", count: prev.categories.count, error: null },
                }));
                try {
                  const data = await getCategories(token);
                  setCategories(data.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon })));
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    categories: { status: "success", count: Array.isArray(data.categories) ? data.categories.length : 0, error: null },
                  }));
                } catch (err) {
                  if (err instanceof DOMException && err.name === "AbortError") return;
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    categories: {
                      status: "error",
                      count: null,
                      error: err instanceof Error ? err.message : "Не удалось загрузить categories",
                    },
                  }));
                }
              }}
              style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
            >
              Load categories
            </button>
            <button
              type="button"
              onClick={async () => {
                const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
                if (!token) {
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    income: { status: "error", count: null, error: "Нет токена" },
                  }));
                  return;
                }
                uiOnlyIncAbort.current?.abort();
                const controller = new AbortController();
                uiOnlyIncAbort.current = controller;
                setUiOnlyDiag((prev) => ({
                  ...prev,
                  income: { status: "loading", count: prev.income.count, error: null },
                }));
                try {
                  const data = await getIncomeSources(token);
                  setIncomeSources(data.incomeSources.map((s) => ({ id: s.id, name: s.name })));
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    income: { status: "success", count: Array.isArray(data.incomeSources) ? data.incomeSources.length : 0, error: null },
                  }));
                } catch (err) {
                  if (err instanceof DOMException && err.name === "AbortError") return;
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    income: { status: "error", count: null, error: err instanceof Error ? err.message : "Не удалось загрузить income sources" },
                  }));
                }
              }}
              style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
            >
              Load income sources
            </button>
            <button
              type="button"
              onClick={async () => {
                const token = typeof window !== "undefined" ? localStorage.getItem("auth_access_token") : null;
                if (!token) {
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    transactions: { status: "error", count: null, sample: null, error: "Нет токена" },
                  }));
                  return;
                }
                uiOnlyTxAbort.current?.abort();
                const controller = new AbortController();
                uiOnlyTxAbort.current = controller;
                setUiOnlyDiag((prev) => ({
                  ...prev,
                  transactions: { status: "loading", count: prev.transactions.count, sample: prev.transactions.sample, error: null },
                }));
                try {
                  const data = await getTransactions(token);
                  setTransactions(
                    data.transactions.map((t) => ({
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
                  );
                  const list = data.transactions;
                  const first = list[0];
                  const sample =
                    first && typeof first === "object"
                      ? `${first.id ?? "?"} / ${first.kind ?? "?"} / ${
                          typeof first.amount === "string" || typeof first.amount === "number" ? first.amount : "?"
                        }`
                      : null;
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    transactions: {
                      status: "success",
                      count: Array.isArray(list) ? list.length : 0,
                      sample,
                      error: null,
                    },
                  }));
                } catch (err) {
                  if (err instanceof DOMException && err.name === "AbortError") return;
                  setUiOnlyDiag((prev) => ({
                    ...prev,
                    transactions: {
                      status: "error",
                      count: null,
                      sample: null,
                      error: err instanceof Error ? err.message : "Не удалось загрузить transactions",
                    },
                  }));
                }
              }}
              style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
            >
              Load transactions
            </button>
            <button
              type="button"
              onClick={() => {
                uiOnlyWsAbort.current?.abort();
                uiOnlyAccAbort.current?.abort();
                uiOnlyCatAbort.current?.abort();
                uiOnlyIncAbort.current?.abort();
                uiOnlyTxAbort.current?.abort();
                enterUiOnly();
              }}
              style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid #ef4444", background: "#fff5f5", color: "#b91c1c", cursor: "pointer" }}
            >
              Reset data
            </button>
          </div>
          <div style={{ display: "grid", gap: 4, fontSize: 11, color: "#0f172a" }}>
            <div>WS: {uiOnlyDiag.workspaces.status} ({uiOnlyDiag.workspaces.count ?? 0}) active={uiOnlyDiag.workspaces.activeId ?? "—"} {uiOnlyDiag.workspaces.error ? `err: ${uiOnlyDiag.workspaces.error}` : ""}</div>
            <div>ACC: {uiOnlyDiag.accounts.status} ({accounts.length}) {uiOnlyDiag.accounts.error ? `err: ${uiOnlyDiag.accounts.error}` : ""}</div>
            <div>CATS: {uiOnlyDiag.categories.status} ({categories.length}) {uiOnlyDiag.categories.error ? `err: ${uiOnlyDiag.categories.error}` : ""}</div>
            <div>INC: {uiOnlyDiag.income.status} ({incomeSources.length}) {uiOnlyDiag.income.error ? `err: ${uiOnlyDiag.income.error}` : ""}</div>
            <div>TXS: {uiOnlyDiag.transactions.status} ({transactions.length}) {uiOnlyDiag.transactions.sample ? `sample: ${uiOnlyDiag.transactions.sample}` : ""} {uiOnlyDiag.transactions.error ? `err: ${uiOnlyDiag.transactions.error}` : ""}</div>
          </div>
        </div>
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

  const renderSafe = () => (
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
          onClick={enterUiOnly}
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

  const renderNormalLite = () => (
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
          onClick={enterUiOnly}
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

  const enterUiOnly = useCallback(() => {
    setSafeMode(false);
    setNormalLiteMode(false);
    setUiOnlyMode(true);
    setAccounts([]);
    setCategories([]);
    setIncomeSources([]);
    setTransactions([]);
    setUiOnlyDiag({
      workspaces: { status: "idle", count: null, activeId: null, error: null },
      accounts: { status: "idle", count: null, error: null },
      categories: { status: "idle", count: null, error: null },
      income: { status: "idle", count: null, error: null },
      transactions: { status: "idle", count: null, sample: null, error: null },
    });
  }, [setAccounts, setCategories, setIncomeSources, setTransactions]);

  const initApp = useCallback(async () => {
    if (safeMode || normalLiteMode || uiOnlyMode) return;
    if (appLoading) return;
    setAppLoading(true);
    setAppInitError(null);
    try {
      let token = localStorage.getItem("auth_access_token");
      if (!token) {
        const initData = window.Telegram?.WebApp?.initData ?? "";
        if (!initData) throw new Error("Нет Telegram initData");
        const res = await fetch("https://babkin.onrender.com/api/v1/auth/telegram", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-InitData": initData,
          },
          body: "{}",
        });
        if (!res.ok) throw new Error(`Auth error: ${res.status}`);
        const data: { accessToken?: string } = await res.json();
        if (!data.accessToken) throw new Error("Auth error");
        token = data.accessToken;
        localStorage.setItem("auth_access_token", token);
      }

      const wsRes = await fetch("https://babkin.onrender.com/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!wsRes.ok) throw new Error(`Workspaces error: ${wsRes.status}`);
      const wsData: { activeWorkspace: Workspace | null; workspaces: Workspace[] } = await wsRes.json();
      setAppWorkspaces(wsData.workspaces ?? []);
      setAppActiveWorkspace(wsData.activeWorkspace ?? null);

      const accData = await getAccounts(token);
      setAccounts(
        accData.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: { amount: a.balance, currency: a.currency },
        }))
      );

      const catData = await getCategories(token);
      setCategories(catData.categories.map((c) => ({ id: c.id, name: c.name, type: c.kind, icon: c.icon })));

      const incData = await getIncomeSources(token);
      setIncomeSources(incData.incomeSources.map((s) => ({ id: s.id, name: s.name })));

      const txData = await getTransactions(token);
      setTransactions(
        txData.transactions.map((t) => ({
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
      );

      initDone.current = true;
      setAppLoading(false);
    } catch (err) {
      setAppInitError(err instanceof Error ? err.message : "Init error");
      setAppLoading(false);
    }
  }, [
    appLoading,
    safeMode,
    normalLiteMode,
    uiOnlyMode,
    setAccounts,
    setCategories,
    setIncomeSources,
    setTransactions,
  ]);

  useEffect(() => {
    if (!safeMode && !normalLiteMode && !uiOnlyMode && !initDone.current) {
      void initApp();
    }
  }, [initApp, safeMode, normalLiteMode, uiOnlyMode]);

  const appShell = safeMode
    ? renderSafe()
    : normalLiteMode
    ? renderNormalLite()
    : uiOnlyMode
    ? renderUiOnlyShell()
    : (
        appLoading ? (
          <div className="app-shell" style={{ padding: 24 }}>
            <h1 style={{ fontSize: 18 }}>Загрузка...</h1>
            {appInitError ? <div style={{ color: "#b91c1c", marginTop: 8 }}>{appInitError}</div> : null}
          </div>
        ) : appInitError ? (
          <div className="app-shell" style={{ padding: 24 }}>
            <h1 style={{ fontSize: 18, marginBottom: 8 }}>Init error</h1>
            <div style={{ color: "#b91c1c", marginBottom: 12 }}>{appInitError}</div>
            <button
              type="button"
              onClick={() => {
                initDone.current = false;
                setAppInitError(null);
                setAppLoading(false);
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Повторить
            </button>
          </div>
        ) : (
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
        )
      );

  return (
    <AppErrorBoundary
      currentMode={currentMode}
      externalError={globalError}
      onClearExternalError={() => setGlobalError(null)}
      onSafeMode={() => {
        setSafeMode(true);
        setNormalLiteMode(false);
        setUiOnlyMode(false);
        setGlobalError(null);
      }}
    >
      {appShell}
    </AppErrorBoundary>
  );
}

export default App;
