# village-emrg — design spec

Дата: 2026-06-11
Статус: одобрено для перехода к плану реализации
Автор: Дмитрий Морозов (brainstorming с Claude)

## 1. Цель и контекст

PWA для дачного посёлка (~150 домов) на трёх уровнях регистрации происшествий:

- **Emergency** — безотлагательная-критическая ситуация. **Не заменяет 112**; житель параллельно набирает экстренные службы сам. Роль приложения — тревожная кнопка для соседей и фиксированный лог факта.
- **Правонарушение (offence)** — что-то уже произошло, нужно разобрать на уровне ДНД.
- **Обратить внимание (attention)** — подозрительные машины, незнакомые люди и пр.

Хостинг: Selectel (VPS + Managed PostgreSQL + Object Storage S3).
Единственный командир ДНД в MVP — автор (Дмитрий). Никаких заместителей и эскалаций; YAGNI.

## 2. Ключевые продуктовые решения

| Вопрос                              | Решение                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Регистрация новых жителей           | Саморегистрация через Telegram-бот → модерация командиром                                                                              |
| Аутентификация                      | Telegram bot login (`/start` → код + one-time link)                                                                                    |
| Push на жителей                     | Командиру — все инциденты. Жителям — по умолчанию только Emergency, остальное опционально в настройках                                 |
| Видимость инцидента                 | Emergency — публичен сразу при `delivered`. П/В — приватен (автор+командир) до `accepted`, потом публичен                              |
| Жизненный цикл                      | `draft (client) → delivered → accepted → closed`. Близ — командиром, с reason ∈ {resolved, false, duplicate}                            |
| Комментарии                         | Открыты в `accepted`, заморожены при `closed`. Без вложенности (плоский тред)                                                          |
| «Цензура» фейков                    | Командир делает `delivered → closed(false)` с `visibility=private` — это явный, аудируемый переход, а не магия                          |
| Связь                               | Неравномерная (LTE/2G/нет). Offline-first обязателен                                                                                   |
| Командир-fallback                   | Параллельный канал в Telegram-бот (deep-link) для каждого инцидента, идущий рядом с web-push                                            |
| MVP scope                           | Все 3 уровня + текст + фото + гео + push + "принято" + закрытие + комментарии. Голос/видео — фаза 2                                    |
| Mesh между жителями                 | Не в MVP. Зарезервировано в roadmap; доменная модель (UUIDv7, event-журнал) уже совместима с peer-sync                                  |

## 3. Стек

| Слой        | Выбор                                          | Почему                                                                  |
| ----------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Фронт       | React + Vite + TypeScript + Workbox SW         | Стандарт PWA, контроль Service Worker для offline-очереди               |
| Бэк         | Node 22 + Hono + TypeScript                    | Один язык, shared Zod-схемы с фронтом, экосистема web-push живёт здесь  |
| Валидация   | Zod                                            | Источник правды и для DB-маппинга, и для API-валидации, и для форм      |
| ORM         | Drizzle ORM + drizzle-kit                      | Тонкий слой, миграции, без магии                                        |
| БД          | PostgreSQL 16 (Selectel Managed)               | `LISTEN/NOTIFY` снимает потребность в Redis                             |
| Хранилище   | Selectel Object Storage (S3-совместимый)       | Pre-signed PUT/GET, никакой проксации через бэк                         |
| Карта       | MapLibre GL + OSM tiles                        | Внутрь посёлка точности хватает, нагрузка ничтожная                      |
| Push        | Web Push (VAPID, `web-push` npm)               | Нативный браузерный канал                                                |
| Telegram    | grammy                                         | Тот же процесс, не отдельный сервис                                      |
| Auth        | JWT (access 1ч в памяти, refresh 90д в IDB)    | Standalone-PWA не имеет cookies-comfort, IDB корректнее                  |
| Деплой      | Docker Compose + Caddy на VPS                  | Один процесс, авто-TLS, минимум движущихся частей                        |

