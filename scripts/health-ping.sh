#!/bin/sh
set -eu

CONF="${HEALTH_PING_CONF:-$HOME/.config/village-emrg/health-ping.env}"
# shellcheck source=/dev/null
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
