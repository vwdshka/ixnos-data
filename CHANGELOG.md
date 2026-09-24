# Changelog

All notable changes to ixnos-data are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The API and client libraries will
follow [Semantic Versioning](https://semver.org/) once published.

## [Unreleased]

### Changed

- A common word typed in Greeklish ("promitheia") searches in 2.2 s instead of 8.3 s: typo
  matching runs only when exact matching finds fewer than 200 records.
- The API docs script is the package's own file with a Subresource Integrity hash.
- GitHub Actions are pinned to commit SHAs.

- Renamed the project from ixnos to ixnos-data: the site, emails, docs and API title, the
  repository and image names, .NET projects (`IxnosData.*`), the Python package
  (`ixnos_data_pipeline`), environment variables (`IXNOS_DATA_*`) and the database
  (`ixnos_data`). A migration renames the Greek search configuration to `ixnos_data_greek`.
  An existing setup needs its `.env` updated and its database and role renamed.

### Added

- `scripts/make-snapshot.sh --public`: a snapshot safe to publish, without contractors' VAT
  numbers (removed from the contractor table and from the raw source data, in a temporary copy
  of the database). It refuses to write the file if any remain.
- The receipt look, carried further: record slips open with the authority's name like a shop's
  receipt and close with a thank-you line, a QR code to the record and the receipt number;
  cancelled records carry a worn rubber stamp (ΑΚΥΡΟ / VOID); a replaced decision has its
  correction paperclipped on top.
- Taped receipts: pin records and see them taped into one strip at `/tape`, with separate
  totals with and without VAT, shareable as a link.
- Link previews for records and authorities drawn as the slip itself (`opengraph-image`).
- While results load, a slip feeds out of a printer; sharing tears the slip off; an authority's
  totals roll into place like a till's counter (all off with reduced motion).
- Spending per year as a dot-matrix strip; an empty result is a receipt with nothing on it; the
  404 page is a balled-up receipt; a paper-roll scrollbar.
- Signals worth a second look, stated neutrally with their definitions
  ([ADR 0012](docs/adr/0012-neutral-procurement-signals.md)): a competitive tender with a single
  offer and a direct award just under the legal limit (badges, a search filter, `signal=` in the
  API), and one supplier with most of an authority's awards (organisation pages). Records store
  the procedure type, contract type and number of offers; a migration fills them from the raw data.
- Public status and metrics page (`/status`, `GET /v1/metrics`): records per source, ingestion
  lag, fetch history, and usage totals.
- "How it works" page: sources, stages, codes, VAT, search tips, corrections and signals.
- Similar records on each record page; a share button; numbered pages in search results;
  a print layout.
- Alert emails every morning, every Monday or paused (`PUT /v1/me/digest`, account page).
- Client libraries: `IxnosData.Client` (.NET 8 and 10, AOT-compatible) and `ixnos-data-client`
  (Python 3.10+), each tested against the OpenAPI contract, with their own CI (MIT licence).
- `scripts/start.sh`: run everything with Docker alone, optionally from a database snapshot;
  `scripts/make-snapshot.sh` makes one without any account data.
- k6 load test (`infra/loadtest/`) and a baseline
  ([ADR 0013](docs/adr/0013-load-test-baseline.md)).
- Encrypted off-server backups with an rclone crypt remote (`infra/README.md`).
- Greeklish authority names ("dimos thessalonikis") find that authority's records; the
  authority category of the search-quality set now passes (0.82 to 0.90).
- Add an open tender's deadline to a calendar (`/calendar/{id}.ics`, reminder the day before).
- RSS feed for any search (`/feed.xml?…`), linked from the results and the page head.
- Download a search's results as CSV (first 1,000), safe to open in a spreadsheet.
- Spending per year on organisation pages: awarded and paid side by side.
- "Data updated N minutes ago" in the footer, from `GET /v1/status`.
- Press `/` anywhere to search.
- Content-Security-Policy with a per-request nonce on every page; a separate one for `/docs`.
- Denial-of-service limits: database reads stop after 15 seconds (answered as 503 with
  advice), public reads are cached for a minute, request bodies over 64 KB are refused.

- Search results: compact cards (deadline and amount on one line), removable filter chips with
  "clear filters", filters behind one button on phones, "more than 10.000" for huge result sets,
  a hint when a search is slow and a clear message when it times out.
- Trade picker that finds any CPV code by Greek or English words or by code (`GET /v1/cpv`),
  with the plain division list kept for browsers without JavaScript.
- Current page marked in the header; `favicon.ico`.
- Monorepo with a .NET 10 backend (Clean Architecture), a Python ingestion pipeline and a
  Next.js web app; Docker Compose for local development; CI per service, CodeQL, Dependabot.
- ΚΗΜΔΗΣ and Διαύγεια API clients with rate limiting, retries and a resumable raw-page cache,
  plus data verification probes and reports (`docs/data-sources/`).
- Greek text normaliser shared by the pipeline and the API: accents, final sigma, Latin
  look-alike letters, Greeklish search keys.
- PostgreSQL schema v1 (draft): records of every kind, organisations (seeded from the Διαύγεια
  register), contractors, links between records, CPV and NUTS reference data, ingestion runs;
  Greek full-text search configuration.
- Contracts generated from code (OpenAPI, SQL schema, web API types) and checked in CI.
- Search quality test set of 56 queries with relevance criteria.
- Architecture overview and ADRs 0001–0010.
- **Ingestion.**
  - ΚΗΜΔΗΣ hourly and nightly ingestion.
  - Διαύγεια ingestion of commitments, approvals, payments and awards, linked by ΑΔΑ.
  - Corrections retire the decisions they replace.
  - Records store the place of work as their region.
- **API.**
  - Search with filters, sort and Greeklish.
  - Record, organisation (awarded, approved and paid; contractors matched by VAT number) and
    sitemap endpoints.
  - Amounts over €1 billion are flagged and left out of totals.
- **Accounts and alerts.** Magic-link sign-in, saved searches, and a daily digest from a separate
  notifier; account deletion.
- **Web app.**
  - The receipt design, in Greek and English, with light and dark themes.
  - Search filters and sorting, deadline countdowns and the procurement chain.
  - Alerts, API keys, developers and privacy pages.
  - Sitemaps, canonical and hreflang links, Open Graph metadata; accessibility fixes.
- **Developer surface.** Free API keys with their own rate limit, hosted docs at `/docs`, daily
  bulk exports at `/exports/`.
- **Operations.**
  - Production Compose with Caddy, a host crontab and a deploy workflow.
  - Ingestion health alarms, and migrations on API start.
  - Nightly backups copied off the server, with a monthly restore test.
  - Optional Sentry error tracking.
  - Runbooks for ingestion failures and restores; a launch checklist.
- **Search quality.** The 56-query set is scored against the API (precision@10 0.84–1.00) and
  checked after each deploy once the database holds real volumes.
- **Tests.** Playwright end-to-end tests run in CI against the full stack.

### Fixed

- Switching language lost a theme chosen by hand (the page went back to the system theme);
  the choice is now also a cookie, so the server renders it.
- The search box no longer shows the magenta focus ring; it has its own focus style.
- Pages called the API from the web server's own address, so every visitor shared one rate
  limit (120 a minute). The web app now passes on the visitor's address.
- Sign-in requests (which send an email) have their own limit: 5 per 15 minutes per address.
- Caddy sends HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy`, and no longer names itself in `Server`.
- The web image copied a `public/` folder that isn't in the repository, so it only built on
  machines that happened to have one.
- An integration test read "the first hourly run" while another test added hourly runs to the
  same database; it now uses its own run mode.
- Common-word searches took 25–30 s; the query now uses each index separately, stops counting
  at 10,000 and scores a bounded pool (ADR 0011). «προμήθεια» now takes about 3 s.
- The search-quality check judged Διαύγεια results by ΚΗΜΔΗΣ-only fields and scored them all
  irrelevant; it now judges stored columns and reports results it can't judge.
- ΚΗΜΔΗΣ answers 404 for days with no records yet (always the current day); ingestion now
  treats that as an empty day instead of failing every hourly run.
- The API image did not build in Release (analysers ran on generated migrations).
- Behind the reverse proxy every visitor shared one rate limit; the API now reads the client
  address from `X-Forwarded-For`.
- Placeholder values such as "00000-000" were read as Διαύγεια ΑΔΑ.