Альтернативы (Go + TS, Rust + TS) отклонены — для одного разработчика и 150 пользователей TS full-stack даёт лучшее velocity-to-risk.

## 4. Архитектура верхнего уровня

```
┌─────────────────────────────────────────┐
│ PWA (React + Vite + Workbox SW)         │
│  • IndexedDB-очередь исходящих инцидентов│
│  • Push receiver (VAPID)                │
│  • SSE для live-обновления ленты         │
└──────────┬──────────────────────────────┘
           │ HTTPS (REST + SSE)
           ▼
┌─────────────────────────────────────────┐
│ Hono API (Node 22, Docker, VPS)         │
│  • Auth (Telegram bot login)            │
│  • Incident CRUD + transitions          │
│  • Push dispatcher (web-push)           │
│  • SSE hub (Postgres LISTEN/NOTIFY)     │
│  • S3 pre-signed PUT для медиа          │
│  • Telegram bot (grammy) в том же proc  │
└──┬───────────────┬───────────────┬─────┘
   │               │               │
   ▼               ▼               ▼
PostgreSQL    Selectel S3      Telegram API
(managed)    (фото; голос/    (auth + fallback
              видео в фазе 2)  push командиру)
```

Один Node-процесс на одном VPS. Caddy — TLS-терминатор и reverse proxy. Postgres `LISTEN/NOTIFY` → SSE-хаб → подписанные клиенты. Никакого Redis, никакого WebSocket-сервера.

## 5. Доменная модель

```
houses                                   users
─────────                                ─────────
id PK                                    id PK
address (uniq)                           telegram_user_id (uniq)
                                         name
                                         phone (опц.)
                                         house_id FK→houses
                                         role: resident|commander
                                         push_subscription JSONB
                                         notify_prefs JSONB
                                         created_at

registration_requests                    incidents
─────────────────────                    ───────────────────────────────
id PK                                    id (UUIDv7, client-side)
telegram_user_id                         author_id FK→users
claimed_house_address                    level: emergency|offence|attention
phone                                    status: draft|delivered|accepted|closed
status: pending|approved|rejected        visibility: private|public
created_at, decided_at                   close_reason: resolved|false|
decided_by FK→users                        duplicate|null
                                         text
                                         geo (lat, lng, accuracy_m,
                                              captured_at) — опц.
                                         created_at_client
                                         delivered_at_server
                                         accepted_at, closed_at

incident_media                           incident_comments
─────────────                            ─────────────────
id PK                                    id PK
incident_id FK                           incident_id FK
kind: photo (MVP) | voice | video        author_id FK
s3_key, mime, bytes                      text
upload_status: pending|uploaded          created_at
created_at                               hidden_at (опц., модерация)

incident_events (append-only audit)
──────────────────────────────────
id PK
incident_id FK
actor_id FK→users
type: created|delivered|accepted|
      closed|commented|hidden|
      reopened
payload JSONB
at TIMESTAMPTZ
```

Решения, заслуживающие фиксации:

- **UUIDv7 на клиенте** — ID существует до доставки на сервер, серверный POST идемпотентен по UUID.
- **`incident_events` отдельной таблицей** — append-only журнал, источник для timeline в UI и будущих отчётов.
- **`visibility` хранится явно** — мутируется бизнес-логикой, индексируется для запросов ленты.
- **`receipts per resident` НЕ заводим** — для 150 пользователей это млн строк без реальной ценности.
- **PII-минимум**: телефон опционален, только адрес дома обязателен.

## 6. Жизненный цикл инцидента

