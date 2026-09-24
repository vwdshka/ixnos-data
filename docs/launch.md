# Public launch checklist

Phase 3 ends with the public launch. Everything the code can do for it is built; what remains
needs a server, a domain, or a decision. Tick items as they are done.

## Decisions (David)

- [x] Name: ixnos-data (renamed from ixnos, which clashed with ixnos.gr and a taken GitHub organisation).
- [ ] Domain.
- [ ] Hetzner VPS.
- [ ] Transactional email provider (SMTP), with SPF and DKIM for the domain.
- [ ] Contact address for removal requests and the code of conduct.
- [ ] How far back the historical backfill goes (suggested: 12 months).

## Deploy (see infra/README.md)

- [ ] First deploy; HTTPS works; `/health/ready` and `/health/ingestion` are 200.
- [ ] Reference data, organisation register, then the backfill for both sources.
- [ ] Crontab installed:
  - ingestion for both sources, hourly and nightly;
  - the 07:00 digest, the 04:30 exports and the 04:00 backup.
- [ ] Backups copied off the server through the encrypted (rclone crypt) remote; one restore tested.
- [ ] Load test on the server (`infra/loadtest/`): search p95 under 2.5 s at 20 visitors.
- [ ] External uptime check on `/health/ready` and `/health/ingestion`.
- [ ] Error tracking (Sentry) on the API, notifier and web app.

## Before announcing

- [ ] Soft launch: 5 friends or family with businesses receive useful digests for two weeks.
- [ ] The search quality gate passes against production data (the deploy workflow runs it).
- [ ] Spot-check 20 records against the official sources (amounts, dates, links).
- [ ] `/exports/manifest.json` updates daily; `/docs` loads.
- [ ] README: screenshots, live link, what ixnos-data is and isn't (not an official service).

## Announce

- [ ] r/greece: what your municipality spent and with whom.
- [ ] Greek developer communities: open source, the API and the exports.
- [ ] Hacker News "Show HN".
- [ ] Journalists covering public spending; local chambers of commerce (Επιμελητήρια).
- [ ] LinkedIn post.
- [ ] Start tracking: records indexed, ingestion lag, users and saved searches, alerts sent per week, API keys and requests per day, GitHub stars and contributors, 90-day uptime. `/status` shows most of these.
- [ ] Publish `IxnosData.Client` to NuGet and `ixnos-data-client` to PyPI once the API address is final.
- [ ] Decide whether to host a public database snapshot (`scripts/make-snapshot.sh`); it holds the sources' raw payloads, contractor names included.
