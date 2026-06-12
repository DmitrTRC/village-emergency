# village-emrg Frontend / PWA (Plan 2/3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий offline-first PWA для village-emrg — лента инцидентов, создание (текст+фото+гео) с офлайн-очередью, live-обновления через SSE, web-push, действия командира, регистрация/логин через Telegram-бот. Всё под unit (Vitest+jsdom/RTL) и E2E (Playwright).

**Scope:** Только фронт. Deploy / CI-CD / staging — отдельный **Plan 3/3**. В проде статику отдаёт Caddy, проксируя `/api` и `/events` на Hono (решение зафиксировано, реализуется в Plan 3).

**Architecture:** Новый пакет `packages/web` в существующем pnpm-монорепо. React 18 + Vite + TypeScript, Workbox через `vite-plugin-pwa` (injectManifest — свой Service Worker). Доменные типы и DTO берём из готового `@village/shared` (Zod). Access-JWT в памяти, refresh-JWT в IndexedDB. Исходящие инциденты — очередь в IndexedDB + Background Sync. Live — `EventSource` на `/events`. Карта — MapLibre GL + OSM.

**Tech Stack:** TypeScript, React 18, Vite 5, vite-plugin-pwa (Workbox injectManifest), @village/shared (Zod), idb, maplibre-gl, Vitest + jsdom + @testing-library/react, fake-indexeddb, Playwright.

**Спек:** `docs/superpowers/specs/2026-06-11-village-emrg-design.md`
**Backend (Plan 1):** `docs/superpowers/plans/2026-06-11-village-emrg-backend.md` — API уже реализован, см. `packages/server/src/http/routes`.

---

## API-контракт (из реализованного backend)

Все типы — из `@village/shared`. Эндпоинты (под `authMiddleware`, кроме `/auth/*` и `/health`):

```
POST /auth/tg/exchange   { nonce }            → { accessToken, refreshToken }
POST /auth/refresh       { refreshToken }     → { accessToken, refreshToken }   # ротация, reuse-detect
GET  /incidents                               → Incident[]   (по видимости для роли)
GET  /incidents/:id                           → Incident     (403 если canView=false)
POST /incidents          CreateIncidentDTO    → { incident, uploads: PresignedPut[] }  (201; 429 при rate limit)
POST /incidents/:id/accept                    → Incident
POST /incidents/:id/close { reason }          → Incident
POST /incidents/:id/comments { text }         → Comment
PATCH /incidents/:id/media/:mediaId { uploaded } → Media       (author-only)
GET  /registrations/pending                   → Registration[]  (commander-only)
POST /registrations/:id/approve | /reject     → Registration    (commander-only)
GET  /events                                  → SSE stream of { type, id }
```

SSE payload минимален (`{type, id}`) — клиент тянет полный объект отдельным GET и обновляет кэш.

---

## File Structure

```
packages/web/
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  playwright.config.ts
  index.html
  .env.example                         # VITE_API_BASE, VITE_VAPID_PUBLIC_KEY, VITE_TG_BOT
  public/
    icons/                             # 192/512 + maskable
  src/
    main.tsx
    App.tsx
    routes.tsx
    config.ts                          # чтение import.meta.env
    api/
      client.ts                        # typed fetch + 401→refresh→retry
      endpoints.ts                     # обёртки над всеми эндпоинтами
    auth/
      session.ts                       # access in-memory, refresh в IDB, ротация
      AuthProvider.tsx                 # контекст + гейтинг роутов
    db/
      idb.ts                           # схема IndexedDB (outbox, incidents, tokens)
      outbox.ts                        # enqueue/dequeue исходящих
    media/
      compress.ts                      # обёртка над worker
      compress.worker.ts               # WebP 1920/q70 + EXIF strip
    geo/
      capture.ts                       # getCurrentPosition + fallback
    sse/
      useEventStream.ts                # EventSource + reconnect → invalidate cache
    push/
      subscribe.ts                     # permission + VAPID subscribe → server
    map/
      IncidentMap.tsx                  # MapLibre: pick + display
    sw/
      sw.ts                            # Workbox injectManifest: precache, runtime cache,
                                       # BackgroundSync (POST/PUT/PATCH), push, notificationclick
    features/
      feed/      FeedPage.tsx  IncidentCard.tsx
      incident/  IncidentDetail.tsx  Timeline.tsx  Comments.tsx  CommanderActions.tsx
      create/    CreateIncidentPage.tsx
      auth/      RegisterPage.tsx  LoginCallback.tsx
    components/                        # мелкие переиспользуемые (Badge, Spinner…)
  test/
    api/client.test.ts
    auth/session.test.ts
    db/outbox.test.ts
    geo/capture.test.ts
    sse/useEventStream.test.ts
    features/feed.test.tsx
    features/create.test.tsx
    features/commander.test.tsx
  e2e/
    offline-emergency.spec.ts
    moderation.spec.ts
    close-false.spec.ts

docs/manual-tests.md                   # чеклист iOS push / S3 / staging bot
```