```
                   ┌────────────┐
        offline    │   draft    │  только в IndexedDB у автора
        (опц.)     │ (client)   │  ID уже есть (UUIDv7)
                   └─────┬──────┘
                         │ SW Background Sync → POST /incidents
                         ▼
                   ┌────────────┐
                   │ delivered  │  доставлено на сервер
                   └─────┬──────┘
                         │
            ┌────────────┴────────────┐
            │                         │
      level=emergency           level ∈ {offence, attention}
      visibility=public         visibility=private
      → push командиру +        → push командиру только
        SSE всем жителям
            │                         │
            └────────────┬────────────┘
                         │ commander нажал «Принять»
                         ▼
                   ┌────────────┐
                   │  accepted  │  visibility=public для всех уровней
                   │            │  тред комментариев открыт
                   └─────┬──────┘
                         │ commander нажал «Закрыть»
                         ▼
                   ┌────────────┐
                   │   closed   │  reason ∈ {resolved, false, duplicate}
                   │            │  тред заморожен (read-only)
                   └────────────┘
```

- Два UI-статуса («доставлено на сервер», «принято командиром») = `delivered_at_server`, `accepted_at`.
- Командир вместо «Принять» может «Отклонить»: `delivered → closed(false)` + `visibility=private`. Это единственный механизм скрыть фейк, явный и аудируемый.
- Идемпотентность доставки: повторный POST того же UUID возвращает текущее состояние, не плодит дублей.

## 7. Offline-first и доставка

### Создание инцидента (клиент)

1. UUIDv7 генерится сразу, инцидент пишется в IndexedDB.
2. Карточка появляется в локальной ленте со статусом «⏳ ожидает сети».
3. Гео-координата снимается «как есть» (last-known + timeout 5 сек).
4. Фото компрессуется в WebP 1920px / qual 70 в Web Worker.
5. Регистрируется Background Sync `tag=incident:<uuid>`.

### Отправка (Service Worker)

```
Шаг 1. POST /incidents (text + geo + media manifest) — маленький JSON
       → сервер возвращает pre-signed S3 PUT-урлы для каждой media
       → инцидент уже delivered; виден в SSE (если public)
Шаг 2. Для каждой media: PUT в S3 напрямую (минуя бэк)
       → по завершении PATCH /incidents/:id/media/:id { uploaded: true }
Шаг 3. При сбое — Background Sync retry: 2s, 4s, 8s, 16s, 32s, далее раз в минуту
```

### Доставка изменений жителям

- **онлайн** — SSE-канал `/events`, NOTIFY с маленьким payload `{type, id}`, клиент тянет полный объект отдельным GET.
- **офлайн** — Web Push (VAPID), SW показывает нотификацию.
- **командир** — параллельный канал в Telegram-бот с deep-link, идёт **рядом** с web-push (не fallback по таймауту). Это страховка против iPhone-без-A2HS.

### Не в MVP

- per-resident read receipts;
- peer-to-peer mesh (зарезервировано в roadmap; UUIDv7+events совместимы);
- эскалация по времени.

## 8. Авторизация (Telegram bot)

### Первый вход

1. PWA → `t.me/<bot>?start=<nonce>`.
2. Бот: имя, телефон (кнопка «поделиться контактом»), адрес дома (inline keyboard).
3. `registration_request(status=pending)` + push командиру.
4. Командир одобряет в Commander-режиме.
5. Бот шлёт one-time login link → PWA меняет токен на refresh+access в IDB.
6. PWA предлагает A2HS и push-разрешение.

### Повторный вход (новое устройство)

`/start` → бот узнаёт `telegram_user_id` → выдача one-time link без модерации.

### Сессии

- access JWT — 1 час, в памяти (не в localStorage).
- refresh JWT — 90 дней, в IndexedDB.
- ротация refresh с reuse-detection: использование старого = invalidate всех сессий пользователя.

### Bootstrap командира

Env `BOOTSTRAP_COMMANDER_TG=<tg_id>` — при первой регистрации с этим `telegram_user_id` аккаунт получает `role=commander` автоматически. Никакого UI «назначить командиром» в MVP.

### Telegram-бот делает

