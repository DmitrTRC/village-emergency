# CI/CD (ghcr + Selectel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести прод-релиз village-emrg с «сборки на боевой VM» на неизменяемые образы из ghcr: git-тег `v*` собирает версионированные образы в CI, на Selectel-VM их тянут вручную, откат — сменой `RELEASE_TAG`.

**Architecture:** Новый workflow `release.yml` (триггер: тег `v*` или `workflow_dispatch`) прогоняет typecheck+тесты, затем матрицей собирает два образа (`app`, `web`) и пушит в ghcr под встроенным `GITHUB_TOKEN`. Прод-`docker-compose.yml` переходит с `build:` на `image:` с пином `RELEASE_TAG`; локальная сборка выносится в `compose.build.yml`. Рантайм-секреты остаются в `.env` на VM, в CI не попадают.

**Tech Stack:** GitHub Actions, `docker/metadata-action` + `docker/build-push-action`, ghcr.io, Docker Compose, pnpm-монорепо (Node 22).

**Спека:** `docs/superpowers/specs/2026-06-14-cicd-selectel-design.md`

---

## Файловая структура

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `.github/workflows/release.yml` | создать | релизный пайплайн: гейт-тесты + сборка/пуш двух образов в ghcr |
| `docker-compose.yml` | изменить | прод: `build:` → `image:` с `RELEASE_TAG`, убрать `args:` web |
| `compose.build.yml` | создать | оверлей для локальной сборки прод-образов |
| `.env.example` | изменить | добавить `RELEASE_TAG` |
| `docs/deploy.md` | изменить | pull-модель деплоя, откат, `workflow_dispatch`, настройка ghcr/Variables |

Вне репо (операторские шаги, описаны в Task 6): GitHub repo Variables
`VITE_VAPID_PUBLIC_KEY` и `VITE_TG_BOT`; видимость ghcr-пакетов = public.

---

## Task 1: Релизный workflow `release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Написать workflow целиком**

Создать `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      ref:
        description: "Git ref to build (branch, tag или SHA)"
        required: false
        default: ""

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

jobs:
  test:
    name: typecheck + tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.ref || github.ref }}

      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test

  build-push:
    name: build & push (${{ matrix.image }})
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      matrix:
        include:
          - image: app
            dockerfile: Dockerfile
          - image: web
            dockerfile: Dockerfile.web
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.ref || github.ref }}

      - name: Lowercase owner
        id: owner
        run: echo "owner=${GITHUB_REPOSITORY_OWNER,,}" >> "$GITHUB_OUTPUT"

      - name: Image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ steps.owner.outputs.owner }}/village-emergency-${{ matrix.image }}
          tags: |
            type=semver,pattern={{version}}
            type=raw,value=latest
            type=sha,enable=${{ github.event_name == 'workflow_dispatch' }}

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            VITE_API_BASE=/api
            VITE_VAPID_PUBLIC_KEY=${{ vars.VITE_VAPID_PUBLIC_KEY }}
            VITE_TG_BOT=${{ vars.VITE_TG_BOT }}
```

Примечания (не вписывать в файл, для исполнителя):
- `build-args` передаются обоим образам; `Dockerfile` (app) их не объявляет —
  Docker выдаст безобидный warning «unused build arg», сборка не падает. Это
  сознательный размен на простоту против `if`-ветвления build-args по матрице.
- Теги на выходе: тег `v0.1.0` → образы `0.1.0` + `latest`; `workflow_dispatch`
  (semver не матчится) → `latest` + `sha-xxxxxxx`.
- Пуш в ghcr — встроенным `GITHUB_TOKEN` (`packages: write`), PAT не нужен.

- [ ] **Step 2: Проверить, что YAML валиден**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"
```
Expected: `ok` (без traceback).

Бонус, если установлен `actionlint`:
```bash
command -v actionlint >/dev/null && actionlint .github/workflows/release.yml || echo "actionlint not installed — skip"
```
Expected: пусто/`skip` (никаких ошибок).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: релизный workflow — сборка app/web и пуш в ghcr по тегу v*"
```

---

## Task 2: Прод-`docker-compose.yml` → образы из ghcr

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Заменить `build:` на `image:` у сервиса `app`**

В `docker-compose.yml` заменить строку `    build: .` на:

