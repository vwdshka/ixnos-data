#!/usr/bin/env bash
# A database snapshot for scripts/start.sh: the records, organisations and reference codes,
# without anyone's account. The tables that hold people's data (accounts, sign-in links,
# sessions, saved searches, alert history, API keys) keep their structure but no rows.
#
#   scripts/make-snapshot.sh [--public] [file]    default file: ixnos-data-snapshot-<date>.dump
#
# --public makes a snapshot safe to publish: contractors' VAT numbers are removed as well, from
# the contractor table and from inside the raw source payloads. (For a sole trader, a VAT number
# identifies a person, so the site never shows them.) Contracting authorities' VAT numbers stay:
# they belong to public bodies. It takes a few minutes longer, because the snapshot is cleaned in
# a temporary database; the working database is not changed.
#
# Runs against the local compose database. Records keep their raw source payloads, as ΚΗΜΔΗΣ and
# Διαύγεια publish them (CC BY 4.0); credit the sources wherever the snapshot is shared.
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash on Windows would rewrite container paths like /tmp/... into Windows paths.
export MSYS_NO_PATHCONV=1

public=false
if [ "${1:-}" = "--public" ]; then
  public=true
  shift
fi
out="${1:-ixnos-data-snapshot-$(date +%F).dump}"

personal=(user_account login_token user_session saved_search alert_delivery api_key)
exclude=()
for table in "${personal[@]}"; do
  exclude+=("--exclude-table-data=public.$table")
done

# Runs a command in the database container with the compose credentials available.
db() { docker compose exec -T postgres sh -c "$1" sh "${@:2}"; }

if ! $public; then
  db 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges "$@"' "${exclude[@]}" > "$out.tmp"
  mv "$out.tmp" "$out"
  echo "snapshot: $out ($(du -h "$out" | cut -f1))"
  exit 0
fi

scratch="ixnos_data_public_$$"
dump="/tmp/$scratch.dump"
cleanup() {
  db 'dropdb -U "$POSTGRES_USER" --if-exists "$1"; rm -f "$2"' "$scratch" "$dump" || true
  rm -f "$out.tmp"
}
trap cleanup EXIT

echo "copying the database to a temporary one ($scratch)..."
db 'file="$1"; shift; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges -f "$file" "$@"' "$dump" "${exclude[@]}"
db 'createdb -U "$POSTGRES_USER" "$1"' "$scratch"
# Tables and data first; indexes only after the clean-up, so it doesn't update them row by row.
db 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges --section=pre-data --section=data "$2"' "$scratch" "$dump"

echo "removing contractors' VAT numbers..."
# The values are set to null rather than removed, so the payloads keep the shape the pipeline
# reads. They are always plain strings; PostgreSQL prints stored JSON in one fixed layout
# ("key": "value"), so a text replacement is exact, and much faster than walking every document.
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -q' sh "$scratch" <<'SQL'
UPDATE contractor SET tax_id = NULL WHERE tax_id IS NOT NULL;

-- ΚΗΜΔΗΣ: winners (vatNumber) and payees (vatNo). The authority's organizationVatNumber stays.
UPDATE procurement_item
SET raw = regexp_replace(raw::text, '"(vatNumber|vatNo)": "[^"]*"', '"\1": null', 'g')::jsonb
WHERE source = 'khmdhs' AND raw::text ~ '"(vatNumber|vatNo)": "';

-- Διαύγεια: payees and winners (afm). The authority's own afm, under extraFieldValues.org, stays.
UPDATE procurement_item
SET raw = CASE
    WHEN raw #> '{extraFieldValues,org}' IS NULL THEN cleaned
    ELSE jsonb_set(cleaned, '{extraFieldValues,org}', raw #> '{extraFieldValues,org}')
  END
FROM (SELECT id AS cleaned_id, regexp_replace(raw::text, '"afm": "[^"]*"', '"afm": null', 'g')::jsonb AS cleaned
      FROM procurement_item
      WHERE source = 'diavgeia' AND (raw #- '{extraFieldValues,org}')::text ~ '"afm": "') c
WHERE procurement_item.id = c.cleaned_id;
SQL

# Refuse to write the file if anything was missed.
left=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$1" -Atq' sh "$scratch" <<'SQL' | tr -d '\r'
SELECT (SELECT count(*) FROM contractor WHERE tax_id IS NOT NULL)
     + (SELECT count(*) FROM procurement_item WHERE source = 'khmdhs' AND raw::text ~ '"(vatNumber|vatNo)": "')
     + (SELECT count(*) FROM procurement_item
        WHERE source = 'diavgeia' AND (raw #- '{extraFieldValues,org}')::text ~ '"afm": "');
SQL
)
if [ "$left" != "0" ]; then
  echo "stopped: $left rows still hold a contractor VAT number; no snapshot written" >&2
  exit 1
fi

echo "rebuilding indexes and writing the snapshot..."
db 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges --section=post-data "$2"' "$scratch" "$dump"
db 'pg_dump -U "$POSTGRES_USER" -d "$1" -Fc --no-owner --no-privileges' "$scratch" > "$out.tmp"
mv "$out.tmp" "$out"
echo "public snapshot: $out ($(du -h "$out" | cut -f1)), no contractor VAT numbers"
