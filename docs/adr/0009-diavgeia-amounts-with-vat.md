# 0009: Διαύγεια amounts are stored with VAT only and never summed with ΚΗΜΔΗΣ

- Status: accepted
- Date: 2026-09-23
- Deciders: David Gavriilidis

## Context and problem

Both sources describe the same money at different stages. ΚΗΜΔΗΣ awards state amounts without
VAT; Διαύγεια approvals, payments and awards state totals with VAT, and a Διαύγεια award often
restates a ΚΗΜΔΗΣ award. Summing them would count money twice and mix VAT treatments.

## Options considered

1. Store Διαύγεια totals in `amount_eur` and deduplicate awards across sources.
2. Estimate the amount without VAT from the Διαύγεια total.
3. Keep Διαύγεια totals in `amount_with_vat_eur` only, leave `amount_eur` empty, and report
   the two sources side by side.

## Decision

Option 3. Organisation pages show "awarded" (ΚΗΜΔΗΣ awards, without VAT) next to "approved"
and "paid" (Διαύγεια, with VAT), each labelled. Contractors are one row per VAT number
whichever source named them, so a business's ΚΗΜΔΗΣ awards and Διαύγεια payments line up.

Totals exclude cancelled records, Διαύγεια decisions replaced by a correction
(`superseded_by`), and amounts over €1 billion (typos in the source).

## Consequences

- Good: no double counting, and every figure says which source and VAT basis it has.
- Bad: search amount filters and "largest amount" sorting only see ΚΗΜΔΗΣ amounts.
- Revisit if: cross-source matching of individual awards becomes reliable enough to show one
  merged figure per award.
