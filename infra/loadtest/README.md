# Load test

`api.js` is a [k6](https://k6.io) script that browses the public API like visitors do: a
search, a record, sometimes an organisation, and the status line, with pauses in between.

The API limits each address to 120 requests a minute, so start the target with a higher limit
(or pass an API key with `API_KEY`):

```bash
IXNOS_DATA_RateLimiting__PermitsPerMinute=100000 dotnet run --project backend/src/IxnosData.Api -c Release --urls http://0.0.0.0:8081
```

Then run k6 from Docker (no install needed):

```bash
docker run --rm -v "$PWD/infra/loadtest:/scripts" -e BASE_URL=http://host.docker.internal:8081 grafana/k6 run /scripts/api.js
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8080` | API to test |
| `VUS` | `20` | Simulated visitors at the peak |
| `HOLD` | `1m` | How long the peak lasts |
| `COLD` | unset | `1` makes every search URL unique, so the output cache can't answer |
| `API_KEY` | unset | Sent as `X-Api-Key` |

The thresholds (95th percentile under 2.5 s for searches, 0.5 s for records, 1 s for
organisations, no more than 1% errors) fail the run when crossed. Results so far are in
`docs/adr/0013-load-test-baseline.md`.
