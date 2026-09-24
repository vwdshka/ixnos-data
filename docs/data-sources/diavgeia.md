# Διαύγεια OpenData

Findings from the data verification probe, 22 September 2026. Sample: every decision of five
types submitted in three weeks (23–29 March, 15–21 June and 14–20 September 2026), 238,802
decisions, plus the organisation register and 150 ΑΔΑ lookups. Regenerate the numbers with:

```bash
cd pipeline && uv run python -m ixnos_data_pipeline.sources.diavgeia.probe run --out ../.data/diavgeia-probe --khmdhs-cache ../.data/khmdhs-probe/raw
uv run python -m ixnos_data_pipeline.sources.diavgeia.report --probe ../.data/diavgeia-probe --khmdhs-cache ../.data/khmdhs-probe/raw
```

## API

- Base: `https://diavgeia.gov.gr/luminapi/opendata`, JSON by appending `.json`. Public reads
  need no key. The help page (`/api/help`) is a single-page app, so its text isn't in the HTML.
- `GET /search.json?type=&from_date=&to_date=&from_issue_date=&page=&size=` returns
  `{decisions: [...], info: {total, page, size, actualSize, query}}`. The echoed `info.query`
  shows the filter actually applied, which is how the quirks below were found.
- `GET /decisions/{ada}.json` returns one decision. `GET /organizations.json` returns the whole
  register (about 2.5 MB, 25–30 s).
- Client: `pipeline/src/ixnos_data_pipeline/sources/diavgeia/client.py`.

## Quirks

| Quirk | Handling |
| --- | --- |
| `from_date`/`to_date` are both midnight, so `from=to=D` is an empty window | Query `[D, D+1)` |
| Every search is limited to a **180-day `issueDate` window**: the last 180 days by default, or 180 days from `from_issue_date`. `to_issue_date` is ignored | Each day's query anchors the window to end two days after the submission day |
| Decisions issued more than about six months before submission fall outside that window: 0.4% of Β.2.1, 0.1% of Β.2.2 | Ignored in the probe. Production can run a second query over the earlier window |
| Pages are capped at 500; larger `size` values are silently reduced | `PAGE_SIZE = 500`; stop when `(page+1)*size >= total` |
| Timestamps are epoch milliseconds | Parsed to UTC `datetime` |
| Rate limits: no 429s at 1 s spacing, and 848 requests at 2 s spacing drew zero retries | 2 s minimum interval |

## Volume (per weekday, sample means)

| Type | Meaning | Weekday mean | Weekday max | Weekend mean |
| --- | --- | --- | --- | --- |
| Β.1.3 | Ανάληψη υποχρέωσης (budget commitment) | 4,146 | 5,418 | 61 |
| Β.2.1 | Έγκριση δαπάνης (spending approval) | 1,458 | 1,864 | 46 |
| Β.2.2 | Οριστικοποίηση πληρωμής (payment) | 8,689 | 11,055 | 88 |
| Δ.1 | Ανάθεση (award) | 1,330 | 1,665 | 44 |
| Δ.2.2 | Κατακύρωση (final award) | 201 | 277 | 2 |

About 15,800 decisions of these types per weekday: roughly five times the ΚΗΜΔΗΣ notice and
award volume. Every decision passed model validation.

## Coverage of the fields ixnos-data needs

| Field | Β.1.3 | Β.2.1 | Β.2.2 | Δ.1 | Δ.2.2 |
| --- | --- | --- | --- | --- | --- |
| Issuer VAT (`extraFieldValues.org.afm`) | n/a | 99.9% | 93.9% | n/a | n/a |
| Payee or beneficiary entry (`sponsor`) | n/a | 100% | 86.0% | n/a | n/a |
| Payee VAT number | n/a | 73.5% | 80.6% | `person` 43.6% | `person` 38.2% |
| Amount > 0 | `amountWithVAT` 94.1% | 99.7% | 85.4% | `awardAmount`, see note | see note |
| CPV code | no | no | no | 45.4% | no |
| Correction of an earlier version | 2.9% | 3.2% | 1.7% | 4.6% | 4.7% |

Notes:

