import React from "react";
import "./BottomNav.css";
import { AppIcon } from "./components/AppIcon";

export type NavItem = "home" | "overview" | "add" | "reports" | "settings";

interface BottomNavProps {
  active: NavItem;
  onSelect: (item: NavItem) => void;
}

const navItems: { key: NavItem; label: string; icon: React.ReactNode; isAdd?: boolean }[] = [
  { key: "home", label: "Главная", icon: <AppIcon name="home" size={18} /> },
  { key: "overview", label: "Обзор", icon: <AppIcon name="grid" size={18} /> },
  { key: "add", label: "Добавить", icon: <AppIcon name="plus" size={19} />, isAdd: true },
  { key: "reports", label: "Отчёты", icon: <AppIcon name="report" size={18} /> },
  { key: "settings", label: "Настройки", icon: <AppIcon name="settings" size={18} /> },
];

const BottomNav: React.FC<BottomNavProps> = ({ active, onSelect }) => {
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav__inner">
        {navItems.map((item) => {
          const isActive = active === item.key;
          const isAdd = item.key === "add";
          return (
            <button
              key={item.key}
              className={`bottom-nav__item ${isAdd ? "bottom-nav__item--add" : ""} ${
                isActive ? "bottom-nav__item--active" : ""
              }`}
              onClick={() => onSelect(item.key)}
              aria-label={item.label}
              type="button"
            >
              <span className="bottom-nav__icon" aria-hidden>
                {item.icon}
              </span>
              {!isAdd && <span className="bottom-nav__label">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
