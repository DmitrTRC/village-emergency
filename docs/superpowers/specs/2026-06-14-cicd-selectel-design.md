# CI/CD для village-emrg (ghcr + Selectel) — дизайн

Дата: 2026-06-14
Статус: согласован, готов к плану

## Цель

Подготовить прод-релиз: убрать сборку Docker-образов с боевой Selectel-VM,
перейти на неизменяемые образы из реестра. Релиз = git-тег `v*` =
версионированный образ в ghcr. Деплой и откат на VM — ручные и предсказуемые.

## Исходное состояние

- **CI** (`.github/workflows/ci.yml`): typecheck + тесты на push/PR в `main`.
  Без сборки образов, без деплоя.
- **Деплой**: вручную на Selectel-VM — `git pull && docker compose up -d --build`.
  Оба образа (`app`, `caddy`/web) собираются **на проде** из исходников:
  на VM тащится весь исходник, dev-зависимости и тулчейн; упавший `pnpm build`
  оставляет VM в полу-состоянии.
- **Selectel**: Cloud VM (Ubuntu), Managed Postgres, S3 Object Storage.
- **Версии**: проставлены `0.1.0` во всех пакетах, есть аннотированный тег `v0.1.0`.

## Принятые решения (из brainstorming)

| # | Развилка | Решение |
|---|----------|---------|
| 1 | Реестр образов | **ghcr.io** (бесплатно для репо, рядом с кодом) |
| 2 | Доставка на VM | **Вручную на VM** (`docker compose pull && up -d`) + кнопка `workflow_dispatch` |
| 3 | Триггер сборки | **git-тег `v*`** → образ `X.Y.Z` + `latest`; плюс `workflow_dispatch` |
| 4 | Гейт перед образом | **Перепрогон typecheck+тестов** в релизном workflow (E2E — отдельная задача) |

## Архитектура пайплайна

Два независимых workflow, разделённых по назначению:

### `ci.yml` (существующий, без изменений)
typecheck + тесты на push/PR в `main`. Поддерживает «зелёный main».

### `release.yml` (новый)
Триггеры:
- `push` тега `v*` (основной путь релиза);
- `workflow_dispatch` со вводом `ref` (ручной прогон / пересборка версии).

Jobs:
1. **`test`** — `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test`
   (server-тесты поднимают Postgres 16 через testcontainers, Docker есть на
   ubuntu-runner). Гейт: сломанный коммит образ не родит.
2. **`build-push`** (`needs: test`) — матрица из двух образов:
   - `docker/setup-buildx-action`, `docker/login-action` (registry `ghcr.io`,
     username `${{ github.actor }}`, password `${{ secrets.GITHUB_TOKEN }}`);
   - `docker/build-push-action` на каждый образ.

Права workflow: `permissions: { contents: read, packages: write }`. Встроенный
`GITHUB_TOKEN` достаточен для пуша в ghcr — **новых секретов в GitHub нет**.

## Образы

| Образ | Dockerfile | Build-args |
|-------|-----------|------------|
| `ghcr.io/dmitrtrc/village-emergency-app` | `Dockerfile` | нет |
| `ghcr.io/dmitrtrc/village-emergency-web` | `Dockerfile.web` | `VITE_*` (см. ниже) |

- Owner в пути ghcr — строчными: `dmitrtrc` (вычислять как
  `${{ github.repository_owner }}` с приведением к lower-case).
- Теги образа: `X.Y.Z` (из git-тега, ведущий `v` срезаем) **и** `latest`.
  Для `workflow_dispatch` (нет git-тега) — тег `latest` плюс короткий SHA.
- **Видимость пакетов: public.** VM тянет без `docker login`. Обоснование:
  рантайм-секреты в образ не вшиваются (только `.env` на VM), `app`-код MIT-open,
  PWA уже публичен через Pages. Альтернатива (не выбрана): private + `docker login
  ghcr` на VM с PAT — лишний секрет на сервере ради малого выигрыша.

## Build-time конфиг web-образа

`web`-образ запекает 3 `VITE_*` build-args. Все — **не секреты**:

| Переменная | Где берётся в CI | Природа |
|------------|------------------|---------|
| `VITE_API_BASE` | хардкод `/api` в workflow | константа |
| `VITE_VAPID_PUBLIC_KEY` | **GitHub repo Variable** | публичный VAPID-ключ |
| `VITE_TG_BOT` | **GitHub repo Variable** | имя бота (без `@`) |

Следствие: `web`-образ привязан к одному прод-окружению (его бот/VAPID-ключ).
Для единственной боевой инсталляции — приемлемо.

Рантайм-секреты остаются **только в `.env` на VM**, в CI не попадают:
`DATABASE_URL`, `JWT_SECRET`, `TG_BOT_TOKEN`, `BOOTSTRAP_COMMANDER_TG`,
`VAPID_PRIVATE`, `VAPID_SUBJECT`, `S3_*`, `PUBLIC_BASE_URL`, `PORT`.

## Инвентарь секретов и переменных

- **GitHub Secrets** (новые): нет. `GITHUB_TOKEN` встроен; деплой ручной — SSH-ключ
  не нужен.
- **GitHub repo Variables**: `VITE_VAPID_PUBLIC_KEY`, `VITE_TG_BOT`.
- **VM `.env`**: без изменений по составу; добавляется только `RELEASE_TAG`.

## Compose на VM

- В `docker-compose.yml` (прод) для обоих сервисов `build:` → `image:`:
  - `app`: `image: ghcr.io/dmitrtrc/village-emergency-app:${RELEASE_TAG}`
  - `caddy`/web: `image: ghcr.io/dmitrtrc/village-emergency-web:${RELEASE_TAG}`
- `RELEASE_TAG` — в `.env` (например `0.1.0`).
- Build-args web-образа (`VITE_*`) на проде больше не нужны: они уже запечены
  в образе на этапе CI. Соответствующий блок `args:` из прод-compose уходит.
- Локальная сборка (dev) выносится в отдельный `compose.build.yml`, чтобы
  прод-compose не тянул тулчейн. `scripts/demo.sh` не трогаем — у него свой путь
  поднятия (dev-сервер + PWA), от прод-compose не зависит.

## Деплой и откат (правки `docs/deploy.md`)

- **Первый деплой / обновление** (разделы 7/9): pull-модель вместо `up --build`:
  ```
  # задать RELEASE_TAG в .env
  docker compose pull && docker compose up -d
  ```
  `git pull` нужен только для свежих `docker-compose.yml` / `Caddyfile`, не для
  образов.
- **Откат**: `RELEASE_TAG` на предыдущую версию → `docker compose pull && up -d`.
  Без пересборки, детерминированно.
- **`workflow_dispatch`**: как из вкладки Actions пересобрать образ заданной
  версии/ref (например, прогнать релиз вручную, не двигая тег).

## Тестирование самого пайплайна

- Прогнать `release.yml` через `workflow_dispatch` на `main` → убедиться, что
  оба пакета появились в ghcr и видны как public.
- Тег-путь: поставить тестовый тег → workflow собирает и пушит `X.Y.Z` + `latest`.
- На VM (или локально) `docker compose pull` резолвит образы без `docker login`.
- Пост-деплой smoke (существующий): `curl -fsS https://DOMAIN/api/health` → `{"ok":true}`.

## Вне scope (отдельные задачи)

- E2E (Playwright) в CI/релизном гейте — тащит ловушку `reuseExistingServer`,
  делаем отдельно.
- Авто-деплой из GitHub Actions по SSH на VM — сознательно не делаем (катить молча
  на систему оповещения рискованно).
- Реальный прод-деплой (создание VM, секреты, DNS) — операторский шаг по runbook.
- Закрытие esbuild-high audit — требует мажорного апгрейда vite, отдельно.

## Файлы под изменение

- `+ .github/workflows/release.yml` (новый)
- `~ docker-compose.yml` (build → image, убрать `args:`, добавить `RELEASE_TAG`)
- `+ compose.build.yml` (новый, локальная сборка)
- `~ .env.example` (добавить `RELEASE_TAG`)
- `~ docs/deploy.md` (pull-модель, откат, workflow_dispatch)
- настройка вне репо: GitHub repo Variables `VITE_VAPID_PUBLIC_KEY`, `VITE_TG_BOT`;
  видимость ghcr-пакетов = public (после первого пуша).
