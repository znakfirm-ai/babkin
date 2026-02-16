import { useEffect, useRef, useState } from "react";
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
  const normalLiteAbort = useRef<AbortController | null>(null);
  const [workspacesDiag, setWorkspacesDiag] = useState<{
    status: "idle" | "loading" | "success" | "error";
    count: number | null;
    activeId: string | null;
    error: string | null;
  }>({ status: "idle", count: null, activeId: null, error: null });

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
    if (normalLiteMode) {
      const tg = (window as typeof window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
      setIsTelegram(Boolean(tg));
      return () => {
        normalLiteAbort.current?.abort();
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
  }, [safeMode, normalLiteMode]);

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
    normalLiteAbort.current?.abort();
    const controller = new AbortController();
    normalLiteAbort.current = controller;
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
          <div style={{ fontSize: 13, color: "#0f172a", marginBottom: 16, lineHeight: 1.5 }}>
            <div>Статус: {workspacesDiag.status}</div>
            {workspacesDiag.count !== null ? <div>Workspaces: {workspacesDiag.count}</div> : null}
            {workspacesDiag.activeId ? <div>Active workspace: {workspacesDiag.activeId}</div> : null}
            {workspacesDiag.error ? <div style={{ color: "#b91c1c" }}>Ошибка: {workspacesDiag.error}</div> : null}
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
