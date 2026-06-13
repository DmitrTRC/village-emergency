# village-emrg Deploy / Prod (Plan 3/3) Implementation Plan

> **For agentic workers:** реализуется task-by-task, с подтверждением между задачами. Шаги — чекбоксы (`- [ ]`).

**Goal:** Завести прод village-emrg на одной Selectel-VM: Caddy отдаёт собранный PWA и проксирует API на Hono-сервер, Postgres — внешний Managed, медиа — Selectel S3. Деплой и обновление — вручную через docker compose. Серверный и фронтовый код НЕ меняем — только инфраструктура и runbook.

**Scope:** Только деплой-обвязка. Бизнес-логика, API и UI готовы (Plan 1, Plan 2). Никакого CI/CD — обновление вручную (git pull + docker compose up -d --build); CI можно добавить позже отдельным планом.

## Зафиксированные решения

- **Postgres:** внешний Selectel Managed Postgres. БД-контейнера в compose нет, только `DATABASE_URL`. Бэкапы — на стороне Selectel.
- **Роутинг:** один домен. Caddy отдаёт статику web (SPA-fallback на `index.html`), а `handle_path /api/*` срезает префикс и проксирует на `app:8787`. Сервер остаётся на корневых путях — **код сервера не трогаем**. Фронт собирается с `VITE_API_BASE=/api` (SSE `/events` тоже уходит под `/api`, покрывается тем же правилом).
- **Деплой:** вручную на VM — `git pull` + `docker compose up -d --build`.
- **Миграции:** выполняются на старте контейнера (`runMigrations` в `index.ts`) — отдельного шага нет.
- **Telegram-бот:** long-polling внутри `app`-процесса (`bot.start()`), вебхуки не нужны — только исходящий доступ к api.telegram.org.
- **CORS:** в прод не нужен (один origin). Серверный `buildApp` CORS не добавляет — оставляем как есть.

## Текущее состояние (от Plan 1)

- `Dockerfile` — multi-stage, собирает только shared+server, runtime `node dist/index.js`. Фронт не собирается.
- `docker-compose.yml` — сервисы `app` (expose 8787) + `caddy` (80/443, volume для сертификатов). БД-сервиса нет.
- `Caddyfile` — `{$DOMAIN} { reverse_proxy app:8787 }` (фронт не отдаётся).
- `.env.example` — серверные секреты + S3 + `PUBLIC_BASE_URL`. Нет `DOMAIN`, нет VITE_*-сборочных.

---

## Задачи

### Task 01 — Caddyfile: статика PWA + `/api`-прокси

- [ ] Переписать `Caddyfile`:
  ```
  {$DOMAIN} {
      encode zstd gzip
      handle_path /api/* {
          reverse_proxy app:8787 {
              flush_interval -1   # стриминг SSE без буферизации
          }
      }
      handle {
          root * /srv
          try_files {path} /index.html   # SPA-fallback
          file_server
      }
  }
  ```
- [ ] Проверить: `docker run --rm -v $PWD/Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile` (DOMAIN можно подставить заглушкой через env).

**Done:** Caddyfile валиден; SSE-локейшн со снятой буферизацией.

### Task 02 — Сборка web в образ Caddy

- [ ] Новый `Dockerfile.web` (multi-stage):
  ```
  FROM node:22-alpine AS build
  RUN corepack enable
  WORKDIR /app
  COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
  COPY packages/shared/package.json packages/shared/
  COPY packages/web/package.json packages/web/
  RUN pnpm install --frozen-lockfile
  COPY . .
  ARG VITE_API_BASE=/api
  ARG VITE_VAPID_PUBLIC_KEY
  ARG VITE_TG_BOT
  RUN pnpm --filter @village/shared build && pnpm --filter @village/web build

  FROM caddy:2-alpine
  COPY --from=build /app/packages/web/dist /srv
  COPY Caddyfile /etc/caddy/Caddyfile
  ```
- [ ] Все `VITE_*` — несекретные (публичный VAPID-ключ, имя бота, статичный `/api`) → безопасно передавать build-arg'ами.