1. Регистрацию.
2. Уведомление командира о новой заявке.
3. Параллельный (не fallback-по-таймауту) канал командиру: на каждый `delivered` бот шлёт сообщение с deep-link. Идёт рядом с web-push.
4. (фаза 2) Опциональный канал для жителей без A2HS на iPhone — сводка инцидентов в боте.

## 9. Медиа и геолокация

### Фото (MVP)

- Клиент: resize 1920px по длинной стороне, WebP qual 70, EXIF strip (GPS из EXIF **не** используем — берём свою гео).
- S3-ключ: `incidents/<yyyy>/<mm>/<incident-uuid>/<media-uuid>.webp`.
- Загрузка: pre-signed PUT в S3 напрямую.
- Лимиты: до 5 фото на инцидент, до 1 МБ каждое после компрессии.
- Доступ: бакет приватный, GET через pre-signed URL на 1 час, кэш в SW.

### Гео

- Разрешение запрашивается при первом создании инцидента, не на старте.
- `getCurrentPosition` с `enableHighAccuracy: true`, timeout 5 сек, fallback на last-known.
- Хранение: `(lat, lng, accuracy_m, captured_at)`, всё опционально.
- Карта: MapLibre GL + OSM tiles с attribution.

### Голос и видео (фаза 2)

- Схема `incident_media.kind` уже enum (`photo|voice|video`) — миграций не понадобится.
- Голос: MediaRecorder → opus/webm, 30 сек ≈ 500 КБ.
- Видео: MediaRecorder → vp9/webm, 720p, 30 сек, до 5 МБ.
- Транскод на сервере не делаем — браузеры воспроизводят нативно.

### Retention

- `incidents` и `incident_events` — навсегда (журнал).
- `incident_media` в S3 — 1 год, потом lifecycle delete. В UI пометка «медиа архивированы».

## 10. Безопасность и privacy

### Транспорт и секреты

- TLS Let's Encrypt через Caddy, HSTS.
- Секреты в `.env` на VPS (0600 root): `DATABASE_URL`, `S3_*`, `TG_BOT_TOKEN`, `VAPID_*`, `JWT_SECRET`, `BOOTSTRAP_COMMANDER_TG`.

### Контент

- Текст инцидентов и комментариев санитизируется на бэке (whitelist: ссылки, переносы; никакого raw HTML).
- EXIF стрипается на клиенте.
- S3 приватный, доступ только pre-signed.

### Анти-абуз

- Rate limit per user: 5 emergency/час, 20 incidents/сутки любых, 50 комментариев/сутки. Sliding window на `incident_events`, без Redis.
- Флаг `users.is_blocked` в схеме (UI — фаза 2).
- Командиру лучше получить лишний push, чем потерять — отзыв инцидента не «отменяет» уже улетевший push.

### Авторизация в коде

- Единственный модуль `policy.ts`: `canView(user, incident)`, `canComment`, `canAccept`, `canClose`, `canHideComment`. Юнит-тесты отдельно.

### Не в MVP

- 2FA — Telegram уже фактор владения аккаунтом.
- E2E-шифрование — оверкилл, командир должен видеть содержание.
- Цифровые подписи (TSP) — потом, для юр. силы.

### PII в репо

- Список домов и фамилий — **не** в репо. Миграции создают пустые таблицы. Seed-данные в `data/houses.private.csv` (в `.gitignore`), импорт `npm run seed:houses`.
- `.env.example` — только плейсхолдеры.

## 11. Тестирование

### Unit (Vitest)

- Zod-схемы (edge: пустой текст без медиа и гео — отказ).
- `policy.ts` — все (role × level × status × visibility) пары (~30 кейсов).
- Lifecycle: `transition(incident, action, actor)` — легальные и нелегальные переходы.

### Integration (Vitest + testcontainers PostgreSQL)

