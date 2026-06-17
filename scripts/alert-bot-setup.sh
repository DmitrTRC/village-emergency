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
