# 0010: Free API keys raise the rate limit; bulk exports carry no contractor data

- Status: accepted
- Date: 2026-09-23
- Deciders: David Gavriilidis

## Context and problem

Phase 4 opens ixnos-data to developers and researchers. The API is free and anonymous access must
keep working, but one heavy client should not starve the others on a small server. Researchers
want whole datasets rather than millions of API calls. The records name contractors, some of
them sole traders, and the privacy rules forbid personal profiles.

## Decision

**API keys.**
- Keys are optional and free, created by a signed-in user on the alerts page (at most 5 per
  account).
- A request that sends a key in `X-Api-Key` gets that key's own limit, 600 a minute. Without a
  key, requests share a limit of 120 a minute per IP address.
- An unknown or revoked key is refused (401) rather than quietly downgraded.
- Keys are stored hashed and looked up at most once a minute (in-memory cache).
- The API trusts `X-Forwarded-For` from Caddy, so the per-IP limit uses real client addresses.

**Documentation.** The API serves its OpenAPI document at `/openapi/v1.json`, with a Scalar
viewer at `/docs` (a pinned script from jsDelivr, so no front-end build in the API).

**Bulk exports.**
- Every morning the pipeline writes every record and organisation as gzipped CSV and JSON
  Lines, plus a manifest and a README with the licence.
- Caddy serves them from `/exports/`. Files are written under temporary names and renamed at
  the end, so a download never sees a half-written file.
- Exports carry the same fields as the API: no raw payloads, no contractors, no VAT numbers.

## Consequences

- Good: casual use needs no sign-up, and heavy users get a higher, separate limit.
- Good: the dataset can be reused without scraping, while contractor lists stay behind
  per-record pages.
- Bad: researchers who want contractors must use the per-record API.
- Revisit if: abuse appears (then per-key quotas per day), or a clear public-interest case
  arises for exporting company contractors (not individuals).
