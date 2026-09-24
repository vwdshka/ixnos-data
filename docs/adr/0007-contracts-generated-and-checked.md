# 0007: Shared contracts are generated from code and checked in CI

- Status: accepted
- Date: 2026-09-22
- Deciders: David Gavriilidis

## Context and problem

Three languages must agree on things none of them can import from the others: the API's
request and response shapes (C# and TypeScript), the database schema (C# owns it, Python
writes to it), and how Greek text is normalised (Python at write time, C# at query time).
Hand-maintained copies drift silently.

## Options considered

1. Hand-written copies in each language, kept in sync by review.
2. A schema-first source (hand-written OpenAPI or SQL) that generates code for each language.
3. Code-first: generate the contract from the owning code, commit it to `contracts/`, and
   fail CI when the committed file no longer matches.

## Decision

Option 3, plus shared test cases where no generator exists:

| Contract | Generated from | Consumed by |
| --- | --- | --- |
| `contracts/openapi/v1.json` | API endpoints (build-time OpenAPI) | web types, SDKs, docs |
| `contracts/db/schema.sql` | EF Core migrations | Python integration tests, which also check `db/tables.py` against it |
| `web/src/lib/api/schema.d.ts` | `v1.json` (openapi-typescript) | web app |
| `contracts/text-normalisation/cases.json` | written by hand | Python and .NET test suites |
| `contracts/search-quality/queries.json` | written by hand | search quality scoring |

`scripts/generate-contracts.sh` regenerates everything. `contracts-check.yml` runs it and
fails on any difference.

## Consequences

- Good: the owning code stays the single source of truth; drift fails CI in the pull request
  that caused it, not in production.
- Good: contract changes show up as readable diffs in review.
- Bad: contributors must run one script after changing endpoints or migrations (the CI error
  message says so).
