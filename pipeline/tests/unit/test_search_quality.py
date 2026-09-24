from collections.abc import Callable
from typing import Any

from ixnos_data_pipeline.search_quality import CRITERIA, is_relevant, load_queries, relevant_counts

LoadFixture = Callable[[str], Any]


def test_query_set_is_well_formed() -> None:
    data = load_queries()
    queries = data["queries"]
    ids = [q["id"] for q in queries]

    assert len(ids) == len(set(ids)), "query ids must be unique"
    assert len(queries) >= 50
    for query in queries:
        assert query["category"] in data["categories"], query["id"]
        assert ("same_as" in query) != ("relevant_if" in query), query["id"]
        if "same_as" in query:
            assert query["same_as"] in ids, query["id"]
        else:
            assert set(query["relevant_if"]) <= CRITERIA, query["id"]


def test_relevance_criteria_on_real_records(load_fixture: LoadFixture) -> None:
    notice = load_fixture("khmdhs/notice_page.json")["content"][0]
    cpv = notice["objectDetails"][0]["cpvs"][0]["key"]
    organisation = notice["organization"]["value"]

    assert is_relevant(notice, "notice", {"any_cpv_prefix": [cpv[:4]]})
    assert not is_relevant(notice, "notice", {"any_cpv_prefix": ["999"]})
    assert is_relevant(notice, "notice", {"organisation_any": [organisation.lower()]})
    assert is_relevant(notice, "notice", {"reference": notice["referenceNumber"]})
    assert not is_relevant(notice, "auction", {"kind": "auction"} | {"reference": "x"})


def test_same_as_queries_share_criteria(load_fixture: LoadFixture) -> None:
    notice = load_fixture("khmdhs/notice_page.json")["content"][0]
    cpv = notice["objectDetails"][0]["cpvs"][0]["key"]
    queries: list[dict[str, Any]] = [
        {"id": "a", "query": "x", "relevant_if": {"any_cpv_prefix": [cpv[:3]]}},
        {"id": "b", "query": "y", "same_as": "a"},
    ]

    counts = relevant_counts(queries, [("notice", notice)])

    assert counts == {"a": 1, "b": 1}


def test_stored_records_are_judged_by_columns_both_sources_fill() -> None:
    from ixnos_data_pipeline.search_quality import judge

    khmdhs = {
        "source_id": "26PROC1",
        "kind": "notice",
        "title": "Υπηρεσίες καθαρισμού",
        "cpv_codes": ["90911200-8"],
        "nuts_code": "EL543",
        "amount_eur": 60000,
        "organisation_name": "ΠΕΡΙΦΕΡΕΙΑ ΚΡΗΤΗΣ",
        "organisation_tax_id": "997",
        "linked_ids": [],
    }
    diavgeia = khmdhs | {
        "source_id": "ΑΔΑ-1",
        "kind": "payment",
        "cpv_codes": [],
        "amount_eur": None,
    }

    assert judge(khmdhs, {"any_cpv_prefix": ["9091"], "nuts_prefix": "EL54"}) is True
    assert judge(diavgeia, {"organisation_any": ["Περιφέρεια Κρήτης"]}) is True
    # No CPV codes or no amount excluding VAT: can't be judged, unless another rule already fails.
    assert judge(diavgeia, {"any_cpv_prefix": ["9091"]}) is None
    assert judge(diavgeia, {"min_amount_eur": 50000}) is None
    assert judge(diavgeia, {"any_cpv_prefix": ["9091"], "kind": "notice"}) is False