```yaml
    image: ghcr.io/dmitrtrc/village-emergency-app:${RELEASE_TAG}
```

(остальные поля `app` — `env_file`, `restart`, `expose`, `healthcheck` — не трогать)

- [ ] **Step 2: Заменить `build:`-блок у сервиса `caddy` на `image:`**

Удалить весь блок:

```yaml
    build:
      context: .
      dockerfile: Dockerfile.web
      args:
        VITE_API_BASE: /api
        VITE_VAPID_PUBLIC_KEY: ${VITE_VAPID_PUBLIC_KEY}
        VITE_TG_BOT: ${VITE_TG_BOT}
```

и поставить на его место:

```yaml
    image: ghcr.io/dmitrtrc/village-emergency-web:${RELEASE_TAG}
```

(поля `restart`, `ports`, `environment`, `volumes`, `depends_on` — не трогать)

- [ ] **Step 3: Проверить, что compose парсится с пином версии**

Run:
```bash
RELEASE_TAG=0.1.0 docker compose -f docker-compose.yml config >/dev/null && echo ok
```
Expected: `ok`. В выводе config `image:` обоих сервисов — `...:0.1.0`, блоков
`build` нет.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "build: прод-compose тянет образы из ghcr по RELEASE_TAG вместо сборки на VM"
```

---

## Task 3: Оверлей локальной сборки `compose.build.yml`

**Files:**
- Create: `compose.build.yml`

- [ ] **Step 1: Создать оверлей со сборкой обоих образов**

Создать `compose.build.yml`:

```yaml
# Локальная сборка прод-образов. Использовать поверх docker-compose.yml:
#   docker compose -f docker-compose.yml -f compose.build.yml up --build
# image: из базового файла станет тегом локальной сборки; VITE_* берутся из .env.
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
  caddy:
    build:
      context: .
      dockerfile: Dockerfile.web
      args:
        VITE_API_BASE: /api
        VITE_VAPID_PUBLIC_KEY: ${VITE_VAPID_PUBLIC_KEY}
        VITE_TG_BOT: ${VITE_TG_BOT}
```

- [ ] **Step 2: Проверить, что слияние двух файлов валидно**

Run:
```bash
RELEASE_TAG=dev docker compose -f docker-compose.yml -f compose.build.yml config >/dev/null && echo ok
```
Expected: `ok`. В выводе у сервисов одновременно есть `image:` (`...:dev`) и
`build:` — compose соберёт и затегает локально.

- [ ] **Step 3: Commit**

```bash
git add compose.build.yml
git commit -m "build: compose.build.yml — оверлей локальной сборки прод-образов"
```

---

## Task 4: `RELEASE_TAG` в `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Добавить `RELEASE_TAG` в секцию деплоя**

В `.env.example` после строки `DOMAIN=village.example.ru` (строка 17) и пустой
строки добавить блок (перед комментарием `# build-time для web`):

```bash
# версия образов из ghcr, которую разворачиваем на VM (совпадает с git-тегом без v)
RELEASE_TAG=0.1.0
```

Итоговый фрагмент `.env.example` (строки 16+):

```bash
# деплой / Caddy
DOMAIN=village.example.ru

# версия образов из ghcr, которую разворачиваем на VM (совпадает с git-тегом без v)
RELEASE_TAG=0.1.0

# build-time для web (несекретные, инлайнятся в бандл при сборке caddy-образа)
# VITE_VAPID_PUBLIC_KEY обязан совпадать с VAPID_PUBLIC, иначе push не подпишется
VITE_VAPID_PUBLIC_KEY=replace-with-vapid-public-key
VITE_TG_BOT=village_emrg_bot
```

- [ ] **Step 2: Проверить, что значение подхватывается compose**

Run:
```bash
set -a; . ./.env.example; set +a; docker compose -f docker-compose.yml config 2>/dev/null | grep -E 'image:.*village-emergency'
```
Expected: две строки с `...village-emergency-app:0.1.0` и `...-web:0.1.0`.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "build: RELEASE_TAG в .env.example — пин версии образов на VM"
```

---

## Task 5: Runbook `docs/deploy.md` — pull-модель, откат, CI

**Files:**
- Modify: `docs/deploy.md`

- [ ] **Step 1: Переписать раздел 7 «Первый деплой» на pull-модель**

Заменить блок раздела `## 7. Первый деплой` (код-фрагмент с
`docker compose up -d --build`) на:

