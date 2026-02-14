# Babkin Backend (skeleton)

### Что это
Минимальный Fastify + Prisma сервер для Mini App / Bot. Пока без бота и без связки с фронтом.

### Запуск локально
1. `cd backend`
2. `npm i`
3. Создай `.env` на основе `.env.example`
4. `npx prisma migrate dev`
5. `npm run dev`

### Проверка
- Здоровье: `curl http://localhost:3001/health`
- Авторизованный `/api/v1/me`:
```
curl -H "X-Telegram-InitData=REPLACE_INITDATA" http://localhost:3001/api/v1/me
```
`REPLACE_INITDATA` — initData из Telegram WebApp (как есть).

### Бот
Пока не реализован. План: использовать тот же Telegram auth и общую БД.
