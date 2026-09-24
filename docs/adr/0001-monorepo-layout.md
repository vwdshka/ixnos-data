# 0001: One polyglot monorepo, one folder per toolchain

- Status: accepted
- Date: 2026-09-22
- Deciders: David Gavriilidis

## Context and problem

ixnos-data has four deployables in three languages: a Python ingestion pipeline, a .NET API and
notifier, and a Next.js web app. They share a database schema, an API contract and text
normalisation rules. They are built by one person, so the cost of coordinating changes across
repositories matters more than independent release cadences.

## Options considered

1. One repository per service.
2. One monorepo with a folder per toolchain (`backend/`, `pipeline/`, `web/`) and shared
   contracts and docs at the root.
3. One monorepo with a build orchestrator (Nx, Bazel, Pants).

## Decision

Option 2. A change that touches the schema, the pipeline and the API lands in one pull request
and is reviewed and tested together. Each folder keeps its own native tooling (`dotnet`, `uv`,
`pnpm`), so no orchestrator has to be learned or maintained. CI workflows are filtered by path,
so a web-only change does not run .NET tests.

## Consequences

- Good: atomic cross-service changes; one place for issues, docs and ADRs; contributors see
  the whole system.
- Good: `contracts/` sits next to every consumer, so drift can be checked in CI (see 0007).
- Bad: three toolchains to install for full local development (`scripts/dev-setup.sh` checks
  for them).
- Revisit if: a service needs a different release cadence or visibility, or CI times grow
  enough that an orchestrator's caching would pay for itself.
