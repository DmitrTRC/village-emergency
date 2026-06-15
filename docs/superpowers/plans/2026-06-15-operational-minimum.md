# Операционный минимум — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать проду наблюдаемость и сохранность: JSON-логи в stdout, ежедневный `pg_dump→S3` через sidecar, внешний health-ping с Mac через отдельный алерт-бот.

**Architecture:** Три развязанных куска. A — pino-логгер + Hono-middleware в `packages/server`. B — отдельный sidecar-контейнер (`ops/backup`) с `pg_dump`+`mc`+`supercronic`, сервис в `docker-compose.yml`. C — zero-deps shell-скрипты в `scripts/`, запускаются по cron на Mac оператора.

**Tech Stack:** pino, Hono, vitest (A); Docker, postgres-alpine, MinIO `mc`, supercronic (B); POSIX sh, curl, bats, shellcheck (C).

**Prerequisites (один раз):** `brew install shellcheck bats-core` — нужны для тестовых шагов B/C.

---

## Файловая структура

| Файл | Ответственность | Действие |
| --- | --- | --- |
| `packages/server/src/logger.ts` | корневой pino-инстанс + err-сериализатор | Create |
| `packages/server/src/http/logging.ts` | `requestLogger` middleware (factory) | Create |
| `packages/server/src/http/middleware.ts` | `AuthedVars.log`, логирование в `errorHandler` | Modify |
| `packages/server/src/http/app.ts` | подключить `requestLogger` | Modify |
| `packages/server/src/env.ts` | `LOG_LEVEL` | Modify |
| `packages/server/src/index.ts` | стартовый лог через pino | Modify |
| `packages/server/vitest.config.ts` | `LOG_LEVEL=silent` в тестах | Modify |
| `packages/server/test/http/logging.test.ts` | тесты requestLogger + errorHandler | Create |
| `packages/server/test/env.test.ts` | кейс LOG_LEVEL | Modify |
| `ops/backup/Dockerfile` | образ sidecar | Create |
| `ops/backup/backup.sh` | dump→gzip→mc cp→prune | Create |
| `ops/backup/entrypoint.sh` | supercronic + crontab | Create |
| `docker-compose.yml` | сервис `backup` | Modify |
| `.env.example` | backup-переменные | Modify |
| `scripts/health-ping.sh` | внешний наблюдатель | Create |
| `scripts/alert-bot-setup.sh` | авто-получение chat_id | Create |
| `test/health-ping.bats` | bats на пороговую логику | Create |
| `docs/deploy.md` | restore + alert-bot + cron | Modify |

---

## Часть A — JSON-логи (pino)

### Task A1: pino-логгер и LOG_LEVEL

**Files:**
- Modify: `packages/server/package.json` (dependency)
- Create: `packages/server/src/logger.ts`
- Modify: `packages/server/src/env.ts`
- Modify: `packages/server/test/env.test.ts`

- [ ] **Step 1: Добавить зависимость pino**

Run: `pnpm --filter @village/server add pino@^9`
Expected: `pino` появляется в `dependencies`, `pnpm-lock.yaml` обновлён.

- [ ] **Step 2: Создать `src/logger.ts`**

```ts
import { pino } from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: pino.stdSerializers.err },
});

export type Logger = typeof log;
```

- [ ] **Step 3: Написать падающий тест на LOG_LEVEL в env**

В `packages/server/test/env.test.ts` внутри `describe("parseEnv", ...)` добавить:

```ts
it("LOG_LEVEL по умолчанию info", () => {
  const env = parseEnv({
    DATABASE_URL: "postgres://u:p@h:5432/db",
    JWT_SECRET: "x".repeat(64),
    TG_BOT_TOKEN: "123:abc",
    BOOTSTRAP_COMMANDER_TG: "42",
    VAPID_PUBLIC: "pub", VAPID_PRIVATE: "priv", VAPID_SUBJECT: "mailto:a@b.c",
    S3_ENDPOINT: "https://s3", S3_REGION: "ru-1", S3_BUCKET: "b",
    S3_ACCESS_KEY: "ak", S3_SECRET_KEY: "sk",
    PUBLIC_BASE_URL: "http://localhost:5173", PORT: "8787",
  });
  expect(env.LOG_LEVEL).toBe("info");
});
```