---

## Tasks

### Task 01 — Scaffold packages/web
- [ ] Создать `packages/web` (Vite react-ts), подключить в `pnpm-workspace.yaml`, dep `@village/shared: workspace:*`.
- [ ] `tsconfig.json` extends `../../tsconfig.base.json`; alias `@village/shared` для dev (как в server vitest).
- [ ] `vite.config.ts` с `@vitejs/plugin-react` и `vite-plugin-pwa` (`strategies: injectManifest`, `srcDir: src/sw`, `filename: sw.ts`).
- [ ] `vitest.config.ts` — `environment: jsdom`, `setupFiles` (jest-dom, fake-indexeddb/auto), alias на shared/src.
- [ ] `.env.example` с плейсхолдерами; `config.ts` валидирует `import.meta.env` через Zod.
- [ ] Минимальный `App.tsx`/`main.tsx`, один smoke-тест рендера.
- **Готово:** `pnpm --filter @village/web typecheck` чист; `pnpm --filter @village/web test` зелёный (1 smoke); `pnpm --filter @village/web build` собирает dist.

### Task 02 — IndexedDB layer (TDD)
- [ ] `db/idb.ts`: схема через `idb` — stores `outbox` (key=incident uuid), `incidents` (кэш по id), `tokens` (refresh).
- [ ] Тест (fake-indexeddb): put/get/delete по каждому store, апгрейд схемы идемпотентен.
- [ ] Реализация → зелёный.
- **Готово:** тесты db зелёные, typecheck чист.

### Task 03 — Auth session (TDD)
- [ ] `auth/session.ts`: access-токен в модульной памяти (не в storage), refresh — в IDB `tokens`. API: `getAccess()`, `setTokens(pair)`, `clear()`, `loadRefresh()`.
- [ ] Тест: setTokens сохраняет refresh в IDB и access в памяти; clear чистит оба; loadRefresh переживает «перезапуск» (новый импорт-эмуляция).
- **Готово:** тесты session зелёные.

### Task 04 — API client с refresh-интерсептором (TDD)
- [ ] `api/client.ts`: `apiFetch(path, opts)` — добавляет `Authorization: Bearer <access>`, на `401` один раз вызывает `/auth/refresh` (через session refresh), ротирует пару, повторяет запрос; при повторном 401 — `clear()` + бросок `Unauthorized`.
- [ ] Базовый URL из `config`. Парсинг ответа по Zod-схеме из shared (generic helper).
- [ ] Тест (mock `fetch`): happy path; 401→refresh→retry success; refresh fail→clear; не-JSON ошибка → типизированный throw.
- **Готово:** тесты client зелёные, покрыт refresh-цикл.

### Task 05 — Endpoint-обёртки
- [ ] `api/endpoints.ts`: типобезопасные функции на каждый эндпоинт из контракта выше, request/response через shared DTO.
- [ ] Тест на 2-3 (incidents list parse, create возвращает uploads, exchange) с mock client.
- **Готово:** typecheck подтверждает совпадение типов с shared; тесты зелёные.

### Task 06 — Geo capture (TDD)
- [ ] `geo/capture.ts`: `captureGeo()` → `getCurrentPosition({enableHighAccuracy, timeout:5000})`, при ошибке/таймауте — last-known или `null`. Результат `{lat,lng,accuracy_m,captured_at}|null`.
- [ ] Тест (mock `navigator.geolocation`): success; timeout→null; denied→null.
- **Готово:** тесты geo зелёные.

