# 0012: Neutral procurement signals from fixed, published rules

- Status: accepted
- Date: 2026-09-24
- Deciders: David Gavriilidis

## Context and problem

Journalists and citizens ask the same few questions of procurement data: did anyone else bid,
was the contract split to stay under a threshold, does one supplier win everything? The data
can answer them, but a label on a named authority or company can also read as an accusation.
Most of these patterns have innocent explanations: a small market with one supplier, a budget
that happens to equal the limit.

## Decision

Three signals, each a fixed rule on what the source publishes, defined once in
`IxnosData.Application.Items.Signals` (records) and `DominantSupplier` (organisations):

- **`single_offer`**: a competitive procedure (ΚΗΜΔΗΣ procedure types 1, 2, 4, 7, 11, 13: open,
  restricted, competitive dialogue, negotiated, innovation partnership) whose contract reports
  exactly one offer (`bidsSubmitted`). Direct awards are excluded: one offer is how they work.
- **`near_direct_award_limit`**: an award or contract by direct award (procedure type 6) between
  95% and 100% of the direct-award limit, €30,000 excluding VAT, or €60,000 for works
  (contract type 10), per Law 4412/2016 as amended by Law 4782/2021.
- **Concentration** (organisation pages): in the last 12 months one contractor won at least half
  of the awarded value, across at least 3 awards, when the authority made at least 10.
  Cancelled, superseded and implausible amounts are left out, as in every total.

How they are shown:

- In ink, like every other fact; never in the accent colour, never as a score or ranking.
- Every signal comes with its definition and the sentence "not a sign of wrongdoing by itself",
  and links to the "How it works" page.
- Search can filter by signal (`signal=` in the API), so the rules can be checked record by
  record.

The procedure type, contract type and offer count are stored as columns
(`procedure_type`, `contract_type`, `offers_received`), filled by the pipeline and, for
existing records, by the migration `AddProcedureAndOffers` from the raw payload.

## Evidence

Direct awards and contracts (procedure type 6, not works) by amount, in €1,000 buckets, from
the local data set of about 346,000 ΚΗΜΔΗΣ records:

| Amount (€) | Records |
| --- | --- |
| 25,000–26,000 | 1,026 |
| 26,000–27,000 | 816 |
| 27,000–28,000 | 877 |
| 28,000–29,000 | 1,496 |
| 29,000–30,000 | 5,371 |
| 30,000–31,000 | 2,837 (2,771 of them exactly 30,000) |
| 31,000–32,000 | 96 |

For works, €58,000–60,000 has 276 records against 15–62 in each €2,000 bucket below it. The
spikes sit right under the limits, and almost nothing is above them, so the limits are real and
the band is where splitting would show.

Only 603 contracts report an offer count so far (345 of them in competitive procedures, 152 with
one offer), so `single_offer` covers few records until ΚΗΜΔΗΣ fills the field more often.

## Consequences

- The signals are cheap: indexed columns and one grouped query per organisation page.
- 21 of 1,132 authorities with at least 10 awards in the last year show a concentration notice.
- Changing a threshold is a code change with a test (`SignalsTests`), reviewed like any other.
- More signals (repeat suppliers across authorities, contract amendments that raise the value)
  can follow the same pattern: a fixed rule, a definition on the help page, a filter.