- [ ] **Step 4: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @village/server exec vitest run test/env.test.ts`
Expected: FAIL — `env.LOG_LEVEL` is `undefined`.

- [ ] **Step 5: Добавить LOG_LEVEL в схему env**

В `packages/server/src/env.ts` в `EnvSchema` перед `PORT`:

```ts
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
```

- [ ] **Step 6: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @village/server exec vitest run test/env.test.ts`
Expected: PASS.

- [ ] **Step 7: Коммит**

```bash
git add packages/server/package.json pnpm-lock.yaml packages/server/src/logger.ts packages/server/src/env.ts packages/server/test/env.test.ts
git commit -m "feat(server): pino-логгер и LOG_LEVEL в env"
```

---

### Task A2: requestLogger middleware

**Files:**
- Modify: `packages/server/src/http/middleware.ts` (поле `log` в `AuthedVars`)
- Create: `packages/server/src/http/logging.ts`
- Create: `packages/server/test/http/logging.test.ts`

- [ ] **Step 1: Добавить поле `log` в `AuthedVars`**

В `packages/server/src/http/middleware.ts` дополнить интерфейс и импорт типа:

```ts
import type { Logger } from "../logger.js";
```

```ts
export interface AuthedVars {
  user: { id: string; role: Role };
  log: Logger;
}
```

- [ ] **Step 2: Написать падающий тест на requestLogger**

Create `packages/server/test/http/logging.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { pino } from "pino";
import { requestLogger } from "../../src/http/logging.js";
import type { AuthedVars } from "../../src/http/middleware.js";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = { write: (s: string) => lines.push(JSON.parse(s)) };
  const logger = pino(
    { level: "info", serializers: { err: pino.stdSerializers.err } },
    stream as unknown as import("pino").DestinationStream,
  );
  return { logger, lines };
}

describe("requestLogger", () => {
  it("пишет одну строку с method/path/status/ms/reqId", async () => {
    const { logger, lines } = capture();
    const app = new Hono<{ Variables: AuthedVars }>();
    app.use(requestLogger(logger));
    app.get("/x", (c) => c.text("ok"));

    const res = await app.fetch(new Request("http://h/x"));

    expect(res.status).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ method: "GET", path: "/x", status: 200, msg: "request" });
    expect(typeof lines[0]!.reqId).toBe("string");
    expect(typeof lines[0]!.ms).toBe("number");
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @village/server exec vitest run test/http/logging.test.ts`
Expected: FAIL — модуль `logging.js` не найден.