### Task 07 — Photo compression worker
- [ ] `compress.worker.ts`: вход File → canvas resize 1920px по длинной стороне → `toBlob('image/webp', 0.7)`; EXIF не переносим (canvas сам стрипает). Лимит 5 фото, цель ≤1 МБ.
- [ ] `compress.ts`: обёртка `compress(file): Promise<Blob>` через worker (Comlink не нужен — postMessage).
- [ ] Тест: контракт обёртки с mock worker (canvas в jsdom не рендерит — отмечаем как manual-verify в docs/manual-tests.md).
- **Готово:** typecheck чист; обёртка покрыта; запись в manual-tests про визуальную проверку компрессии.

### Task 08 — Outbox + enqueue (TDD)
- [ ] `db/outbox.ts`: `enqueue(incident, mediaBlobs)` пишет инцидент (status `draft`/`pending`) и blob'ы в IDB; `list()`, `markDelivered(id)`, `remove(id)`.
- [ ] Регистрация Background Sync `tag=incident:<uuid>` (если поддерживается; иначе немедленная попытка отправки).
- [ ] Тест (fake-indexeddb): enqueue→list содержит запись; markDelivered меняет статус; remove чистит.
- **Готово:** тесты outbox зелёные.

### Task 09 — Service Worker (Workbox injectManifest)
- [ ] `sw/sw.ts`: precache манифест (`self.__WB_MANIFEST`); runtime caching — S3 GET (pre-signed) в CacheFirst с TTL, навигация в NetworkFirst.
- [ ] BackgroundSync-очередь для `POST /incidents`, media `PUT` в S3, `PATCH …/media/:id`; backoff 2/4/8/16/32s → 1/мин.
- [ ] `push` — показать нотификацию из payload; `notificationclick` — focus/откыть deep-link на инцидент.
- [ ] Юнит — на извлекаемую логику (формирование notification options из payload). SW целиком — под E2E (Task 18) + manual.
- **Готово:** build с PWA собирает sw; typecheck чист; юнит payload-логики зелёный.

### Task 10 — App shell, роутинг, AuthProvider
- [ ] `routes.tsx`: `/` (feed), `/i/:id` (detail), `/new` (create), `/register`, `/auth/callback`. Защита приватных роутов через `AuthProvider` (нет access+refresh → редирект на `/register`).
- [ ] `AuthProvider.tsx`: на старте `loadRefresh()`→если есть, тихий refresh→access; иначе анонимный.
- [ ] Тест: гейтинг (без токена → register; с токеном → feed).
- **Готово:** тест роутинга зелёный.

### Task 11 — Feed + IncidentCard (RTL)
- [ ] `FeedPage.tsx`: грузит `GET /incidents`, мёрджит с локальным outbox (pending-карточки со статусом «⏳ ожидает сети»), сортировка по времени.
- [ ] `IncidentCard.tsx`: бейджи level (emergency/offence/attention) и status (delivered/accepted/closed), индикатор visibility.
- [ ] Тест (RTL, mock endpoints): рендер списка; pending-карточка из outbox показывается; бейджи корректны.
- **Готово:** тест feed зелёный.

### Task 12 — Incident detail + Timeline (RTL)
- [ ] `IncidentDetail.tsx`: `GET /incidents/:id`, при 403 — экран «нет доступа».
- [ ] `Timeline.tsx`: события из `incident_events` (created/delivered/accepted/closed/commented).
- [ ] Медиа-галерея: pre-signed GET, кэш в SW.
- [ ] Тест: рендер таймлайна по mock-данным; 403 → экран отказа.
- **Готово:** тест detail зелёный.

### Task 13 — Comments (RTL)
- [ ] `Comments.tsx`: список + форма. Форма активна только в `accepted`; в `closed` — read-only «тред заморожен».
- [ ] Отправка `POST …/comments`, оптимистичное добавление.
- [ ] Тест: в accepted форма есть и шлёт; в closed формы нет.
- **Готово:** тест comments зелёный.

### Task 14 — Commander actions (RTL)
- [ ] `CommanderActions.tsx`: кнопки «Принять», «Закрыть (reason)», «Отклонить» — видны только при `role=commander`. Отклонить = close(false) + private (бэк делает переход).
- [ ] Тест: resident не видит кнопок; commander видит; close требует выбора reason ∈ {resolved,false,duplicate}.
- **Готово:** тест commander зелёный.

