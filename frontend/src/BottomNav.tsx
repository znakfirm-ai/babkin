import React from "react";
import "./BottomNav.css";
import { AppIcon } from "./components/AppIcon";

export type NavItem = "home" | "overview" | "add" | "settings";

interface BottomNavProps {
  active: NavItem;
  onSelect: (item: NavItem) => void;
}

const navItems: { key: NavItem; label: string; icon: React.ReactNode; isAdd?: boolean }[] = [
  { key: "home", label: "Главная", icon: <AppIcon name="home" size={20} /> },
  { key: "overview", label: "Обзор", icon: <AppIcon name="grid" size={20} /> },
  { key: "add", label: "Добавить", icon: <AppIcon name="plus" size={22} />, isAdd: true },
  { key: "settings", label: "Настройки", icon: <AppIcon name="settings" size={20} /> },
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
