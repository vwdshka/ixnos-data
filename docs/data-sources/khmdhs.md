# ΚΗΜΔΗΣ Open Data API

Findings from the data verification probe, 22–23 September 2026. Sample: every notice and award
submitted in the six months from 22 March to 22 September 2026 (274,488 records), plus requests,
contracts and payments for three sample weeks (100,825 records) and 100 award chain lookups.
Regenerate the numbers with:

```bash
cd pipeline && uv run python -m ixnos_data_pipeline.sources.khmdhs.probe run --out ../.data/khmdhs-probe
uv run python -m ixnos_data_pipeline.sources.khmdhs.report --probe ../.data/khmdhs-probe
```

## API

- Base: `https://cerpp.eprocurement.gov.gr/khmdhs-opendata`, JSON, no key. Swagger UI under
  `/khmdhs-opendata/swagger-ui/`. Licence CC BY 4.0.
- `POST /<kind>?page=N` with a JSON filter body, where kind is `request`, `notice`, `auction`
  (awards), `contract` or `payment`. Pages hold 50 records.
- `GET /adamChain/{ΑΔΑΜ}` returns the records linked to one ΑΔΑΜ.
- Client: `pipeline/src/ixnos_data_pipeline/sources/khmdhs/client.py`.

## Quirks

| Quirk | Handling |
| --- | --- |
| Rate limiting: 429 responses at 2 s spacing, and bursts of them at 4 s (786 retries over 8,618 requests, two pages only on the fifth and last retry) | 4 s minimum interval; retries with backoff (up to five) |
| Requests occasionally stall without an answer | Timeout, then retry |
| Date filters apply to `submissionDate` | Ingest by submission day; `published_at` is the submission time |
| The request endpoint needs `isInitial`, `isApproved` and `isApproval` in the body, or it returns nothing | Sent as `false` |
| Titles are cut at exactly 100 characters | Search also indexes the description and CPV labels |
| A day with no records answers **404** instead of an empty page. That is always the case for the current day, because records appear the day after submission, and also for days like 12 April 2026 (Orthodox Easter Sunday) | The client treats 404 as an empty day. Hourly runs therefore pick up yesterday's records; there is no same-day data |
| ΑΔΑ fields hold placeholders and other IDs ("0", "-", "ΧΩΡΙΣ ΑΔΑ", ΑΔΑΜ codes, typos) | `find_adas` keeps only well-formed ΑΔΑ |
| A few signing dates are decades off (publication lag up to 731,873 days) | Kept as published; `published_at` never uses them |

## Volume

| Kind | Weekday mean | Weekday max | Weekend mean | Days sampled |
| --- | --- | --- | --- | --- |
| Request | 2,850 | 4,903 | 79 | 21 |
| Notice | 947 | 1,374 | 23 | 183 |
| Award (`auction`) | 1,124 | 1,671 | 37 | 184 |
| Contract | 1,186 | 1,535 | 41 | 21 |
| Payment | 2,618 | 3,136 | 50 | 21 |

No duplicates and no record that failed model validation across all 375,313.

## Coverage of the fields ixnos-data needs

| Field | Request | Notice | Award | Contract | Payment |
| --- | --- | --- | --- | --- | --- |
| CPV (all well-formed) | 100% | 100% | 100% | 100% | 100% |
| NUTS present | 100% | 100% | 100% | 100% | 100% |
| NUTS only the country ("EL") | 5.9% | 6.7% | 6.4% | 7.3% | 7.5% |
| Amount without VAT > 0 | 99.2% | 99.4% | 99.9% | 99.9% | 100% |
| Organisation VAT, 9 digits | 99.7% | 73.4% | 99.8% | 99.7% | 99.6% |
| Contractor VAT | n/a | n/a | 100% | 100% | 100% |
| Signing date | 100% | 100% | 100% | 100% | 100% |
| Deadline (`finalSubmissionDate`) | n/a | 100% | n/a | n/a | n/a |
| Διαύγεια ΑΔΑ, valid | 0.2% | 0.6% | 0.3% | 96.2% | 0.1% |
| Cancelled | 3.4% | 5.8% | 4.1% | 2.7% | 1.9% |

Notes:

- **Amounts.** `totalCostWithoutVAT` is filled on every kind, awards included; awards also carry
  `budget` (the estimated value), used only when the total is missing.
- **Deadlines.** Notices close a median of 6.2 days after submission (10th percentile 3.5 days,
  90th 16.1). A weekly digest would miss most tenders; alerts must be at least daily.
- **Regions.** Notices carry two kinds of region: `nutsCode` (with `nutsCity` and
  `nutsPostalCode`, the contracting authority's address) and `nutsCodes` (the place of
  performance). They disagree on 14.6% of notices, and on 10.7% the place of performance is in
  a different NUTS-2 region. Only 0.3% list more than one place. ixnos-data stores the place of
  performance when listed (`docs/schema-v1.md`).

## Links between records

| From → to | References | Resolved inside the sample |
| --- | --- | --- |
| Notice → award | 80,509 | 100% |
| Award → notice | 92,721 | 87.6% (the rest are older notices) |
| Award → contract | 120,507 | 10.5% (contracts sampled for three weeks only) |
| Contract → award | 15,698 | 83.4% |
| Request → notice | 11,857 | 100% |
| Payment → contract | 29,316 | 2.3% |

`adamChain` agrees with the references in the records themselves for 97 of 100 awards (notice)
and 98 of 100 (contract), so the record fields are enough to link; the chain endpoint isn't
needed in ingestion. 96% of contracts name their Διαύγεια commitment ΑΔΑ (see
`docs/data-sources/diavgeia.md` for how those resolve).

## Storage

The local database with 346,462 ΚΗΜΔΗΣ records takes 1,633 MB for `procurement_item` including
indexes: about 4.9 KB per record. Notices and awards arrive at about 520,000 a year, so roughly
2.5 GB a year. Rows average 3.5–3.9 KB for notices and awards, most of it the `raw` payload.
