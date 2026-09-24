#!/bin/sh
# Nightly database backup: a compressed pg_dump kept 14 days on the server, then copied off
# the server when IXNOS_DATA_BACKUP_REMOTE is set (any rclone remote, e.g. Hetzner Object Storage:
# IXNOS_DATA_BACKUP_REMOTE=offsite:ixnos-data-backups with RCLONE_CONFIG_OFFSITE_* in .env).
# Run by infra/crontab; also safe to run by hand.
set -eu

ROOT="${IXNOS_DATA_ROOT:-/opt/ixnos-data}"
ENV_FILE="${IXNOS_DATA_ENV_FILE:-$ROOT/.env}"
COMPOSE="${COMPOSE:-docker compose -f $ROOT/infra/compose.prod.yaml --env-file $ENV_FILE}"
DIR="${IXNOS_DATA_BACKUP_DIR:-/var/backups/ixnos-data}"
FILE="$DIR/ixnos-data-$(date +%F).dump"

mkdir -p "$DIR"
# Written to .tmp first so a failed dump never replaces a good one.
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
find "$DIR" -name 'ixnos-data-*.dump' -mtime +14 -delete
echo "backup: $FILE ($(du -h "$FILE" | cut -f1))"

REMOTE="${IXNOS_DATA_BACKUP_REMOTE:-$(sed -n 's/^IXNOS_DATA_BACKUP_REMOTE=//p' "$ENV_FILE" 2>/dev/null || true)}"
if [ -n "$REMOTE" ]; then
  # Retention off the server is the bucket's lifecycle rule, not this script's job.
  docker run --rm --env-file "$ENV_FILE" -v "$DIR:/data:ro" rclone/rclone:1 \
    copy /data "$REMOTE" --include "ixnos-data-*.dump" --max-age 48h
  echo "backup: copied to $REMOTE"
fi
