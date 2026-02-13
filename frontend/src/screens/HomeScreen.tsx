import { useCallback, useMemo } from "react"
import { AppIcon } from "../components/AppIcon"
import type { IconName } from "../components/AppIcon"

function HomeScreen() {
  const stories = useMemo<
    { id: string; title: string; icon?: IconName; image: string; active?: boolean }[]
  >(
    () => [
      {
        id: "story-1",
        title: "Инвест книга",
        image: "https://cdn.litres.ru/pub/c/cover_415/69529921.jpg",
        active: true,
      },
      {
        id: "story-2",
        title: "Налоговый вычет",
        image: "https://fincult.info/upload/iblock/663/975lcctfyqxjbgdko6rka3u14g0ges3u/iis_fc_2812_pr.jpg",
      },
      {
        id: "story-3",
        title: "Fintech гайд",
        image: "https://static.tildacdn.com/tild3732-6463-4163-b761-666163393264/_FINTECH.png",
      },
      {
        id: "story-4",
        title: "Кэшбэк карта",
        image: "https://allsoft.by/upload/special_offer_pictograms/da9/zdpket1fl0w6ft3maffg46tb1z8vyl2z.png",
      },
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
            <div key={story.id} className={`home-story-wrap ${story.active ? "home-story-wrap--unread" : ""}`}>
              <div className="home-story" role="button" tabIndex={0}>
                <img src={story.image} alt={story.title} className="home-story__img" />
                <div className="home-story__label" title={story.title}>
                  {story.title}
                </div>
              </div>
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