````markdown
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
````

Блок «Проверка» под разделом 7 (`docker compose ps` / `logs` / `curl health`)
оставить как есть.

- [ ] **Step 2: Переписать раздел 9 «Обновление» и добавить откат**

Заменить весь раздел `## 9. Обновление` (от заголовка до конца его списка) на:

````markdown
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
````

- [ ] **Step 3: Добавить раздел про CI/релиз перед «## Переменные окружения»**

Прямо перед строкой `## Переменные окружения` вставить новый раздел:

````markdown
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
````

- [ ] **Step 4: Проверить целостность документа**

Run:
```bash
grep -nE '^## (7|9|11)\.' docs/deploy.md && grep -c 'up -d --build' docs/deploy.md
```
Expected: видны заголовки разделов 7, 9, 11; счётчик `up -d --build` = `0`
(старая команда сборки на VM удалена везде).

- [ ] **Step 5: Commit**

```bash
git add docs/deploy.md
git commit -m "docs: runbook на pull-модель — деплой/откат через RELEASE_TAG, раздел CI"
```

---

## Task 6: Прогон пайплайна и настройка ghcr (операторский шаг)

> Требует доступа к GitHub-репозиторию и `git push`. Делать после подтверждения —
> это первый сетевой выход на ghcr и публикация образов.

**Files:** нет (настройка в GitHub UI + пуш).

- [ ] **Step 1: Завести repo Variables**

В GitHub: Settings → Secrets and variables → Actions → вкладка **Variables** →
New repository variable:
- `VITE_VAPID_PUBLIC_KEY` = реальный публичный VAPID-ключ прода;
- `VITE_TG_BOT` = имя бота без `@` (например `village_emrg_bot`).

- [ ] **Step 2: Запушить ветку с изменениями и смержить в main**

```bash
git push origin <branch>
# открыть PR, дождаться зелёного ci.yml, смержить в main
```
Expected: `ci.yml` зелёный.

- [ ] **Step 3: Прогнать release вручную (без тега) и проверить пуш**

GitHub → Actions → «Release» → Run workflow (ветка `main`).
Expected: оба job'а зелёные; в раздел Packages репозитория добавились
`village-emergency-app` и `village-emergency-web` с тегами `latest` + `sha-...`.

- [ ] **Step 4: Сделать пакеты public**

Для каждого пакета: Package settings → Danger Zone → Change visibility → Public.
Expected: оба пакета помечены Public.

- [ ] **Step 5: Проверить pull без авторизации**

На машине без `docker login` в ghcr:
```bash
docker pull ghcr.io/dmitrtrc/village-emergency-app:latest
```
Expected: образ тянется без ошибки авторизации.

- [ ] **Step 6: Релиз по тегу (боевой путь)**

```bash
git tag -a v0.1.1 -m "v0.1.1" && git push origin v0.1.1   # пример
```
Expected: «Release» отрабатывает, в ghcr появляются теги `0.1.1` + `latest`.

---

## Self-review (выполнено автором плана)

- **Покрытие спеки:** release.yml (Task 1) ← секции «Пайплайн», «Build-time
  конфиг», «Инвентарь секретов»; образы/теги/видимость ← Task 1 + Task 6;
  compose `image:`+`RELEASE_TAG` (Task 2) и `compose.build.yml` (Task 3) ←
  секция «Compose на VM»; `.env.example` (Task 4); runbook откат/CI (Task 5) ←
  секция «Деплой и откат»; настройка Variables/public (Task 6) ← «Файлы под
  изменение». Пунктов спеки без задачи нет.
- **Плейсхолдеры:** нет TODO/TBD; весь YAML и правки даны полным текстом.
- **Согласованность имён:** образы везде `ghcr.io/dmitrtrc/village-emergency-app`
  и `-web`; переменная `RELEASE_TAG`; repo Variables `VITE_VAPID_PUBLIC_KEY`,
  `VITE_TG_BOT` — одинаково во всех задачах и в compose.
- **Вне scope (как в спеке):** E2E-в-CI, SSH-автодеплой, esbuild-audit — не здесь.
