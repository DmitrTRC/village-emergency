# Операционный минимум (B4) — дизайн

> Дата: 2026-06-15 · Этап 1 плана очередности запуска village-emrg.
> Цель: чтобы прод «не упал молча». Три развязанных куска под одной темой —
> структурные логи, бэкап БД, внешний health-ping. Только серверный код + ops-обвязка.

## Контекст

MVP кодово завершён. Текущее наблюдаемое состояние сервера:
- логирование — единственный `console.log` на старте (`packages/server/src/index.ts:51`);
- `errorHandler` (`packages/server/src/http/middleware.ts:24`) гасит ошибку в JSON-ответ
  клиенту **без записи в лог**;
- `/health` есть (`packages/server/src/http/app.ts:15`), но никто его не наблюдает;
- бэкапа `pg_dump` нет (есть только managed-снапшоты Selectel вне репо).

Намерение зафиксировано в design-спеке MVP §12 — здесь доводим до реализуемого.

## Не входит в объём

API, фронт, схема БД, бизнес-логика — не трогаем. Реальный деплоя sidecar на VM и
прогон cron на Mac — операторские действия (выполняет агент по принципу
[[take-operator-steps]], с подтверждением на прод-шагах).

---

## A. JSON-логи (pino)

**Зависимость:** `pino` в `packages/server` (прод-dependency).

**Модуль `src/logger.ts`:** сконфигурированный pino-инстанс.
- уровень из `LOG_LEVEL` (default `info`);
- чистый JSON в stdout, без `pino-pretty` и транспортов (минимум зависимостей);
- экспортирует корневой `log`.

**Middleware `requestLogger` (in-repo, Hono, ~15 строк):**
- на входе генерит `reqId = crypto.randomUUID()`;
- кладёт child-logger (`log.child({ reqId })`) в контекст запроса (`c.set`);
- на ответе пишет одну строку: `{ method, path, status, ms, reqId }`.
- `hono-pino` намеренно НЕ берём — лишняя зависимость, логика тривиальна.

**`errorHandler`:** добавляем `log.error({ err, reqId })` перед формированием ответа.
Контракт ответа клиенту (коды/тело) **не меняется** — только добавляется запись в лог.

**`index.ts`:** стартовый `console.log` → `log.info({ port }, "server started")`.

**Env:** `+LOG_LEVEL` (optional, default `info`) в схему `env.ts`.

### Тесты A
- `requestLogger`: перехват pino-стрима (writable в память) → проверка, что на ответ
  пишется строка с полями `method/path/status/ms/reqId` и валидным JSON.
- `errorHandler`: при брошенной ошибке в лог уходит `level=error` с `err`, а HTTP-ответ
  остаётся прежним (код + `{ error }`).

---

## B. Бэкап БД — sidecar-контейнер

**Сервис `backup` в `docker-compose.yml`** + собственный `Dockerfile`
(`packages/server` или `ops/backup/` — уточняется в плане):
- база `postgres:<MAJOR>-alpine` (даёт `pg_dump` нужного мажора);
- **мажор пинится под мажор managed-PG Selectel** — иначе `pg_dump` падает на
  version mismatch. Мажор выносим в build-arg / env, дефолт согласуем при деплое;
- статический `mc` (MinIO client) — S3-совместим с Selectel;
- `supercronic` — корректный cron внутри контейнера, без хост-crontab.

**Скрипт `backup.sh`:**
1. `pg_dump "$DATABASE_URL"` → gzip;
2. `mc cp` в `s3://$S3_BUCKET/$BACKUP_S3_PREFIX/village-emrg-YYYYMMDD-HHMM.sql.gz`;
3. прун старше `BACKUP_RETENTION_DAYS`: `mc find --older-than ${N}d ... | mc rm`;
4. лог результата в stdout (попадает в `docker logs`).

**Расписание:** `BACKUP_CRON` (default `0 3 * * *`) через supercronic.

