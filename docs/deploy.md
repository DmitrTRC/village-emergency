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
# заполнить .env реальными значениями (см. разделы выше),
# RELEASE_TAG — нужная версия образов из ghcr (например 0.1.0)
docker compose pull
docker compose up -d
```

Образы тянутся из ghcr (public, без `docker login`). Сборки на VM нет.

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

## 9. Обновление и откат

Обновление — сменить `RELEASE_TAG` в `.env` на новую версию и подтянуть образы:

```
# .env: RELEASE_TAG=0.2.0
docker compose pull
docker compose up -d
```

`git pull` нужен только когда поменялись `docker-compose.yml` или `Caddyfile`,
не ради самих образов — они приходят из ghcr.

Откат — поставить предыдущую версию и повторить pull:

```
# .env: RELEASE_TAG=0.1.0
docker compose pull
docker compose up -d
```

Детерминированно, без пересборки: каждая версия — это неизменяемый образ в ghcr.

## 10. Диагностика

- `docker compose logs -f app` / `... caddy`.
- Healthcheck сервера: `https://DOMAIN/api/health`.
- Фото не грузится из браузера → проверить CORS бакета (раздел 3).
- Push не подписывается → `VAPID_PUBLIC` ≠ `VITE_VAPID_PUBLIC_KEY`.
- Логин из Telegram открывает не тот адрес → `PUBLIC_BASE_URL` ≠ `https://DOMAIN`.

## 11. Сборка образов (CI)

Прод-образы собираются в GitHub Actions (`.github/workflows/release.yml`), не на VM:

- **Релиз по тегу**: `git tag -a vX.Y.Z -m ... && git push origin vX.Y.Z` →
  workflow прогоняет typecheck+тесты, собирает `app` и `web`, пушит в ghcr
  как `X.Y.Z` + `latest`.
- **Ручной прогон**: вкладка Actions → workflow «Release» → `Run workflow`,
  опционально указать `ref` (ветку/тег/SHA). Даёт теги `latest` + `sha-xxxxxxx`.

Разовая настройка репозитория (Settings):
- **Variables** (Settings → Secrets and variables → Actions → Variables) —
  несекретные, инлайнятся в web-бандл:
  - `VITE_VAPID_PUBLIC_KEY` — публичный VAPID-ключ (= `VAPID_PUBLIC`);
  - `VITE_TG_BOT` — имя бота без `@`.
- **Видимость пакетов**: после первого пуша открыть ghcr-пакеты
  `village-emergency-app` и `village-emergency-web` → Package settings →
  Change visibility → **Public** (чтобы VM тянула без `docker login`).

Секретов в GitHub для сборки не требуется — пуш идёт встроенным `GITHUB_TOKEN`.
Рантайм-секреты живут только в `.env` на VM и в CI не попадают.

## Переменные окружения

Все — через `.env` (плейсхолдеры в `.env.example`, секреты в репозиторий не
коммитим). Серверные: `DATABASE_URL`, `JWT_SECRET` (≥32 символов), `TG_BOT_TOKEN`,
`BOOTSTRAP_COMMANDER_TG`, `VAPID_PUBLIC/PRIVATE/SUBJECT`,
`S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY`, `PUBLIC_BASE_URL`, `PORT`.
Деплой/сборка: `DOMAIN`, `VITE_VAPID_PUBLIC_KEY`, `VITE_TG_BOT`.

## Восстановление из бэкапа

Дампы лежат в `s3://$S3_BUCKET/$BACKUP_S3_PREFIX/village-emrg-YYYYMMDD-HHMM.sql.gz`.

    mc alias set store "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
    mc ls store/$S3_BUCKET/$BACKUP_S3_PREFIX        # выбрать нужный дамп
    mc cp store/$S3_BUCKET/$BACKUP_S3_PREFIX/village-emrg-YYYYMMDD-HHMM.sql.gz .
    gunzip village-emrg-YYYYMMDD-HHMM.sql.gz
    psql "$DATABASE_URL" < village-emrg-YYYYMMDD-HHMM.sql

ВНИМАНИЕ: restore перетирает текущие данные. Делать только на пустую/проверочную БД
или после осознанного решения.

### Ручная проверка sidecar (smoke)

    docker compose up -d --build backup
    docker compose exec backup /usr/local/bin/backup.sh   # разовый прогон
    mc ls store/$S3_BUCKET/$BACKUP_S3_PREFIX               # дамп появился
