#!/usr/bin/env bash
# Regenerates every file in contracts/ that is derived from code:
#   contracts/openapi/v1.json    from the API's endpoints (build-time OpenAPI generation)
#   contracts/db/schema.sql      from the EF Core migrations (what Python tests apply)
#   web/src/lib/api/schema.d.ts  TypeScript types for the web app, from v1.json
# CI (contracts-check.yml) runs this and fails if anything changed, so commit the output
# together with the change that caused it.
set -euo pipefail
cd "$(dirname "$0")/.."

(
  cd backend
  dotnet tool restore >/dev/null
  dotnet build src/IxnosData.Api -p:OpenApiGenerateDocuments=true -v quiet -nologo
  dotnet ef migrations script --no-build \
    -p src/IxnosData.Infrastructure -s src/IxnosData.Api -o ../contracts/db/schema.sql
)
# dotnet-ef writes a byte-order mark; drop it so regeneration is byte-for-byte stable.
sed -i '1s/^\xEF\xBB\xBF//' contracts/db/schema.sql

(cd web && pnpm api:types)

echo "contracts regenerated"
