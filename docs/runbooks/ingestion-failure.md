# Runbook: ingestion alarm

The uptime monitor calls `https://<domain>/health/ingestion`. It returns 503 when, for ΚΗΜΔΗΣ
or Διαύγεια, the last two runs failed or no new records arrived for 24 hours. The response body
says which source and which condition.

On the server, from `/opt/ixnos-data`:

```sh
C="docker compose -f infra/compose.prod.yaml --env-file .env"
```

## 1. See what the runs say

```sh
$C exec -T postgres psql -U ixnos_data -d ixnos_data -c "SELECT id, source, mode, status, started_at, fetched, inserted, updated, errors, left(error_message, 120) FROM ingestion_run ORDER BY id DESC LIMIT 10"
tail -n 50 /var/log/ixnos-data/pipeline.log
```

## 2. Match the symptom

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `failed`, error mentions HTTP 429 or timeouts | The source is rate limiting or slow | Usually passes by itself. If it keeps failing, raise `IXNOS_DATA_KHMDHS_MIN_INTERVAL_SECONDS` (default 4) in `.env` |
| `failed`, HTTP 5xx or connection refused | The source is down (check its site; Διαύγεια announces maintenance on its home page) | Wait; the nightly run re-fetches the last 7 days, so nothing is lost |
| `failed`, a validation or parsing error | The source changed its format | Fix `sources/<source>/models.py` with a new fixture from the raw response, deploy, then run `nightly` by hand |
| `succeeded` but `inserted` is 0 for a day | A weekend or holiday (few records), or the source published nothing | Compare with the source's website; on a normal weekday this is a real problem, so check the date filter |
| No runs at all | Cron or Docker stopped | `crontab -l`, `systemctl status docker`, then run one by hand |
| A day answers 404 | A known ΚΗΜΔΗΣ quirk (e.g. notices on 12 April 2026) | Nothing to do; see `docs/data-sources/khmdhs.md` |

## 3. Run by hand

```sh
$C run --rm pipeline khmdhs nightly
$C run --rm pipeline diavgeia nightly
```

Both are safe to rerun: records are upserted and only change when the source changed.

## 4. After the fix

`/health/ingestion` turns 200 on the next successful run that inserts records. Note the cause
in the changelog if it needed a code change.