**Env (отдельный блок, не пересекается с app):**
`DATABASE_URL`, переиспользуем `S3_ENDPOINT/_REGION/_BUCKET/_ACCESS_KEY/_SECRET_KEY`,
`+BACKUP_S3_PREFIX` (default `backups`), `+BACKUP_CRON`, `+BACKUP_RETENTION_DAYS`
(default `30`).

**Restore-рецепт** — раздел в `docs/deploy.md`: скачать дамп `mc cp` → `gunzip` →
`psql "$DATABASE_URL" < dump.sql`. С предупреждением, что restore перетирает данные.

### Тесты B
- `shellcheck` на `backup.sh` (clean).
- Ручной smoke (integration-verified, не юнит): поднять sidecar против demo-PG
  (`scripts/demo.sh`), дождаться запуска, проверить объект в S3 и что прун работает.
- `pg_dump` юнит-тестами не покрываем — честно помечаем как integration-verified.

---

## C. Health-ping — внешний наблюдатель

Алерт идёт **не с сервера** (лёг сервер — он и не крикнет), а со второй машины — Mac.

**`scripts/health-ping.sh`** — POSIX shell, голый `curl`, zero-deps.
- конфиг из env/файла вне репо (`~/.config/village-emrg/health-ping.env`, не в гите):
  `HEALTH_URL`, `ALERT_BOT_TOKEN` (ОТДЕЛЬНЫЙ алерт-бот, не прод-бот), `ALERT_CHAT_ID`,
  `STATE_FILE` (default `~/.local/state/village-emrg/health.state`);
- каждый запуск: `curl --max-time 10 -fsS "$HEALTH_URL"`;
- успех → сброс счётчика; если был флаг `alerted` — шлём «восстановлен» и снимаем флаг;
- неудача → инкремент счётчика подряд-неудач в state-файле;
- счётчик достиг 2 (≈10 мин при шаге 5 мин) и `alerted` не стоит → `sendMessage`
  через алерт-бота командиру, ставим `alerted` (анти-спам: дальше молчим до
  восстановления).

**Планировщик:** cron `*/5 * * * *` на Mac. launchd-plist — альтернативой в доке.
Установку cron/launchd делает агент (это локальный Mac), с подтверждением перед
записью в `crontab`.

**`scripts/alert-bot-setup.sh`** — автоматизация chat_id: после того как оператор
один раз нажмёт `/start` алерт-боту, скрипт дёргает `getUpdates` и вытаскивает
`chat_id`. Руками искать не нужно.

**Единственный ручной операторский атом:** минт алерт-бота в @BotFather (у Telegram
нет API создания ботов — нужен живой чат из аккаунта оператора). Точные шаги — в доке.

### Тесты C
- `shellcheck` на обоих скриптах (clean).
- Лёгкий `bats`-тест на нетривиальную логику `health-ping.sh`: порог 2, инкремент/сброс
  счётчика, анти-спам (`alerted` не шлёт повторно), сообщение о восстановлении.
  Telegram-вызов мокается фейковым endpoint / стабом `curl`.

---

## Границы и ответственность

| Кусок | Код/обвязка (агент) | Операторский шаг |
| --- | --- | --- |
| A логи | весь | — |
| B бэкап | Dockerfile, `backup.sh`, compose-сервис, env, restore-док | деплой стека на VM (агент, с подтверждением) |
| C health-ping | оба скрипта, plist/cron, док | минт алерт-бота в @BotFather (оператор, ~5 тапов) |

Принцип распределения — [[take-operator-steps]]: агент берёт на себя максимум,
оператору остаётся только физически неавтоматизируемое.

## Критерии готовности

- A: сервер пишет JSON-логи запросов и ошибок в stdout; тесты A зелёные.
- B: sidecar по расписанию кладёт сжатый дамп в S3 и прунит старше 30 дней;
  restore-рецепт задокументирован; `shellcheck` + smoke пройдены.
- C: при недоступном `/health` ≥10 мин командир получает Telegram-алерт от алерт-бота,
  при восстановлении — уведомление; анти-спам работает; `shellcheck` + `bats` зелёные.
