import { useAppStore } from "../store/useAppStore"

function HomeScreen() {
  const { accounts, transactions } = useAppStore()

  return (
    <div style={{ padding: 20 }}>
      <h2>Главная</h2>
      <p>Счетов: {accounts.length}</p>
      <p>Операций: {transactions.length}</p>
    </div>
  )
}

export default HomeScreen
