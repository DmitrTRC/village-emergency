#!/usr/bin/env bash
set -euo pipefail
echo "${BACKUP_CRON:-0 3 * * *} /usr/local/bin/backup.sh" > /etc/crontab.supercronic
echo "{\"msg\":\"backup sidecar started\",\"cron\":\"${BACKUP_CRON:-0 3 * * *}\"}"
exec supercronic /etc/crontab.supercronic
