#!/bin/sh
# Monthly restore test: restores the newest backup (or the dump given as $1) into a scratch
# database next to the live one, compares row counts, then drops it. The live database is
# never touched. For a real restore, follow docs/runbooks/restore-backup.md.
set -eu

ROOT="${IXNOS_DATA_ROOT:-/opt/ixnos-data}"
ENV_FILE="${IXNOS_DATA_ENV_FILE:-$ROOT/.env}"
COMPOSE="${COMPOSE:-docker compose -f $ROOT/infra/compose.prod.yaml --env-file $ENV_FILE}"
DIR="${IXNOS_DATA_BACKUP_DIR:-/var/backups/ixnos-data}"
DUMP="${1:-$(ls -t "$DIR"/ixnos-data-*.dump | head -n 1)}"
COUNTS="SELECT (SELECT count(*) FROM procurement_item) || ' records, ' || (SELECT count(*) FROM organisation) || ' organisations'"

# SQL on stdin, database by name ("" = the live one), so nothing needs shell quoting.
q() {
  printf '%s\n' "$2" | $COMPOSE exec -T -e DB="$1" postgres sh -c 'psql -U "$POSTGRES_USER" -d "${DB:-$POSTGRES_DB}" -At -v ON_ERROR_STOP=1'
}

q postgres "DROP DATABASE IF EXISTS ixnos_data_restore_check"
q postgres "CREATE DATABASE ixnos_data_restore_check"
$COMPOSE exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d ixnos_data_restore_check --no-owner --exit-on-error' < "$DUMP"
restored=$(q ixnos_data_restore_check "$COUNTS")
live=$(q "" "$COUNTS")
q postgres "DROP DATABASE ixnos_data_restore_check"

echo "restore check: $DUMP -> $restored (live now: $live)"
