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
if [[ "$RETENTION" =~ ^[0-9]+$ ]] && (( RETENTION >= 1 )); then
  mc find "store/${S3_BUCKET}/${PREFIX}" --older-than "${RETENTION}d" --exec "mc rm {}"
else
  echo "{\"msg\":\"prune skipped: BACKUP_RETENTION_DAYS must be integer >= 1\",\"value\":\"${RETENTION}\"}" >&2
fi
echo "{\"msg\":\"backup done\",\"file\":\"${FILE}\",\"retention_days\":${RETENTION}}"
