import React, { useEffect, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import OverviewScreen from "./screens/OverviewScreen";
import AddScreen from "./screens/AddScreen";
import ReportsScreen from "./screens/ReportsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import BottomNav from "./BottomNav";
import type { NavItem } from "./BottomNav";
import "./BottomNav.css";
import "./App.css";
import { initTelegram, isTelegramAvailable } from "./telegram";

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

  useEffect(() => {
    const available = initTelegram();
    setIsTelegram(available);
    if (!available) {
      // dev hint in browser
      // eslint-disable-next-line no-console
      console.log("Telegram WebApp не найден — браузерный режим");
    }
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
