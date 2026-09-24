# 0003: The notifier polls for new records instead of consuming a queue

- Status: accepted
- Date: 2026-09-22
- Deciders: David Gavriilidis

## Context and problem

Alerts are sent when newly ingested records match a user's saved search. The notifier needs to
learn about new records reliably, never send the same alert twice, and survive crashes. The
sources themselves only publish in batches: records reach ΚΗΜΔΗΣ a median of 3 days after
signing (probe, September 2026), and alerts go out as daily digests.

## Options considered

1. The pipeline publishes an event per new record to a message queue; the notifier consumes it.
2. PostgreSQL `LISTEN/NOTIFY` from the pipeline to the notifier.
3. The notifier polls: it keeps a checkpoint (the newest ingestion time it has processed) and
   periodically selects records newer than it.

## Decision

Option 3. Latency does not matter for daily digests, and a checkpoint plus the `alert_delivery`
log make processing restartable and idempotent: after a crash the notifier re-reads from its
checkpoint and skips anything already logged as sent. No messages can be lost while the
notifier is down, because the records themselves are the backlog.

## Consequences

- Good: no extra infrastructure; exactly-once sending comes from a unique constraint on
  `alert_delivery`, not from broker semantics.
- Good: replaying alerts after a matching bug is just resetting the checkpoint.
- Bad: each poll costs a query; with an index on ingestion time this is negligible at expected
  volumes (thousands of records per day).
- Revisit if: instant alerts become a feature (for example Telegram notices minutes after
  publication), or several notifier instances need to share work.
