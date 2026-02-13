import React from 'react';
import './BottomNav.css';

export type NavItem = 'home' | 'overview' | 'add' | 'reports' | 'settings';

interface BottomNavProps {
  active: NavItem;
  onSelect: (item: NavItem) => void;
}

const navItems: { key: NavItem; label: string }[] = [
  { key: 'home', label: 'Главная' },
  { key: 'overview', label: 'Обзор' },
  { key: 'add', label: 'Добавить' },
  { key: 'reports', label: 'Отчёты' },
  { key: 'settings', label: 'Настройки' },
];

const BottomNav: React.FC<BottomNavProps> = ({ active, onSelect }) => {
  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <button
          key={item.key}
          className={
            'bottom-nav__item' + (active === item.key ? ' bottom-nav__item--active' : '')
          }
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
