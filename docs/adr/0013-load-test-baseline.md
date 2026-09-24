# 0013: A load-test baseline before launch, and no new infrastructure yet

- Status: accepted
- Date: 2026-09-24
- Deciders: David Gavriilidis

## Context and problem

The plan adds infrastructure (Redis, a search engine, a bigger server) only when a measured
problem demands it. Before launch there was no measurement: how many visitors can the API serve,
and which requests give way first?

## What was measured

`infra/loadtest/api.js` (k6) against a Release build of the API and the local database (about
585,000 records), on an 8-core laptop (Ryzen 9 5900HS, 16 threads, Docker with 12 GB). Each
simulated visitor searches, opens a record, sometimes an organisation, and reads the status, with
2–4 seconds of pauses per round.

| Run | Requests/s | Search p50 / p95 | Record p95 | Organisation p95 | Errors |
| --- | --- | --- | --- | --- | --- |
| 20 visitors | 13 | 2 ms / 0.57 s | 40 ms | 96 ms | 0% |
| 100 visitors | 63 | 2 ms / 8 ms | 34 ms | 64 ms | 0% |
| 20 visitors, cold (`COLD=1`) | 12 | 0.31 s / 1.97 s | 46 ms | 114 ms | 0% |
| 50 visitors, cold | 29 | 0.24 s / 2.05 s | 55 ms | 105 ms | 0% |

"Cold" makes every search URL unique, so each one reaches PostgreSQL instead of the one-minute
output cache. It is the pessimistic case: real visitors repeat popular searches.

Before these runs, a common word typed in Greeklish ("promitheia", in a quarter of all records)
took 8.3 s, because every spelling variant of it was also typo-matched. Typo matching now runs
only when no variant finds 200 records by exact containment, as in Greek text search (ADR 0011),
and the same search takes 2.2 s, like its Greek form.

## Decision

- No cache server, search engine or read replica. At 50 simultaneous visitors with nothing
  cached, the slowest searches stay under the 2.5 s target and nothing fails.
- The slow tail is common single words: they match up to a quarter of the table. The search page
  already suggests a filter when a search is slow, and the statement timeout (15 s) ends anything
  pathological.
- Re-run the test on the production server before launch; it has fewer cores than the laptop.
  If search p95 there passes 2.5 s at 20 visitors, the next step is more memory for PostgreSQL's
  cache, then precomputed counts for single common words.

## Consequences

- The numbers are a baseline to compare against after changes to search.
- `http_req_failed` also catches mistakes in clients: the first run showed 14% errors because the
  script sent unencoded Greek in URLs, which the server rightly rejects with 400.
