import { useCallback, useMemo } from "react"
import { AppIcon } from "../components/AppIcon"
import type { IconName } from "../components/AppIcon"

function HomeScreen() {
  const stories = useMemo<{ id: string; title: string; icon: IconName; active?: boolean }[]>(
    () => [
      { id: "story-accounts", title: "Счета", icon: "wallet", active: true },
      { id: "story-income", title: "Доходы", icon: "arrowUp" },
      { id: "story-expense", title: "Расходы", icon: "arrowDown" },
      { id: "story-goals", title: "Цели", icon: "goal" },
      { id: "story-trip", title: "Путешествия", icon: "plane" },
      { id: "story-car", title: "Авто", icon: "car" },
      { id: "story-home", title: "Дом", icon: "home" },
    ],
    []
  )

  const banners = useMemo(
    () => [
      { id: "banner-1", title: "Ускорьте учёт", subtitle: "Подключите автоимпорт операций" },
      { id: "banner-2", title: "Настройте цели", subtitle: "Делайте откладывания по расписанию" },
      { id: "banner-3", title: "Контроль бюджета", subtitle: "Лимиты на категории расходов" },
      { id: "banner-4", title: "Команда", subtitle: "Пригласите семью вести бюджет" },
    ],
    []
  )

  const clickAddNav = useCallback(() => {
    const addBtn = document.querySelector(".bottom-nav__item--add") as HTMLButtonElement | null
    addBtn?.click()
  }, [])

  const quickActions = useMemo(
    () => [
      { id: "qa-accounts", title: "Все счета", icon: "wallet" as IconName, action: () => console.log("Все счета") },
      { id: "qa-income", title: "Доход", icon: "arrowUp" as IconName, action: () => clickAddNav() },
      { id: "qa-expense", title: "Расход", icon: "arrowDown" as IconName, action: () => clickAddNav() },
      { id: "qa-more", title: "Другое", icon: "more" as IconName, action: () => console.log("Другое") },
    ],
    [clickAddNav]
  )

  return (
    <div className="home-screen">
      <h2>Главная</h2>

      <section className="home-section">
        <div className="home-section__title">Сторис</div>
        <div className="home-stories">
          {stories.map((story) => (
            <div
              key={story.id}
              className={`home-story-card ${story.active ? "home-story-card--active" : ""}`}
              role="button"
              tabIndex={0}
            >
              <div className="home-story-card__icon-wrapper">
                <AppIcon name={story.icon} size={18} />
              </div>
              <div className="home-story-card__title">{story.title}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__title">Баннеры</div>
        <div className="home-banners">
          {banners.map((banner, idx) => (
            <div key={banner.id} className="home-banner">
              <div className="home-banner__badge">
                <AppIcon name={idx % 2 === 0 ? "chart" : "bag"} size={16} />
              </div>
              <div className="home-banner__text">
                <div className="home-banner__title">{banner.title}</div>
                <div className="home-banner__subtitle">{banner.subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__title">Быстрые действия</div>
        <div className="home-quick-actions">
          {quickActions.map((action) => (
            <button key={action.id} type="button" className="home-quick" onClick={action.action}>
              <div className="home-quick__icon">
                <AppIcon name={action.icon} size={18} />
              </div>
              <div className="home-quick__title">{action.title}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default HomeScreen
