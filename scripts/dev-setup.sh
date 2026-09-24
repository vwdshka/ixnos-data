#!/usr/bin/env bash
# One-time local setup: checks tools, creates .env, installs dependencies for each service.
set -euo pipefail
cd "$(dirname "$0")/.."

missing=0
for tool in docker dotnet uv node pnpm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing: $tool"
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "Install the missing tools (see README.md) and rerun." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "created .env from .env.example"
fi

echo "== backend";  dotnet restore backend/IxnosData.slnx
echo "== pipeline"; (cd pipeline && uv sync)
echo "== web";      (cd web && pnpm install)

echo
echo "Done. Start everything with: docker compose up --build   (or: make dev)"
