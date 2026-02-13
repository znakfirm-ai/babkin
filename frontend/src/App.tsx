import React, { useEffect, useRef, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import OverviewScreen from "./screens/OverviewScreen";
import AddScreen from "./screens/AddScreen";
import ReportsScreen from "./screens/ReportsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import BottomNav from "./BottomNav";
import type { NavItem } from "./BottomNav";
import "./BottomNav.css";
import "./App.css";

const SCREENS: Record<NavItem, React.ReactNode> = {
  home: <HomeScreen />,
  overview: <OverviewScreen />,
  add: <AddScreen />,
  reports: <ReportsScreen />,
  settings: <SettingsScreen />,
};

function App() {
  const [active, setActive] = useState<NavItem>("home");
  const [isTelegram, setIsTelegram] = useState(false);
  const baseHeightRef = useRef<number | null>(null);
  const gestureBlockers = useRef<(() => void) | null>(null);

  interface TelegramWebApp {
    ready(): void
    expand(): void
    setHeaderColor?: (color: string) => void
    setBackgroundColor?: (color: string) => void
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
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
  }, []);

  return (
    <div className="app-shell">
      {!isTelegram ? <div className="dev-banner">Telegram WebApp не найден — браузерный режим</div> : null}
      <div className="app-shell__inner">
        {SCREENS[active]}
        <BottomNav active={active} onSelect={setActive} />
      </div>
    </div>
  );
}

export default App;
