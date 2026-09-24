#!/usr/bin/env bash
# Run ixnos-data locally with one command. Docker is the only requirement: the database, API and
# web app are built and started in containers.
#
#   scripts/start.sh                     start; on an empty database, fetch the last hours of records
#   scripts/start.sh <snapshot>          start from a database snapshot (a file or an https URL)
#
# A snapshot is a pg_dump made by scripts/make-snapshot.sh. It is only restored into an empty
# database; to start over, run `docker compose down -v` first (this deletes the local data).
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n== %s\n' "$*"; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running (or isn't installed). Start Docker Desktop, or install it from https://docs.docker.com/get-docker/" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "created .env from .env.example"
fi
# Ports as compose.yaml reads them: the environment first, then .env, then the defaults.
setting() { local value="${!1:-$(sed -n "s/^$1=//p" .env | tr -d '\r')}"; echo "${value:-$2}"; }
API_PORT="$(setting IXNOS_DATA_API_PORT 8080)"
WEB_PORT="$(setting IXNOS_DATA_WEB_PORT 3000)"

psql() { docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq "$@"' psql "$@"; }
records() { psql -c "SELECT count(*) FROM procurement_item" 2>/dev/null || echo 0; }

say "Starting the database"
docker compose up -d --wait postgres

snapshot="${1:-}"
if [ -n "$snapshot" ]; then
  if [ "$(records)" != "0" ]; then
    echo "The database already has records, so the snapshot is not restored."
    echo "To replace them: docker compose down -v, then run this again."
  else
    say "Restoring the snapshot"
    if [[ "$snapshot" == https://* ]]; then
      curl --fail --location --progress-bar "$snapshot"
    else
      cat "$snapshot"
    fi | docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error'
    echo "restored $(records) records"
  fi
fi

say "Building and starting the API and web app (the first build takes a few minutes)"
docker compose up -d --build api web

printf 'waiting for the API'
for _ in $(seq 1 120); do
  if curl -fs "http://localhost:$API_PORT/health" >/dev/null 2>&1; then
    break
  fi
  printf '.'
  sleep 2
done
echo
curl -fs "http://localhost:$API_PORT/health" >/dev/null || { echo "The API didn't start; see: docker compose logs api" >&2; exit 1; }

if [ "$(records)" = "0" ]; then
  say "Fetching recent records from ΚΗΜΔΗΣ and Διαύγεια"
  docker compose --profile ingest build pipeline
  docker compose --profile ingest run --rm pipeline khmdhs hourly
  docker compose --profile ingest run --rm pipeline diavgeia hourly
  echo "$(records) records. For more history, start from a snapshot or see pipeline/README.md."
fi

say "Ready"
echo "Web app: http://localhost:$WEB_PORT"
echo "API:     http://localhost:$API_PORT/docs"
echo "Stop with: docker compose down   (the data stays; add -v to delete it)"
