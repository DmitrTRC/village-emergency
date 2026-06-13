# village-emrg — деплой в прод (Selectel)

Один домен, одна VM. Caddy отдаёт собранный PWA и проксирует `/api/*` на
Hono-сервер. Postgres — внешний Selectel Managed, медиа — Selectel S3.
Обновление — вручную через docker compose.

```
                 :443
  браузер ──► Caddy ──┬── /api/*  ─► app:8787 (Hono + Telegram-бот)
                      └── /*      ─► статика /srv (PWA, SPA-fallback)
  браузер ──► S3 (presigned PUT/GET, напрямую, мимо Caddy)
  app ──► Managed Postgres (DATABASE_URL)
```

## 1. VM

- Ubuntu 22.04+ на Selectel Cloud.
- Установить Docker Engine + compose-plugin (`docker compose version`).
- Открыть в фаерволе/Security Group порты `80` и `443` (входящие),
  исходящие — к Managed PG, к S3 и к `api.telegram.org`.

## 2. Managed Postgres

- Создать инстанс PostgreSQL 16, базу `village_emrg`, пользователя.
- Разрешить доступ с IP VM.
- Собрать `DATABASE_URL` (с TLS):
  `postgres://user:pass@host:5432/village_emrg?sslmode=require`
- Миграции применяются автоматически при старте контейнера `app`
  (`runMigrations` в `index.ts`) — отдельный шаг не нужен.

## 3. S3 (Selectel Object Storage)

- Создать бакет `village-emrg-media`, сгенерировать access/secret ключи.
- Эндпоинт/регион: `https://s3.ru-1.storage.selcloud.ru`, `ru-1`.
- **CORS бакета** (загрузка и просмотр фото идут из браузера напрямую в S3
  по presigned-ссылкам — без CORS браузер заблокирует PUT/GET):
  ```json
  [
    {
      "AllowedOrigins": ["https://village.example.ru"],
      "AllowedMethods": ["PUT", "GET"],
      "AllowedHeaders": ["content-type"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
  (origin заменить на боевой `DOMAIN`.)

## 4. VAPID (web-push)

```
npx web-push generate-vapid-keys
```
- `VAPID_PUBLIC`  → в `.env`, **и тем же значением** `VITE_VAPID_PUBLIC_KEY`.
- `VAPID_PRIVATE` → в `.env` (секрет).
- `VAPID_SUBJECT` → `mailto:admin@village.example.ru`.

> Публичный ключ инлайнится в бандл при сборке caddy-образа, приватный —
> только на сервере. Если ключи разойдутся, подписка на push не подпишется.

## 5. Telegram-бот

- Создать бота у @BotFather → `TG_BOT_TOKEN`.
- Имя бота (без `@`) → `VITE_TG_BOT`.
- Свой Telegram user id → `BOOTSTRAP_COMMANDER_TG` (узнать у @userinfobot).
- Бот работает long-polling внутри контейнера `app` — вебхуки/проксирование
  не нужны, достаточно исходящего доступа к Telegram.

## 6. DNS / TLS

- A-запись `village.example.ru` → внешний IP VM.
- Caddy сам получит и продлит сертификат Let's Encrypt по портам 80/443 —
  ручной настройки TLS не требуется.

## 7. Первый деплой

```
git clone <repo> village-emrg && cd village-emrg
cp .env.example .env
# заполнить .env реальными значениями (см. разделы выше)
docker compose up -d --build
```

Проверка:
```
docker compose ps                      # app healthy, caddy up
docker compose logs -f app             # миграции + "server on :8787"
curl -fsS https://village.example.ru/api/health   # {"ok":true}
```

## 8. Bootstrap командира

- С аккаунта `BOOTSTRAP_COMMANDER_TG` отправить боту `/start` — роль
  `commander` выдаётся автоматически. Дальше заявки остальных жителей
  командир одобряет из приложения.

## 9. Обновление

```
git pull
docker compose up -d --build
```
- Меняли `VITE_*`? Пересборка caddy-образа обязательна (значения вшиты в
  бандл) — `up --build` это делает.
- Только серверные изменения — пересоберётся `app`.

## 10. Диагностика

- `docker compose logs -f app` / `... caddy`.
- Healthcheck сервера: `https://DOMAIN/api/health`.
- Фото не грузится из браузера → проверить CORS бакета (раздел 3).
- Push не подписывается → `VAPID_PUBLIC` ≠ `VITE_VAPID_PUBLIC_KEY`.
- Логин из Telegram открывает не тот адрес → `PUBLIC_BASE_URL` ≠ `https://DOMAIN`.

## Переменные окружения

Все — через `.env` (плейсхолдеры в `.env.example`, секреты в репозиторий не
коммитим). Серверные: `DATABASE_URL`, `JWT_SECRET` (≥32 символов), `TG_BOT_TOKEN`,
`BOOTSTRAP_COMMANDER_TG`, `VAPID_PUBLIC/PRIVATE/SUBJECT`,
`S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY`, `PUBLIC_BASE_URL`, `PORT`.
Деплой/сборка: `DOMAIN`, `VITE_VAPID_PUBLIC_KEY`, `VITE_TG_BOT`.
