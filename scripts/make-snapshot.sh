#!/usr/bin/env bash
# A database snapshot to share, for scripts/start.sh: the records, organisations and reference
# codes, without anyone's account. The tables that hold people's data (accounts, sign-in links,
# sessions, saved searches, alert history, API keys) keep their structure but no rows.
#
#   scripts/make-snapshot.sh [file]      default: ixnos-data-snapshot-<date>.dump
#
# Runs against the local compose database. Records keep their raw source payloads, as ΚΗΜΔΗΣ and
# Διαύγεια publish them (CC BY 4.0); credit the sources wherever the snapshot is shared.
set -euo pipefail
cd "$(dirname "$0")/.."

out="${1:-ixnos-data-snapshot-$(date +%F).dump}"
personal=(user_account login_token user_session saved_search alert_delivery api_key)
exclude=()
for table in "${personal[@]}"; do
  exclude+=("--exclude-table-data=public.$table")
done

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges "$@"' \
  pg_dump "${exclude[@]}" > "$out.tmp"
mv "$out.tmp" "$out"
echo "snapshot: $out ($(du -h "$out" | cut -f1))"