- Полный цикл инцидента через Hono-handlers in-process.
- Идемпотентность POST по UUIDv7.
- `LISTEN/NOTIFY` → SSE: создание + ожидание события у подписчика.
- Регистрация: telegram-webhook → registration_request → одобрение → выдача session.
- Telegram bot — моки на уровне grammy.

### E2E (Playwright)

- Главный сценарий: «житель создаёт Emergency offline» → `setOffline(true)` → отправка → `setOffline(false)` → ожидание дельты → проверка у командира.
- Модерация П/В: командир принимает → инцидент появляется у второго жителя.
- Close с reason=false → исчезновение из общей ленты.

### Ручное

- iOS Web Push после A2HS — на реальном iPhone, по чеклисту в `docs/manual-tests.md`.
- Selectel S3 — в тестах MinIO, в staging — настоящий.
- Telegram bot — staging bot перед prod.

### Планка

- Unit + integration зелёные — обязательно перед merge.
- E2E может моргать первое время, fixим инцидентно.

## 12. Деплой и операции

### Структура VPS

```
/opt/village-emrg/
  docker-compose.yml        # app + caddy
  .env                      # 0600 root
  data/                     # буфер если S3 недоступен
  backups/                  # дамп БД cron'ом + sync в S3
caddy volumes (data, certs)
```

### Состав

- `app` — Node 22 multi-stage, ~150 MB образ.
- `caddy` — auto Let's Encrypt.
- PostgreSQL — managed на Selectel, доступ по приватной сети.

### Миграции

`drizzle-kit migrate` на старте app-контейнера. Один процесс — нет race'ов.

### Бэкапы

- БД: Selectel managed snapshots каждые 24 ч, retention 7 дней.
- + `pg_dump` cron 1×/сутки → S3 retention 30 дней.
- S3: реплика в AZ + версионирование.

### Мониторинг минимум

- JSON-логи в stdout, Caddy access-логи в файл.
- Cron 5 мин на ноуте: ping Telegram-бота health-check; при простое 10 мин — Telegram-сообщение мне со second-instance.
- Никакого Grafana/Prometheus в MVP.

### CI/CD

- GitHub Actions: build образа на тег `v*`, push в Selectel Container Registry.
- На VPS: `docker compose pull && up -d` руками по тегу. Без автодеплоя из main.

## 13. Roadmap (после MVP)

| # | Фича                                       | Готовность модели         |
| - | ------------------------------------------ | ------------------------- |
| 1 | Голос/видео в incident_media               | enum готов, схема готова   |
| 2 | Замы командира (роль `commander` множ.)    | роль уже не уникальная     |
| 3 | Комментарии с медиа                        | таблицы расширятся          |
| 4 | Mesh между жителями (peer-sync, Yjs)       | UUIDv7 + events совместимы |
| 5 | Экспорт инцидентов в PDF/CSV               | events — источник           |
| 6 | Многоязычность                             | i18n с самого начала рекомендуется |
| 7 | Push-эскалация по таймауту                 | новая логика                |
| 8 | Цифровые подписи (TSP)                     | новые таблицы               |

## 14. Compliance / sensitivity (фиксация для CLAUDE.md)

- **PII**: телефон (опц.), Telegram ID, адрес дома, ФИО. Хранится в managed PG в РФ-юрисдикции (Selectel).
- **Лицензия**: TBD (предположительно проприетарная для использования внутри посёлка; обсудить отдельно).
- **Регуляторика**: РФ ФЗ-152 (персональные данные). Регистрация оператора ПД может потребоваться — проверить отдельно.
- **Деплой-окружения**: dev (localhost+MinIO), staging (отдельный VPS на Selectel), prod (Selectel).

## 15. Out of scope для MVP (явный список)

- голос и видео;
- многоязычность (только RU);
- mesh / peer-sync;
- замы командира и эскалация;
- цифровые подписи;
- per-resident read receipts;
- экспорт отчётов;
- analytics/Prometheus;
- web-push fallback в Telegram для жителей (только для командира в MVP).