- **Withheld payees.** 18% of payments carry a `skipVatReason` instead of a payee:
  `SKIP_VAT_REASON_1` (13,222), `SKIP_VAT_REASON_2` (6,446) and `10066` (3,865). These look like
  payments to private individuals, whose identity Διαύγεια withholds. ixnos-data must not try to
  recover them.
- **Δ.1 and Δ.2.2 amounts.** `awardAmount` is present on about 80% of decisions, but it often
  contains only a currency and no amount, so real amount coverage is lower. Measure it before
  relying on it.
- **Amounts per decision.** Β.2.1: median €1,110 (10th–90th percentile €50–€29,600). Β.2.2:
  median €1,062 (10th–90th €66–€10,900). **Eight payments exceed €100 million** (max
  €2,420,203,001, whose subject looks like a document number typed as an amount). Totals and
  statistics need an outlier rule; flag rather than sum these.
- Β.1.3 commitments break amounts down by budget line (`amountWithKae`, 55%).
- Corrections (`correctedVersionId`) replace earlier versions and must update the stored
  decision, not be counted twice.

## Organisation register

5,428 organisations with `uid`, `label`, `latinName`, `vatNumber`, `category`,
`supervisorId`/`supervisorLabel` (parent body), `status` and `website`. The largest categories
are legal entities under public law (ΝΠΔΔ, 2,661), courts (525), `OTHERTYPE` (523), private-law
public entities (ΝΠΙΔ, 373) and municipalities (336). Two categories (`10022`, `10026`) are bare
numeric codes without labels.

## Links to ΚΗΜΔΗΣ

| Link | Result | Consequence |
| --- | --- | --- |
| ΚΗΜΔΗΣ organisation keys found among register `uid`s | **99.8%** (1,341 of 1,344) | The two systems share organisation IDs: one `organisation` table serves both |
| … with the same VAT number in both | 88.7% | Investigate the 11% (parent and child bodies, or stale VAT numbers). Key on the ID, not the VAT |
| ΑΔΑ references in ΚΗΜΔΗΣ contracts that contain a valid ΑΔΑ | 96.7% of 10,004, almost all in `contractRelatedADA.number3` | Parse with `find_adas` (several per field, dates appended, 5+3 format) |
| … that exist in Διαύγεια | **97.3%** of 150 looked up | ΑΔΑ links are reliable |
| … decision type | 94% Β.1.3 commitments; the rest Δ.1, Δ.2.2, Β.2.1, 2.4.7.1, Α.2 | A contract links first to its budget commitment |
| … same organisation on both sides | 98.6% | Cross-check for link quality |
| ΚΗΜΔΗΣ contract contractors who appear as Β.2.2 payees (same weeks, by VAT) | **45.2%** of 5,109 | "Awarded" and "actually paid" can be joined per contractor |
| Β.2.1 approvals referencing Β.1.3 commitments (`relatedAnalipsiYpoxreosis`) | 14.2% of approvals; 17% of those commitments fall in the sampled weeks | Commitments come weeks before approvals, so linking needs history, not just the same window |

The resulting chain: **ΚΗΜΔΗΣ contract → Β.1.3 commitment (by ΑΔΑ) ← Β.2.1 approval → Β.2.2
payment**, with organisations joined by ID and contractors or payees by VAT number.

## Reuse terms

Confirmed 23 September 2026 from the site's terms of use
(https://diavgeia.gov.gr/termsOfUse):

- **Licence:** the site's content is under the Greek Creative Commons Attribution licence
  (CC BY 4.0), unless stated otherwise (§3).
- **Reuse:** public-sector documents and information may be used, reused, linked and
  republished, commercially or not, without permission or payment, under law 3448/2006, on
  condition that the source is credited (§4).
- **Personal data:** decisions carry personal data only for transparency under law 3861/2010.
  Any further use must respect data-protection law (§5; now the GDPR and law 4624/2019).
- **No warranty:** content is provided as is (§6).

How ixnos-data complies:

- **Attribution:** the footer on every page names both sources and the licence, with links.
  Every Διαύγεια record says «Πηγή: Διαύγεια (CC BY 4.0)» and links to its official document.
- **Personal data:**
  - Payees Διαύγεια withholds (`skipVatReason`) are never recovered.
  - Individuals' names drop the father's name.
  - The API and exports never include contractor VAT numbers.
  - There are no pages that profile a person.
  - Removal requests are honoured (see the privacy page).
