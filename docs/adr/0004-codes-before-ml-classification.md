# 0004: Classify by CPV and NUTS codes before any ML or LLM classification

- Status: accepted
- Date: 2026-09-22
- Deciders: David Gavriilidis

## Context and problem

Small businesses want alerts by trade and region: "cleaning services in Epirus". Records could
be classified from their free-text titles with ML or an LLM, or by the official codes the
sources already carry: CPV (Common Procurement Vocabulary) for what is bought and NUTS for
where.

## Options considered

1. Classify titles with a trained model or an LLM.
2. Use the CPV and NUTS codes the sources publish, with official Greek and English labels.
3. Both from the start.

## Decision

Option 2. The September 2026 probe found CPV codes on 100% of sampled ΚΗΜΔΗΣ requests and
contracts (all well-formed) and NUTS codes on 100%. The codes are official, hierarchical (a
filter on `3314` covers every medical consumable) and understood by procurement officers, and
alerts built on them are explainable ("matched CPV 33141000"). A model adds cost, latency,
drift and a component to evaluate, before we know that codes fall short.

## Consequences

- Good: deterministic, free and explainable filters; bilingual labels come from the official
  lists.
- Bad: codes can be too coarse or wrongly chosen by the authority. About 7% of records carry
  only the country-level NUTS code "EL", so region filters must decide how to treat them.
- Revisit if: the search quality test set (`contracts/search-quality/`) or user feedback shows
  that code-based alerts miss relevant tenders often enough to matter.
