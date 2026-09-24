import json
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import pytest

from ixnos_data_client import IxnosDataClient, IxnosDataError, models

CONTRACT = Path(__file__).parents[3] / "contracts" / "openapi" / "v1.json"


def page(total: int, count: int, start: int = 0) -> dict[str, Any]:
    items = [
        {"sourceId": f"26PROC{i:09d}", "title": "ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ", "kind": "notice"}
        for i in range(start, start + count)
    ]
    return {"total": total, "page": 1, "pageSize": 100, "mode": "text", "items": items}


def client(handler: Any, api_key: str | None = None) -> IxnosDataClient:
    return IxnosDataClient(
        "https://api.example.org", api_key, transport=httpx.MockTransport(handler)
    )


def test_search_sends_encoded_filters_and_the_api_key() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=page(1, 1))

    with client(handler, "ixn_test") as api:
        result = api.search(
            "φάρμακα", kind=["notice", "award"], min_amount=1500.5, date_from=date(2026, 1, 31)
        )

    request = seen[0]
    assert request.url.path == "/v1/search"
    assert request.url.params.get_list("kind") == ["notice", "award"]
    assert request.url.params["q"] == "φάρμακα"
    assert (request.url.params["minAmount"], request.url.params["from"]) == ("1500.5", "2026-01-31")
    assert request.headers["X-Api-Key"] == "ixn_test"
    assert result["items"][0]["title"] == "ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ"


def test_search_all_pages_until_the_last_result() -> None:
    pages = [page(250, 100), page(250, 100, 100), page(250, 50, 200)]
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.params["page"])
        return httpx.Response(200, json=pages[len(requested) - 1])

    with client(handler) as api:
        items = list(api.search_all(cpv="33"))

    assert len({item["sourceId"] for item in items}) == 250
    assert requested == ["1", "2", "3"]


def test_unknown_records_are_none_and_refusals_raise() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.startswith("/v1/items/"):
            assert request.url.raw_path == b"/v1/items/%CE%A8%CE%A0%CE%9B%CE%9746"
            return httpx.Response(404)
        return httpx.Response(400, json={"errors": {"kind": ["Unknown kind(s): tender."]}})

    with client(handler) as api:
        assert api.item("ΨΠΛΗ46") is None
        with pytest.raises(IxnosDataError) as refused:
            api.search(kind="tender")

    assert refused.value.status_code == 400
    assert "tender" in refused.value.body


@pytest.mark.parametrize(
    ("model", "schema"),
    [
        (models.ItemSummary, "ItemSummary"),
        (models.SearchResult, "SearchItemsResult"),
        (models.ItemDetail, "ItemDetail"),
        (models.ItemContractor, "ItemContractorView"),
        (models.ItemLink, "ItemLinkView"),
        (models.CodeLabel, "CodeLabel"),
        (models.OrganisationRef, "OrganisationRef"),
        (models.OrganisationDetail, "OrganisationDetail"),
        (models.YearSpend, "YearSpend"),
        (models.ContractorSpend, "ContractorSpend"),
        (models.DominantSupplier, "DominantSupplier"),
        (models.DataStatus, "DataStatus"),
        (models.SourceStatus, "SourceStatus"),
    ],
)
def test_models_match_the_api_contract(model: type, schema: str) -> None:
    """A property the API adds or renames fails here, so the client is updated with the API."""
    schemas = json.loads(CONTRACT.read_text(encoding="utf-8"))["components"]["schemas"]

    assert sorted(model.__annotations__) == sorted(schemas[schema]["properties"])
