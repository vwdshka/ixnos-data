# 0011: Bound the work a search does: capped counts, a relevance pool, typo matching on demand

- Status: accepted
- Date: 2026-09-23
- Deciders: David Gavriilidis

## Context and problem

With about 585,000 records, a search for a common word took 25–30 seconds: «προμήθεια» matches
164,000 of them. Three things added up:

- The text, typo (trigram) and authority-name matches were OR-ed in one `WHERE`, so PostgreSQL
  tested every row of the table instead of using the three indexes.
- Every match was counted exactly (`count(*) OVER ()`) and scored, only to show 20.
- The typo match compares long descriptions character by character, which is slow when a word
  is everywhere.

The goal for the product is "finding a recent tender is faster than on the official portal".

## Decision

- **Each kind of match is its own indexed lookup**, combined with `UNION`, and the matches are
  materialised once and joined to. As an `IN (...)` PostgreSQL estimated ~200 rows and chose a
  nested loop that took over a minute.
- **Typo and partial-word matching runs only when full-text search finds fewer than 200
  records.** Typos and fragments still work; common words skip the expensive step.
- **The count stops at 10,001.** The API reports `total` (at most 10,000, the paging limit)
  and `totalCapped`; the web app says "more than 10.000 results".
- **Relevance is scored over the newest 2,000 matches**, or as many as the requested page
  needs. Sorting by date, deadline or amount still covers every match.

## Consequences

- «προμήθεια»: 26 s → 3 s. «καθαρισμός»: 3.4 s → 0.7 s. Typos and fragments: 0.3–1.8 s.
- The search-quality test set scores the same, query by query, before and after.
- For a very common word, the best match older than the newest 2,000 is not ranked first. A
  stored rank column or a search engine would lift that ceiling; add one when a measured
  problem asks for it (principle: no new infrastructure without a measured need).
- Greeklish for a very common word ("promitheia") still takes about 8 s: its trigram match on
  titles has no full-text step to stand in for it.