**Done:** `docker build -f Dockerfile.web .` собирает образ с `/srv` и Caddyfile внутри.

### Task 03 — docker-compose + .env.example

- [ ] В `docker-compose.yml` сервис `caddy` перевести на сборку из `Dockerfile.web` с build args (`VITE_VAPID_PUBLIC_KEY`, `VITE_TG_BOT` из `.env`), убрать bind-mount Caddyfile (он теперь в образе), оставить тома сертификатов и порты 80/443, `DOMAIN` в environment, `depends_on: app`.
- [ ] `app`: добавить `healthcheck` на `/health`; `restart: unless-stopped` (уже есть).
- [ ] `.env.example` дополнить:
  - `DOMAIN=village.example.ru`
  - `PUBLIC_BASE_URL=https://village.example.ru` (origin фронта для магик-ссылки бота)
  - блок `# build-time (web, несекретные)`: `VITE_VAPID_PUBLIC_KEY=...` (= `VAPID_PUBLIC`), `VITE_TG_BOT=village_emrg_bot`
- [ ] Проверить, что `VITE_VAPID_PUBLIC_KEY` совпадает с серверным `VAPID_PUBLIC` (один ключ — иначе push не подпишется).

**Done:** `docker compose config` валиден; build args прокидываются.

### Task 04 — Локальная проверка сборки

- [ ] `docker compose build` — оба образа собираются (app + caddy-with-web).
- [ ] `docker compose config` — финальная конфигурация без ошибок.
- [ ] Зафиксировать, что полный up требует реальных секретов (Managed PG, S3, TG-токен) — это операторский шаг из runbook, не агентский.

**Done:** оба образа собираются локально; конфиг валиден.

### Task 05 — Runbook деплоя `docs/deploy.md`

- [ ] Написать пошаговый runbook:
  1. **VM Selectel:** Ubuntu, установить docker + compose-plugin, открыть 80/443.
  2. **Managed Postgres:** создать инстанс, БД `village_emrg`, получить `DATABASE_URL` (SSL-режим), вписать в `.env`.
  3. **S3 bucket:** создать `village-emrg-media`, ключи; **CORS-политика бакета**: разрешить `PUT`/`GET` с `https://$DOMAIN` (presigned-загрузка/чтение идут с браузера напрямую в S3, мимо Caddy).
  4. **VAPID:** сгенерировать пару (`npx web-push generate-vapid-keys`), `VAPID_PUBLIC` = `VITE_VAPID_PUBLIC_KEY`.
  5. **Telegram:** создать бота у @BotFather, `TG_BOT_TOKEN`, имя бота → `VITE_TG_BOT`; `BOOTSTRAP_COMMANDER_TG` = твой Telegram user id.
  6. **DNS:** A-запись `$DOMAIN` → IP VM (Caddy сам возьмёт Let's Encrypt по 80/443).
  7. **Деплой:** `git clone` → заполнить `.env` из `.env.example` → `docker compose up -d --build`. Миграции применятся автоматически на старте `app`.
  8. **Bootstrap командира:** `/start` боту с аккаунта `BOOTSTRAP_COMMANDER_TG` → роль commander выдаётся автоматически.
  9. **Обновление:** `git pull && docker compose up -d --build`.
  10. **Логи/диагностика:** `docker compose logs -f app`, healthcheck `/health`, проверка TLS.

**Done:** runbook покрывает путь от пустой VM до работающего прода; все секреты — через `.env` (плейсхолдеры в `.env.example`).

---

## Критерий завершения Plan 3

- `docker compose build` зелёный (app + caddy-with-web), `docker compose config` валиден, `caddy validate` проходит.
- `docs/deploy.md` — полный runbook, включая S3 CORS, DNS/TLS, bootstrap командира, обновление.
- Никаких изменений в коде `packages/server` и `packages/web` — только инфра-файлы и docs.
- Реальный прод-деплой (секреты, VM) выполняет оператор по runbook — вне зоны агента.
