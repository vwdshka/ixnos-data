"""Search quality checks against contracts/search-quality/queries.json.

    python -m ixnos_data_pipeline.search_quality --khmdhs-cache ../.data/khmdhs-probe/raw
    python -m ixnos_data_pipeline.search_quality --api http://localhost:8080

With a cache it counts how many records each query's criteria match (0 or tens of
thousands means the criteria are wrong). With --api it scores precision@10 and exits 1
when a category drops below its threshold. Needs IXNOS_DATA_DATABASE_URL for the API's database.
"""

import argparse
import json
from collections import Counter
from collections.abc import Callable, Iterable, Iterator
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import Engine, text

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.greek_text import normalise

QUERIES_FILE = Path(__file__).parents[3] / "contracts" / "search-quality" / "queries.json"
CRITERIA = frozenset({
    "any_cpv_prefix", "title_any", "organisation_any", "nuts_prefix", "reference",
    "organisation_vat", "min_amount_eur", "kind",
})  # fmt: skip


def load_queries(path: Path = QUERIES_FILE) -> dict[str, Any]:
    test_set: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return test_set


def resolved_criteria(query: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """The query's own criteria, or those of the query it is `same_as`."""
    if "same_as" in query:
        return resolved_criteria(by_id[query["same_as"]], by_id)
    criteria: dict[str, Any] = query["relevant_if"]
    return criteria


def is_relevant(record: dict[str, Any], kind: str, criteria: dict[str, Any]) -> bool:
    checks: dict[str, Callable[[Any], bool]] = {
        "any_cpv_prefix": lambda v: any(c.startswith(tuple(v)) for c in _cpvs(record)),
        "title_any": lambda v: any(normalise(s) in normalise(record.get("title", "")) for s in v),
        "organisation_any": lambda v: any(
            normalise(s) in normalise((record.get("organization") or {}).get("value") or "")
            for s in v
        ),
        "nuts_prefix": lambda v: _place(record).startswith(v),
        "reference": lambda v: v in _references(record),
        "organisation_vat": lambda v: record.get("organizationVatNumber") == v,
        "min_amount_eur": lambda v: (record.get("totalCostWithoutVAT") or 0) >= v,
        "kind": lambda v: kind == v,
    }
    return all(checks[name](value) for name, value in criteria.items())


def _cpvs(record: dict[str, Any]) -> Iterator[str]:
    for item in (record.get("objectDetails") or []) + (record.get("objectDetailsList") or []):
        for cpv in item.get("cpvs") or []:
            if cpv.get("key"):
                yield cpv["key"]


def _place(record: dict[str, Any]) -> str:
    """The region ixnos-data stores: the place of work when listed, else the authority's address."""
    for entry in record.get("nutsCodes") or []:
        for value in entry.values():
            if isinstance(value, dict) and value.get("key"):
                return str(value["key"])
    return str((record.get("nutsCode") or {}).get("key") or "")


def _references(record: dict[str, Any]) -> set[str]:
    related = record.get("contractRelatedADA") or {}
    return {record.get("referenceNumber", ""), *(v for v in related.values() if v)}


def relevant_counts(
    queries: Iterable[dict[str, Any]], records: Iterable[tuple[str, dict[str, Any]]]
) -> Counter[str]:
    queries = list(queries)
    by_id = {q["id"]: q for q in queries}
    resolved = [(q["id"], resolved_criteria(q, by_id)) for q in queries]
    counts: Counter[str] = Counter({query_id: 0 for query_id, _ in resolved})
    for kind, record in records:
        for query_id, criteria in resolved:
            if is_relevant(record, kind, criteria):
                counts[query_id] += 1
    return counts


def _cached_records(cache: RawPageCache) -> Iterator[tuple[str, dict[str, Any]]]:
    for kind in ("notice", "auction", "contract"):
        for _, page in cache.iter_pages(kind):
            for record in page["content"]:
                yield kind, record


# API filter names for the query file's filters.
API_FILTERS = {"nuts": "nuts", "cpv": "cpv", "kind": "kind", "min_amount_eur": "minAmount"}


def judge(row: dict[str, Any], criteria: dict[str, Any]) -> bool | None:
    """Relevance of a stored record, from the columns both sources fill.

    None means the record can't be judged: a CPV rule on a Διαύγεια decision (no CPV codes), or
    an amount rule on a record without an amount excluding VAT.
    """
    checks: dict[str, Callable[[Any], bool | None]] = {
        "any_cpv_prefix": lambda v: (
            any(c.startswith(tuple(v)) for c in row["cpv_codes"]) if row["cpv_codes"] else None
        ),
        "title_any": lambda v: any(normalise(s) in normalise(row["title"]) for s in v),
        "organisation_any": lambda v: any(
            normalise(s) in normalise(row["organisation_name"] or "") for s in v
        ),
        "nuts_prefix": lambda v: (row["nuts_code"] or "").startswith(v),
        "reference": lambda v: v == row["source_id"] or v in row["linked_ids"],
        "organisation_vat": lambda v: row["organisation_tax_id"] == v,
        "min_amount_eur": lambda v: None if row["amount_eur"] is None else row["amount_eur"] >= v,
        "kind": lambda v: row["kind"] == v,
    }
    results = [checks[name](value) for name, value in criteria.items()]
    if False in results:
        return False
    return None if None in results else True


def precision_at_10(
    api: httpx.Client, engine: Engine, query: dict[str, Any], criteria: dict[str, Any]
) -> tuple[float | None, int]:
    """Precision over the judged results among the top 10, and how many couldn't be judged."""
    params = {"pageSize": 10, "q": query["query"] or None}
    params |= {API_FILTERS[k]: v for k, v in query.get("filters", {}).items()}
    items = api.get("/v1/search", params=params).raise_for_status().json()["items"]
    if not items:
        return 0.0, 0
    with engine.connect() as connection:
        rows = (
            connection.execute(
                text(
                    """
                SELECT p.source_id, p.kind, p.title, p.cpv_codes, p.nuts_code, p.amount_eur,
                       o.name_el AS organisation_name, o.tax_id AS organisation_tax_id,
                       array(SELECT l.to_source_id FROM item_link l WHERE l.from_item_id = p.id)
                           AS linked_ids
                FROM procurement_item p LEFT JOIN organisation o ON o.id = p.organisation_id
                WHERE p.source_id = ANY(:ids)
                """
                ),
                {"ids": [i["sourceId"] for i in items]},
            )
            .mappings()
            .all()
        )
    verdicts = [judge(dict(row), criteria) for row in rows]
    judged = [v for v in verdicts if v is not None]
    unjudged = len(verdicts) - len(judged)
    return (sum(judged) / len(judged) if judged else None), unjudged


# The criteria assume months of data (they were checked against six). On a fresh deployment,
# before the backfill, scores are printed but do not fail the run.
MIN_RECORDS = 100_000


def score(api_url: str, engine: Engine) -> int:
    test_set = load_queries()
    queries = test_set["queries"]
    by_id = {q["id"]: q for q in queries}
    per_category: dict[str, list[float]] = {}
    with httpx.Client(base_url=api_url, timeout=30) as api:
        for query in queries:
            value, unjudged = precision_at_10(api, engine, query, resolved_criteria(query, by_id))
            note = f"  ({unjudged} unjudged)" if unjudged else ""
            if value is None:
                print(f"{query['id']:15}   n/a  {query['query']}{note}")
                continue
            per_category.setdefault(query["category"], []).append(value)
            print(f"{query['id']:15} {value:5.2f}  {query['query']}{note}")

    failed = 0
    print()
    for category, values in per_category.items():
        mean = sum(values) / len(values)
        floor = test_set["thresholds"].get(category, 0.0)
        status = "ok" if mean >= floor else "BELOW"
        failed += status == "BELOW"
        print(f"{category:12} precision@10 {mean:.2f}  (threshold {floor:.2f}) {status}")

    with engine.connect() as connection:
        records = connection.execute(text("SELECT count(*) FROM procurement_item")).scalar_one()
    if records < MIN_RECORDS:
        print(f"\nnot enforced: {records} records, the gate needs {MIN_RECORDS} (run the backfill)")
        return 0
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="search-quality", description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--khmdhs-cache", type=Path)
    source.add_argument("--api", help="score the API at this base URL")
    args = parser.parse_args(argv)
    if args.api:
        from ixnos_data_pipeline.config import Settings
        from ixnos_data_pipeline.db.engine import engine_from_settings

        return score(args.api, engine_from_settings(Settings()))

    queries = load_queries()["queries"]
    counts = relevant_counts(queries, _cached_records(RawPageCache(args.khmdhs_cache)))
    for query in queries:
        count = counts[query["id"]]
        flag = "  <- no relevant records" if count == 0 else ""
        print(f"{query['id']:15} {count:>7}  {query['query']}{flag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
