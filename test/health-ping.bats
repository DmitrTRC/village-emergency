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
