#!/usr/bin/env bash
# Демо-запуск village-emrg для показа коллективу.
# Поднимает реальный сервер (Postgres в Docker через testcontainers) + собранный
# PWA, сеет демо-данные и открывает браузер. Telegram не нужен — вход по
# магик-ссылке. Всё во временной БД, после Ctrl-C всё гасится и удаляется.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${DEMO_API_PORT:-8788}"
WEB_PORT="${DEMO_WEB_PORT:-4173}"
API="http://localhost:${API_PORT}"
WEB="http://localhost:${WEB_PORT}"

cd "$ROOT"

note()  { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
die()   { printf '\033[1;31mОшибка: %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "нужен docker (testcontainers поднимает Postgres)"
docker info >/dev/null 2>&1 || die "docker не запущен — стартани Docker Desktop"

API_PID=""; WEB_PID=""; LOG_DIR="$(mktemp -d)"
cleanup() {
  note "Останавливаю демо"
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  # SIGTERM серверу → он сам останавливает Postgres-контейнер
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "$API_PID" ] && wait "$API_PID" 2>/dev/null || true
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT INT TERM

# ждём http-эндпоинт, конечное число попыток (без бесконечного полла)
wait_for() {
  local url="$1" name="$2" tries=120
  while (( tries-- > 0 )); do
    curl -fsS --max-time 2 "$url" >/dev/null 2>&1 && return 0
    sleep 2
  done
  die "$name не поднялся за отведённое время (лог: $LOG_DIR)"
}

post() { # post <path> <json> → тело ответа
  curl -fsS --max-time 10 -X POST "${API}$1" \
    -H 'content-type: application/json' -d "$2"
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s)["'"$1"'"]))'; }

note "Сборка shared + web (VITE_API_BASE=${API})"
pnpm -C packages/shared build >/dev/null
VITE_API_BASE="$API" pnpm -C packages/web build >/dev/null

note "Запуск сервера (Postgres в контейнере) на :${API_PORT}"
E2E_API_PORT="$API_PORT" E2E_WEB_ORIGIN="$WEB" \
  pnpm -C packages/server exec tsx test-server.ts >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!
wait_for "${API}/health" "сервер"

note "Засеваю демо-данные"
post /__test__/reset '{}' >/dev/null
CMD_TG=$(post /__test__/seed-user '{"role":"commander","name":"Командир Иванов"}' | jget tg)
P_ID=$(post /__test__/seed-user '{"role":"resident","name":"Пётр (житель)"}' | jget id)
A_ID=$(post /__test__/seed-user '{"role":"resident","name":"Анна (житель)"}' | jget id)

post /__test__/seed-incident "{\"authorId\":\"$P_ID\",\"level\":\"emergency\",\"text\":\"Пожар у дома 12, горит сарай\"}" >/dev/null
post /__test__/seed-incident "{\"authorId\":\"$A_ID\",\"level\":\"offence\",\"text\":\"Взлом сарая на участке 7, пропал инструмент\"}" >/dev/null
post /__test__/seed-incident "{\"authorId\":\"$P_ID\",\"level\":\"attention\",\"text\":\"Подозрительная машина у въезда, стоит второй час\"}" >/dev/null

CMD_NONCE=$(post /__test__/login-nonce "{\"tg\":\"${CMD_TG}\"}" | jget token)
# отдельный nonce-логин жителя: сеем жителя с известным tg
RES_TG=$(post /__test__/seed-user '{"role":"resident","name":"Демо-житель"}' | jget tg)
RES_NONCE=$(post /__test__/login-nonce "{\"tg\":\"${RES_TG}\"}" | jget token)

note "Запуск PWA на :${WEB_PORT}"
pnpm -C packages/web preview --port "$WEB_PORT" --strictPort >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
wait_for "$WEB" "веб"

CMD_URL="${WEB}/auth/callback?token=${CMD_NONCE}"
RES_URL="${WEB}/auth/callback?token=${RES_NONCE}"

cat <<EOF

============================================================
  village-emrg — ДЕМО готово
============================================================
  Командир (видит всё, модерирует):
    ${CMD_URL}

  Житель (видит публичное + своё) — открой в другой вкладке/инкогнито:
    ${RES_URL}

  Уже засеяно:
    • Тревога   — «Пожар у дома 12» (видна сразу всем)
    • Нарушение — «Взлом сарая на участке 7» (ждёт принятия командиром)
    • Внимание  — «Подозрительная машина» (ждёт принятия командиром)

  Сценарий показа:
    1) Командир видит все три, житель — только тревогу.
    2) Командир открывает «Взлом сарая» → Принять → появляется у жителя.
    3) Командир открывает «Пожар» → Отклонить → исчезает из общей ленты.

  Ссылки одноразовые: для нового входа перезапусти скрипт.
  Остановить демо: Ctrl-C (БД и контейнер удалятся автоматически).
============================================================
EOF

# открыть браузер на входе командира
if command -v open >/dev/null; then open "$CMD_URL"
elif command -v xdg-open >/dev/null; then xdg-open "$CMD_URL"
fi

note "Демо работает. Ctrl-C для остановки."
wait "$API_PID"
