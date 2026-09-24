from collections.abc import Callable
from datetime import UTC, date, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.http import RateLimitedClient
from ixnos_data_pipeline.sources.diavgeia.ada import find_adas, normalise_ada
from ixnos_data_pipeline.sources.diavgeia.client import DecisionType, DiavgeiaClient
from ixnos_data_pipeline.sources.diavgeia.models import Decision, SearchPage
from ixnos_data_pipeline.sources.diavgeia.probe import khmdhs_ada_references, plan_pull

LoadFixture = Callable[[str], Any]
TODAY = date(2026, 9, 22)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Ψ2ΤΗ46904Ε-ΡΡΓ", "Ψ2ΤΗ46904Ε-ΡΡΓ"),
        ("ΛΓ2ΣΩΗΥ-Ν4Ψ", "ΛΓ2ΣΩΗΥ-Ν4Ψ"),
        ("Ψ2ΖΨ6-ΗΕΠ", "Ψ2ΖΨ6-ΗΕΠ"),
        ("Ψ2TH46904E-PPΓ", "Ψ2ΤΗ46904Ε-ΡΡΓ"),  # Latin T, H, E, P
        ("ψ2τη46904ε-ρργ", "Ψ2ΤΗ46904Ε-ΡΡΓ"),
        (" 99ΔΧ46ΜΑΖΤ - Α1Π ", "99ΔΧ46ΜΑΖΤ-Α1Π"),
        ("Δ/Α", None),
        ("", None),
        (None, None),
        ("12345", None),
        ("ΑΒΓ-ΔΕΖ", None),
        ("00000-000", None),
    ],
)
def test_normalise_ada(raw: str | None, expected: str | None) -> None:
    assert normalise_ada(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Ε8Γ27ΛΗ-1ΝΦ, ΕΩΩΩ7ΛΗ-5ΞΝ", ["Ε8Γ27ΛΗ-1ΝΦ", "ΕΩΩΩ7ΛΗ-5ΞΝ"]),
        ("ΨΟ1Θ469077-1Η2-02/01/2026", ["ΨΟ1Θ469077-1Η2"]),
        ("ΑΔΑ: 99ΔΧ46ΜΑΖΤ - Α1Π (ορθή επανάληψη)", ["99ΔΧ46ΜΑΖΤ-Α1Π"]),
        ("Ψ2TH46904E-PPΓ και Ψ2ΤΗ46904Ε-ΡΡΓ", ["Ψ2ΤΗ46904Ε-ΡΡΓ"]),
        ("26REQ018698366", []),
        ("74-03-00-0001", []),
        ("00000-000", []),
        ("Δ/Α", []),
        (None, []),
    ],
)
def test_find_adas_in_free_text(raw: str | None, expected: list[str]) -> None:
    assert find_adas(raw) == expected


def test_decision_types_have_ascii_slugs() -> None:
    assert DecisionType.SPENDING_APPROVAL.slug == "b-2-1"
    assert DecisionType.FINAL_AWARD.slug == "d-2-2"


def test_decisions_parse_with_typed_payees(load_fixture: LoadFixture) -> None:
    raw_with_payee, raw_withheld = load_fixture("diavgeia/b-2-2_page.json")["decisions"]

    with_payee = Decision.model_validate(raw_with_payee)
    withheld = Decision.model_validate(raw_withheld)

    assert with_payee.issue_date.tzinfo == UTC
    assert with_payee.org is not None and with_payee.org.afm
    party = with_payee.sponsors[0].sponsor_afm_name
    assert party is not None and party.afm
    assert with_payee.sponsors[0].expense_amount is not None
    assert withheld.sponsors == []


@pytest.mark.parametrize(
    ("page", "size", "actual", "total", "last"),
    [(0, 500, 500, 1576, False), (3, 500, 76, 1576, True), (0, 500, 0, 0, True)],
)
def test_search_page_is_last(page: int, size: int, actual: int, total: int, last: bool) -> None:
    info = {"page": page, "size": size, "actualSize": actual, "total": total}
    assert SearchPage.model_validate({"decisions": [], "info": info}).is_last is last


class FakeApi:
    def __init__(self, page: dict[str, Any], total: int) -> None:
        self.page = page
        self.total = total
        self.calls: list[dict[str, str]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        self.calls.append(params)
        info = {**self.page["info"], "page": int(params["page"]), "size": 2, "total": self.total}
        return httpx.Response(200, json={**self.page, "info": info})


def make_client(api: FakeApi, cache_dir: Path | None = None) -> DiavgeiaClient:
    http = RateLimitedClient(
        "https://example.test/opendata",
        min_interval=0,
        timeout=5,
        user_agent="ixnos-data-test",
        transport=httpx.MockTransport(api),
    )
    return DiavgeiaClient(
        http, cache=RawPageCache(cache_dir) if cache_dir else None, today=lambda: TODAY
    )


def test_day_query_anchors_issue_window_to_the_day(load_fixture: LoadFixture) -> None:
    api = FakeApi(load_fixture("diavgeia/b-2-1_page.json"), total=2)
    day = date(2026, 9, 15)

    list(make_client(api).iter_day_pages(DecisionType.SPENDING_APPROVAL, day))

    assert api.calls == [
        {
            "type": "Β.2.1",
            "from_date": "2026-09-15",
            "to_date": "2026-09-16",
            "from_issue_date": (day + timedelta(days=2) - timedelta(days=180)).isoformat(),
            "page": "0",
            "size": "500",
        }
    ]


def test_pages_until_total_and_caches_by_slug(load_fixture: LoadFixture, tmp_path: Path) -> None:
    api = FakeApi(load_fixture("diavgeia/b-2-1_page.json"), total=5)
    day = date(2026, 9, 15)

    decisions = list(
        make_client(api, tmp_path).iter_decisions(DecisionType.SPENDING_APPROVAL, day, day)
    )

    assert [c["page"] for c in api.calls] == ["0", "1", "2"]
    assert len(decisions) == 6
    assert (tmp_path / "b-2-1" / "2026-09-15" / "page-0002.json.gz").exists()


def test_plan_covers_every_type_for_three_weeks() -> None:
    tasks = plan_pull([date(2026, 3, 23), date(2026, 6, 15), date(2026, 9, 14)])

    assert len(tasks) == 3 * 7 * len(DecisionType)
    assert {t.decision_type for t in tasks} == set(DecisionType)


def test_finds_ada_references_in_khmdhs_cache(load_fixture: LoadFixture, tmp_path: Path) -> None:
    cache = RawPageCache(tmp_path)
    cache.put("contract", date(2026, 9, 15), 0, load_fixture("khmdhs/contract_page.json"))

    references = list(khmdhs_ada_references(cache))

    by_raw = {r["raw"]: r["ada"] for r in references}
    assert by_raw["Ψ2ΤΗ46904Ε-ΡΡΓ"] == "Ψ2ΤΗ46904Ε-ΡΡΓ"
    assert by_raw["Δ/Α"] == ""
    assert all(r["field"] == "contractRelatedADA.number3" for r in references)
