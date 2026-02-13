import { useAppStore } from "../store/useAppStore"

function formatMoney(amount: number) {
  const rub = amount / 100
  return rub.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽"
}

function HomeScreen() {
  const { transactions, accounts } = useAppStore()

  return (
    <div style={{ padding: 20 }}>
      <h2>Главная</h2>

      <div style={{ marginTop: 12 }}>
        <h3 style={{ margin: "12px 0" }}>Счета</h3>
        {accounts.map((a) => (
          <div key={a.id} style={{ marginBottom: 8 }}>
            {a.name}: <strong>{formatMoney(a.balance.amount)}</strong>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: "12px 0" }}>Операции</h3>

        {transactions.length === 0 ? (
          <p>Пока нет операций</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {transactions.map((t) => (
              <div
                key={t.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{t.type}</strong>
                  <strong>{formatMoney(t.amount.amount)}</strong>
                </div>
                <div style={{ opacity: 0.7, marginTop: 4 }}>{t.date}</div>
                {t.comment ? <div style={{ marginTop: 6 }}>{t.comment}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default HomeScreen
