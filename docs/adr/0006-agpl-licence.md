# 0006: License the platform under AGPL-3.0

- Status: accepted
- Date: 2026-09-22
- Deciders: David Gavriilidis

## Context and problem

ixnos-data is fully open source. Paid aggregators of the same public data already exist. The
licence decides whether someone may run a modified copy of ixnos-data as a closed, paid service.

## Options considered

1. MIT: maximum reuse, including closed commercial forks.
2. AGPL-3.0: anyone offering a modified version over a network must publish their changes.
3. AGPL-3.0 for the platform, MIT for the client SDKs in `clients/`.

## Decision

AGPL-3.0 for the repository. The point of ixnos-data is that access to public spending data stays
free and inspectable, and AGPL keeps improvements to hosted copies open. The licence for the
client SDKs (Phase 4) is left open: option 3 remains available when they are published, so
that developers can use them in any project.

## Consequences

- Good: a hosted fork cannot become a closed competitor built on this work.
- Bad: some companies avoid AGPL code, which may deter a few contributors or reusers.
- Note: this licenses the code only. Source data keeps its own terms (ΚΗΜΔΗΣ: CC BY 4.0;
  Διαύγεια: to be confirmed), and ixnos-data must attribute it.