- [ ] **Step 4: Реализовать `src/http/logging.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import { log, type Logger } from "../logger.js";
import type { AuthedVars } from "./middleware.js";

export function requestLogger(logger: Logger = log): MiddlewareHandler<{ Variables: AuthedVars }> {
  return async (c, next) => {
    const reqId = crypto.randomUUID();
    const child = logger.child({ reqId });
    c.set("log", child);
    const start = performance.now();
    await next();
    child.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) },
      "request",
    );
  };
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @village/server exec vitest run test/http/logging.test.ts`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add packages/server/src/http/middleware.ts packages/server/src/http/logging.ts packages/server/test/http/logging.test.ts
git commit -m "feat(server): requestLogger middleware с reqId"
```

---

### Task A3: логирование в errorHandler

**Files:**
- Modify: `packages/server/src/http/middleware.ts`
- Modify: `packages/server/test/http/logging.test.ts`

- [ ] **Step 1: Дописать падающий тест на errorHandler**

В `packages/server/test/http/logging.test.ts` добавить новый блок (импорт `errorHandler` дополнить в существующую строку импорта middleware):

```ts
import { requestLogger } from "../../src/http/logging.js";
import { errorHandler } from "../../src/http/middleware.js";
import type { AuthedVars } from "../../src/http/middleware.js";
```

```ts
describe("errorHandler", () => {
  it("логирует ошибку (level 50) и сохраняет HTTP-контракт", async () => {
    const { logger, lines } = capture();
    const app = new Hono<{ Variables: AuthedVars }>();
    app.onError(errorHandler);
    app.use(requestLogger(logger));
    app.get("/boom", () => { throw new Error("not found: thing"); });

    const res = await app.fetch(new Request("http://h/boom"));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not found: thing" });
    const errLine = lines.find((l) => l.level === 50);
    expect(errLine).toBeTruthy();
    expect((errLine!.err as { message: string }).message).toBe("not found: thing");
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @village/server exec vitest run test/http/logging.test.ts`
Expected: FAIL — лог уровня 50 не найден (errorHandler пока не пишет в лог).

- [ ] **Step 3: Добавить логирование в errorHandler**

В `packages/server/src/http/middleware.ts` дополнить импорт и тело:

```ts
import { log, type Logger } from "../logger.js";
```

```ts
export const errorHandler = (err: Error, c: import("hono").Context) => {
  const l = (c.get("log") as Logger | undefined) ?? log;
  l.error({ err }, "request error");
  const status = /forbidden/.test(err.message) ? 403
    : /not found/.test(err.message) ? 404
    : /illegal transition/.test(err.message) ? 409
    : 400;
  return c.json({ error: err.message }, status);
};
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @village/server exec vitest run test/http/logging.test.ts`
Expected: PASS (оба describe).

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/http/middleware.ts packages/server/test/http/logging.test.ts
git commit -m "feat(server): errorHandler пишет ошибку в лог"
```

---

### Task A4: подключить в buildApp и заглушить логи в тестах

**Files:**
- Modify: `packages/server/src/http/app.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/vitest.config.ts`

- [ ] **Step 1: Заглушить логи в тестовом окружении**

В `packages/server/vitest.config.ts` в объект `test` добавить:

```ts
    env: { LOG_LEVEL: "silent" },
```

- [ ] **Step 2: Подключить requestLogger в buildApp**

В `packages/server/src/http/app.ts` добавить импорт и подключение перед `/health`:

```ts
import { requestLogger } from "./logging.js";
```

```ts
  const app = new Hono<{ Variables: AuthedVars }>();
  app.onError(errorHandler);
  app.use("*", requestLogger());

  app.get("/health", (c) => c.json({ ok: true }));
```

- [ ] **Step 3: Перевести стартовый лог на pino**

В `packages/server/src/index.ts` заменить последнюю строку:

```ts
import { log } from "./logger.js";
```

```ts
serve({ fetch: app.fetch, port: env.PORT });
log.info({ port: env.PORT }, "server started");
```

(Удалить старый `console.log(...)`.)

- [ ] **Step 4: Прогнать весь серверный набор + typecheck**

Run: `pnpm --filter @village/shared build && pnpm --filter @village/server typecheck && pnpm --filter @village/server test`
Expected: typecheck чисто; все тесты зелёные (включая ранее существовавшие http/*).

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/http/app.ts packages/server/src/index.ts packages/server/vitest.config.ts
git commit -m "feat(server): подключить requestLogger, тихие логи в тестах"
```

---

## Часть B — Бэкап-sidecar

### Task B1: скрипты и образ backup

**Files:**
- Create: `ops/backup/backup.sh`
- Create: `ops/backup/entrypoint.sh`
- Create: `ops/backup/Dockerfile`

- [ ] **Step 1: Создать `ops/backup/backup.sh`**

```sh
#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?}"
: "${S3_ENDPOINT:?}"; : "${S3_BUCKET:?}"
: "${S3_ACCESS_KEY:?}"; : "${S3_SECRET_KEY:?}"
PREFIX="${BACKUP_S3_PREFIX:-backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%d-%H%M)"
FILE="village-emrg-${STAMP}.sql.gz"
TMP="/tmp/${FILE}"

pg_dump "$DATABASE_URL" | gzip > "$TMP"
mc alias set store "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
mc cp "$TMP" "store/${S3_BUCKET}/${PREFIX}/${FILE}"
rm -f "$TMP"
mc find "store/${S3_BUCKET}/${PREFIX}" --older-than "${RETENTION}d" --exec "mc rm {}"
echo "{\"msg\":\"backup done\",\"file\":\"${FILE}\",\"retention_days\":${RETENTION}}"
```

- [ ] **Step 2: Создать `ops/backup/entrypoint.sh`**

```sh
#!/usr/bin/env bash
set -euo pipefail
echo "${BACKUP_CRON:-0 3 * * *} /usr/local/bin/backup.sh" > /etc/crontab.supercronic
echo "{\"msg\":\"backup sidecar started\",\"cron\":\"${BACKUP_CRON:-0 3 * * *}\"}"
exec supercronic /etc/crontab.supercronic
```

- [ ] **Step 3: Создать `ops/backup/Dockerfile`**

```dockerfile
ARG PG_MAJOR=17
FROM postgres:${PG_MAJOR}-alpine

ARG SUPERCRONIC_VERSION=v0.2.33
RUN set -eux; \
    arch="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"; \
    apk add --no-cache curl bash; \
    curl -fsSL "https://dl.min.io/client/mc/release/linux-${arch}/mc" -o /usr/local/bin/mc; \
    curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${arch}" -o /usr/local/bin/supercronic; \
    chmod +x /usr/local/bin/mc /usr/local/bin/supercronic

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

- [ ] **Step 4: shellcheck по скриптам**

Run: `shellcheck ops/backup/backup.sh ops/backup/entrypoint.sh`
Expected: без замечаний (exit 0).

- [ ] **Step 5: Коммит**

```bash
git add ops/backup/backup.sh ops/backup/entrypoint.sh ops/backup/Dockerfile
git commit -m "feat(ops): backup-sidecar — pg_dump+mc+supercronic"
```

---

### Task B2: сервис в compose, env, restore-док

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `docs/deploy.md`

- [ ] **Step 1: Добавить сервис `backup` в `docker-compose.yml`**

Перед блоком `volumes:` добавить (app/web остаются на pull-модели; backup — крошечный образ, собирается на VM один раз через `--build`):

```yaml
  backup:
    build:
      context: ./ops/backup
      args:
        PG_MAJOR: ${PG_MAJOR:-17}
    image: village-emergency-backup:local
    env_file: .env
    restart: unless-stopped
```

- [ ] **Step 2: Добавить backup-переменные в `.env.example`**

После строки `RELEASE_TAG=0.1.0` добавить блок:

```bash
# бэкап БД (sidecar). PG_MAJOR обязан совпадать с мажором managed-Postgres
PG_MAJOR=17
BACKUP_S3_PREFIX=backups
BACKUP_CRON=0 3 * * *
BACKUP_RETENTION_DAYS=30
```

- [ ] **Step 3: Добавить раздел восстановления в `docs/deploy.md`**

Дописать в конец раздела про бэкапы (или новым `## Восстановление из бэкапа`):

```markdown
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
```

- [ ] **Step 4: Валидация compose**

Run: `docker compose config >/dev/null && echo OK`
Expected: `OK` (синтаксис compose валиден; сборку образа здесь не запускаем).

- [ ] **Step 5: Коммит**

```bash
git add docker-compose.yml .env.example docs/deploy.md
git commit -m "feat(ops): backup-сервис в compose + restore-рецепт"
```

---

## Часть C — Health-ping

### Task C1: скрипт health-ping.sh

**Files:**
- Create: `scripts/health-ping.sh`

- [ ] **Step 1: Создать `scripts/health-ping.sh`**

```sh
#!/bin/sh
set -eu

CONF="${HEALTH_PING_CONF:-$HOME/.config/village-emrg/health-ping.env}"
[ -f "$CONF" ] && . "$CONF"

: "${HEALTH_URL:?}"
: "${ALERT_BOT_TOKEN:?}"
: "${ALERT_CHAT_ID:?}"
STATE_FILE="${STATE_FILE:-$HOME/.local/state/village-emrg/health.state}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-2}"
mkdir -p "$(dirname "$STATE_FILE")"

fails=0
alerted=0
if [ -f "$STATE_FILE" ]; then
  fails=$(sed -n 1p "$STATE_FILE")
  alerted=$(sed -n 2p "$STATE_FILE")
fi

send() {
  curl -s --max-time 10 \
    "https://api.telegram.org/bot${ALERT_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${ALERT_CHAT_ID}" \
    --data-urlencode "text=$1" >/dev/null
}

if curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; then
  if [ "$alerted" = "1" ]; then
    send "village-emrg: сервер снова доступен"
  fi
  fails=0
  alerted=0
else
  fails=$((fails + 1))
  if [ "$fails" -ge "$FAIL_THRESHOLD" ] && [ "$alerted" = "0" ]; then
    send "village-emrg: /health недоступен, ${fails} проверки подряд"
    alerted=1
  fi
fi

printf '%s\n%s\n' "$fails" "$alerted" > "$STATE_FILE"
```

- [ ] **Step 2: shellcheck**

Run: `shellcheck scripts/health-ping.sh`
Expected: без замечаний (exit 0).

- [ ] **Step 3: Коммит**

```bash
git add scripts/health-ping.sh
git commit -m "feat(ops): health-ping — внешний наблюдатель за /health"
```

---

### Task C2: bats-тест пороговой логики

**Files:**
- Create: `test/health-ping.bats`

- [ ] **Step 1: Написать падающий bats-тест**

Create `test/health-ping.bats`:

```bash
setup() {
  TMP="$(mktemp -d)"
  export HEALTH_PING_CONF="/dev/null"
  export HEALTH_URL="http://x/health"
  export ALERT_BOT_TOKEN="t"
  export ALERT_CHAT_ID="1"
  export STATE_FILE="$TMP/state"
  export SENT_LOG="$TMP/sent"
  mkdir -p "$TMP/bin"
  cat > "$TMP/bin/curl" <<'SH'
#!/bin/sh
for a in "$@"; do
  case "$a" in *api.telegram.org*) echo sent >> "$SENT_LOG"; exit 0;; esac
done
[ "${HEALTH_OK:-1}" = "1" ] && exit 0 || exit 7
SH
  chmod +x "$TMP/bin/curl"
  export PATH="$TMP/bin:$PATH"
  SCRIPT="$BATS_TEST_DIRNAME/../scripts/health-ping.sh"
}

teardown() { rm -rf "$TMP"; }

sent_count() { [ -f "$SENT_LOG" ] && wc -l < "$SENT_LOG" | tr -d ' ' || echo 0; }

@test "здоров: без алерта, счётчик 0" {
  HEALTH_OK=1 sh "$SCRIPT"
  [ "$(sed -n 1p "$STATE_FILE")" = "0" ]
  [ "$(sent_count)" = "0" ]
}

@test "одна неудача: без алерта, счётчик 1" {
  HEALTH_OK=0 sh "$SCRIPT"
  [ "$(sed -n 1p "$STATE_FILE")" = "1" ]
  [ "$(sent_count)" = "0" ]
}

@test "две неудачи подряд: ровно один алерт" {
  HEALTH_OK=0 sh "$SCRIPT"
  HEALTH_OK=0 sh "$SCRIPT"
  [ "$(sed -n 1p "$STATE_FILE")" = "2" ]
  [ "$(sed -n 2p "$STATE_FILE")" = "1" ]
  [ "$(sent_count)" = "1" ]
}

@test "третья неудача: повторного алерта нет (anti-spam)" {
  HEALTH_OK=0 sh "$SCRIPT"
  HEALTH_OK=0 sh "$SCRIPT"
  HEALTH_OK=0 sh "$SCRIPT"
  [ "$(sent_count)" = "1" ]
}

@test "восстановление после алерта: шлёт recovery и сбрасывает" {
  HEALTH_OK=0 sh "$SCRIPT"
  HEALTH_OK=0 sh "$SCRIPT"
  HEALTH_OK=1 sh "$SCRIPT"
  [ "$(sed -n 1p "$STATE_FILE")" = "0" ]
  [ "$(sed -n 2p "$STATE_FILE")" = "0" ]
  [ "$(sent_count)" = "2" ]
}
```

- [ ] **Step 2: Запустить — убедиться, что тесты осмысленно проходят**

Run: `bats test/health-ping.bats`
Expected: 5 тестов PASS. (Если падает — чинить `scripts/health-ping.sh`, не тест.)

- [ ] **Step 3: Коммит**

```bash
git add test/health-ping.bats
git commit -m "test(ops): bats на пороговую логику health-ping"
```

---

### Task C3: скрипт alert-bot-setup.sh

**Files:**
- Create: `scripts/alert-bot-setup.sh`

- [ ] **Step 1: Создать `scripts/alert-bot-setup.sh`**

```sh
#!/bin/sh
set -eu

: "${ALERT_BOT_TOKEN:?Передайте ALERT_BOT_TOKEN=<токен от @BotFather>}"

echo "1. Откройте Telegram, найдите алерт-бота, нажмите Start (или отправьте любое сообщение)."
printf "2. Нажмите Enter здесь, когда отправите... "
read -r _

echo "chat_id найденные через getUpdates:"
curl -fsS --max-time 10 \
  "https://api.telegram.org/bot${ALERT_BOT_TOKEN}/getUpdates" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); ids={u['message']['chat']['id'] for u in d.get('result',[]) if 'message' in u}; print(*ids, sep='\n') if ids else print('(пусто — отправьте боту сообщение и повторите)')"
```

- [ ] **Step 2: shellcheck**

Run: `shellcheck scripts/alert-bot-setup.sh`
Expected: без замечаний (exit 0).

- [ ] **Step 3: Коммит**

```bash
git add scripts/alert-bot-setup.sh
git commit -m "feat(ops): alert-bot-setup — авто-получение chat_id"
```

---

### Task C4: документация ops в deploy.md

**Files:**
- Modify: `docs/deploy.md`

- [ ] **Step 1: Добавить раздел health-ping в `docs/deploy.md`**

Дописать новый раздел:

```markdown
## Health-ping (внешний наблюдатель)

Запускается НЕ на сервере, а на машине оператора (Mac), чтобы поймать падение
самого сервера. Канал алерта — отдельный «алертовый» бот (не прод-бот).

### Завести алерт-бота (единственный ручной шаг)

1. В Telegram открыть @BotFather → `/newbot` → задать имя и username.
2. Скопировать выданный токен.
3. Узнать chat_id:

       ALERT_BOT_TOKEN=<токен> sh scripts/alert-bot-setup.sh

### Конфиг на Mac

Создать `~/.config/village-emrg/health-ping.env` (вне репозитория, 0600):

    HEALTH_URL=https://village.example.ru/health
    ALERT_BOT_TOKEN=<токен алерт-бота>
    ALERT_CHAT_ID=<chat_id командира>

### Расписание

cron (`crontab -e`):

    */5 * * * * /полный/путь/scripts/health-ping.sh

Альтернатива — launchd: `~/Library/LaunchAgents/ru.village-emrg.healthping.plist`
с `StartInterval` 300 и `ProgramArguments` на скрипт; загрузить `launchctl load`.
```

- [ ] **Step 2: Коммит**

```bash
git add docs/deploy.md
git commit -m "docs: health-ping — alert-бот, конфиг, cron/launchd"
```

---

## Финал

- [ ] **Прогнать всё**

Run: `pnpm --filter @village/server test && shellcheck ops/backup/*.sh scripts/health-ping.sh scripts/alert-bot-setup.sh && bats test/health-ping.bats`
Expected: серверные тесты зелёные; shellcheck чисто; 5 bats PASS.

- [ ] **Операторские шаги (агент берёт на себя, см. [[take-operator-steps]])**
  - Минт алерт-бота в @BotFather — ручной шаг оператора (Telegram не даёт API на создание ботов).
  - Заполнить `~/.config/village-emrg/health-ping.env`, установить cron на Mac — делает агент с подтверждением.
  - Уточнить мажор managed-Postgres → проставить `PG_MAJOR` в `.env`.
  - Деплой backup-сервиса на VM (`docker compose up -d --build backup`) — на Этапе 2 вместе с выводом в прод.

---

## Self-review

**Coverage спека:** A (logger.ts + requestLogger + errorHandler + env) → A1–A4. B (Dockerfile/backup.sh/supercronic/compose/env/restore) → B1–B2. C (health-ping.sh/anti-spam/alert-bot/chat_id/cron) → C1–C4. Тесты A/B/C → шаги тестов в каждой части. Границы/операторские шаги → раздел «Финал».

**Плейсхолдеры:** в коде нет TBD. `<токен>`, `PG_MAJOR=17`, `YYYYMMDD` — реальные параметры окружения/деплоя, не дыры плана.

**Согласованность типов:** `Logger` определён в A1, используется в A2/A3. `AuthedVars.log` добавлен в A2, читается в A3 (`c.get("log")`) и устанавливается в `requestLogger`. `requestLogger(logger=log)` — сигнатура одна везде. State-файл health-ping: строка 1 = fails, строка 2 = alerted — одинаково в скрипте и bats.
