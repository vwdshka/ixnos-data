# 0002: PostgreSQL is the only integration point between services

- Status: accepted
- Date: 2026-09-22
- Deciders: David Gavriilidis

## Context and problem

The pipeline writes procurement records, the API reads them, and the notifier reads new records
and writes alert deliveries. They need to exchange data, but each should be able to fail,
deploy and scale on its own. A mail outage must not take the website down, and a slow source
API must not delay search.

## Options considered

1. Services call each other over HTTP (for example, the pipeline POSTs records to the API).
2. A message broker between services (RabbitMQ, Redis streams).
3. Services share only the database: each reads and writes its own tables, and the schema is
   the contract.

## Decision

Option 3. The database is already required and already durable, so using it as the hand-off
adds no infrastructure. A service being down only means its tables stop changing; nothing
upstream fails. Schema ownership is explicit: EF Core migrations in `backend/` are the only
place the schema changes, and the Python pipeline mirrors the tables it writes and never
alters them. A test checks the mirror against the migrated schema (see 0007).

## Consequences

- Good: no broker to run or monitor on a €5/month server; each service can be restarted or
  redeployed independently.
- Good: raw source payloads live next to the parsed columns (`jsonb`), so reprocessing needs no
  refetch.
- Bad: services are coupled through table shapes. A breaking schema change needs a migration
  that keeps the old shape readable until every service has deployed.
- Revisit if: writes from several services contend on the same rows, or a consumer needs
  push-style delivery faster than polling allows (see 0003).
