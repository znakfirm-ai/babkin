import React, { useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import OverviewScreen from "./screens/OverviewScreen";
import AddScreen from "./screens/AddScreen";
import ReportsScreen from "./screens/ReportsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import BottomNav from "./BottomNav";
import type { NavItem } from "./BottomNav";
import "./BottomNav.css";

const SCREENS: Record<NavItem, React.ReactNode> = {
  home: <HomeScreen />,
  overview: <OverviewScreen />,
  add: <AddScreen />,
  reports: <ReportsScreen />,
  settings: <SettingsScreen />,
};

function App() {
  const [active, setActive] = useState<NavItem>("home");

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 56 }}>
      {SCREENS[active]}
      <BottomNav active={active} onSelect={setActive} />
    </div>
  );
}

export default App;