### Task 15 — Create incident (RTL)
- [ ] `CreateIncidentPage.tsx`: выбор level, текст, гео (`captureGeo` по кнопке), до 5 фото (`compress`), превью. UUIDv7 на клиенте. Submit → `enqueue` → попытка отправки/Background Sync.
- [ ] Валидация формы через shared Zod (пустой текст без медиа и гео → отказ).
- [ ] Тест: валидация отклоняет пустую форму; успешный submit кладёт в outbox.
- **Готово:** тест create зелёный.

### Task 16 — SSE client (TDD)
- [ ] `sse/useEventStream.ts`: `EventSource('/events')` с токеном (через query или header-proxy), парс `{type,id}` (Zod), на событие — рефетч объекта и обновление кэша/стейта; авто-reconnect с backoff.
- [ ] Тест (mock EventSource): валидное событие → вызывает refetch+update; битый payload игнорируется; reconnect после error.
- **Готово:** тесты sse зелёные.

### Task 17 — Web Push subscribe
- [ ] `push/subscribe.ts`: запрос permission (после логина, не на старте); `pushManager.subscribe` с `VITE_VAPID_PUBLIC_KEY` (base64url→Uint8Array); отправка subscription на сервер (эндпоинт обновления профиля/подписки — согласовать с backend; при отсутствии — добавить тонкий PATCH в server, ≤1 файл).
- [ ] Юнит: конвертация VAPID-ключа; формирование тела подписки. Реальный push — manual (iOS A2HS).
- **Готово:** юнит конвертации зелёный; запись в docs/manual-tests.md.

### Task 18 — MapLibre
- [ ] `map/IncidentMap.tsx`: режим pick (drag-маркер при создании) и display (точка инцидента). OSM tiles + attribution.
- [ ] Lazy-load (карта тяжёлая) — динамический import в detail/create.
- [ ] Проверка — визуальная (manual-tests), минимальный smoke на монтирование с mock GL.
- **Готово:** typecheck чист; компонент монтируется в тесте без падения.

### Task 19 — A2HS, manifest, иконки
- [ ] `manifest.webmanifest` (через vite-plugin-pwa): name, icons 192/512 + maskable, `display: standalone`, theme/background.
- [ ] Обработка `beforeinstallprompt` → кнопка «Добавить на экран» после логина; промпт push-разрешения.
- [ ] Готовые иконки в `public/icons` (плейсхолдеры допустимы, заменим перед prod).
- **Готово:** build выдаёт валидный manifest; Lighthouse PWA installable (manual).

### Task 20 — Playwright E2E + manual-tests.md
- [ ] `playwright.config.ts`: webServer на vite preview + (моки бэка или поднятый server из Plan 1 c testcontainers — выбрать; для E2E проще поднять реальный server+PG).
- [ ] `offline-emergency.spec.ts`: создать Emergency → `context.setOffline(true)` → submit → `setOffline(false)` → дождаться доставки → проверить у командира.
- [ ] `moderation.spec.ts`: командир принимает П/В → появляется у второго жителя.
- [ ] `close-false.spec.ts`: close(false) → инцидент исчезает из общей ленты.
- [ ] `docs/manual-tests.md`: чеклист iOS Web Push после A2HS, S3 (MinIO dev / Selectel staging), Telegram staging-bot, визуальная проверка компрессии фото и карты.
- **Готово:** E2E проходят локально (допускается первичная флакость — фиксим инцидентно); чеклист закоммичен.

---

## Test Strategy
- **Unit (Vitest + jsdom/RTL):** чистая логика (idb, session, api client refresh, outbox, geo, sse parse) — строгий TDD red→green. Компоненты — RTL на поведение, не на разметку.
- **E2E (Playwright):** три ключевых сценария из спека (offline-create, moderation, close-false).
- **Manual:** iOS push, реальный S3, staging-бот, фото-компрессия, карта — по `docs/manual-tests.md`.
- **Планка перед merge:** unit зелёные обязательно; E2E может моргать первое время.

## Out of scope (→ Plan 3 или roadmap)
- Deploy, Caddy static-serving, Dockerfile web-stage, GitHub Actions, staging — **Plan 3/3**.
- Голос/видео, многоязычность, mesh, замы командира, эскалация — roadmap.
