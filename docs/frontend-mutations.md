## Single-Flight Guard (обязательное правило)

Все async-мутации (create/update/delete) во фронтенде ОБЯЗАНЫ оборачиваться в `useSingleFlight`.

Основные требования:
- API для мутаций не вызываются напрямую из onClick/onSubmit — только через `run` из `useSingleFlight`.
- Кнопки, запускающие мутации, обязательно получают `disabled={isRunning}` (или аналогичную блокировку) на время выполнения.
- Запрещено использовать таймеры, debounce, глобальные блокировки экрана или любые setTimeout для защиты от повторных кликов.
- Нельзя нарушать существующие последовательности refetch (например, для транзакций: `await refetchAccounts()` → `await refetchTransactions()` строго по порядку).
- При добавлении любой новой мутации это правило обязательно к применению.

Краткий пример:
```ts
import { useSingleFlight } from "../hooks/useSingleFlight"

const { run, isRunning } = useSingleFlight()

const onSave = () =>
  run(async () => {
    await createX(...)
    await refetchX()
  })

return (
  <button disabled={isRunning} onClick={onSave}>
    Сохранить
  </button>
)
```
