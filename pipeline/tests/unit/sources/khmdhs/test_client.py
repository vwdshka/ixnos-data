import json
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.http import RateLimitedClient
from ixnos_data_pipeline.sources.khmdhs.client import KhmdhsClient, RecordKind
from ixnos_data_pipeline.sources.khmdhs.models import Notice

LoadFixture = Callable[[str], Any]
TODAY = date(2026, 9, 22)


class FakeApi:
    """Serves `total_pages` pages built from one fixture record and records every call."""

    def __init__(self, record: dict[str, Any], total_pages: int) -> None:
        self.record = record
        self.total_pages = total_pages
        self.calls: list[tuple[str, int, dict[str, Any]]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        self.calls.append((request.url.path, page, json.loads(request.content)))
        return httpx.Response(
            200,
            json={
                "content": [self.record],
                "number": page,
                "size": 50,
                "totalElements": self.total_pages,
                "totalPages": self.total_pages,
                "last": page == self.total_pages - 1,
            },
        )


def make_client(
    api: Callable[[httpx.Request], httpx.Response], cache_dir: Path | None = None
) -> KhmdhsClient:
    http = RateLimitedClient(
        "https://example.test/khmdhs-opendata",
        min_interval=0,
        timeout=5,
        user_agent="ixnos-data-test",
        transport=httpx.MockTransport(api),
    )
    cache = RawPageCache(cache_dir) if cache_dir else None
    return KhmdhsClient(http, cache=cache, today=lambda: TODAY)


def fixture_record(load_fixture: LoadFixture, kind: str) -> dict[str, Any]:
    record: dict[str, Any] = load_fixture(f"khmdhs/{kind}_page.json")["content"][0]
    return record


def test_pages_through_a_day_until_last(load_fixture: LoadFixture) -> None:
    api = FakeApi(fixture_record(load_fixture, "notice"), total_pages=3)
    day = date(2026, 9, 15)

    records = list(make_client(api).iter_records(RecordKind.NOTICE, day, day))

    assert len(records) == 3
    assert all(isinstance(r, Notice) for r in records)
    assert [(path, page) for path, page, _ in api.calls] == [
        ("/khmdhs-opendata/notice", 0),
        ("/khmdhs-opendata/notice", 1),
        ("/khmdhs-opendata/notice", 2),
    ]
    assert api.calls[0][2] == {"dateFrom": "2026-09-15", "dateTo": "2026-09-15"}


def test_queries_one_day_at_a_time(load_fixture: LoadFixture) -> None:
    api = FakeApi(fixture_record(load_fixture, "notice"), total_pages=1)

    list(make_client(api).iter_raw(RecordKind.NOTICE, date(2026, 9, 14), date(2026, 9, 16)))

    assert [body["dateFrom"] for _, _, body in api.calls] == [
        "2026-09-14",
        "2026-09-15",
        "2026-09-16",
    ]


def test_request_endpoint_gets_required_flags(load_fixture: LoadFixture) -> None:
    api = FakeApi(fixture_record(load_fixture, "request"), total_pages=1)
    day = date(2026, 9, 15)

    list(make_client(api).iter_raw(RecordKind.REQUEST, day, day))

    body = api.calls[0][2]
    assert body["isInitial"] is False
    assert body["isApproved"] is False
    assert body["isApproval"] is False


def test_closed_days_are_served_from_cache(load_fixture: LoadFixture, tmp_path: Path) -> None:
    api = FakeApi(fixture_record(load_fixture, "notice"), total_pages=2)
    day = date(2026, 9, 15)

    first = list(make_client(api, tmp_path).iter_day_pages(RecordKind.NOTICE, day))
    second = list(make_client(api, tmp_path).iter_day_pages(RecordKind.NOTICE, day))

    assert len(api.calls) == 2
    assert not any(p.from_cache for p in first)
    assert all(p.from_cache for p in second)
    assert (tmp_path / "notice" / "2026-09-15" / "page-0001.json.gz").exists()
    cached_days = [day for day, _ in RawPageCache(tmp_path).iter_pages(RecordKind.NOTICE)]
    assert cached_days == [day, day]


def test_today_is_never_cached(load_fixture: LoadFixture, tmp_path: Path) -> None:
    api = FakeApi(fixture_record(load_fixture, "notice"), total_pages=1)

    list(make_client(api, tmp_path).iter_day_pages(RecordKind.NOTICE, TODAY))
    list(make_client(api, tmp_path).iter_day_pages(RecordKind.NOTICE, TODAY))

    assert len(api.calls) == 2
    assert not (tmp_path / "notice").exists()


def test_a_day_without_records_is_empty_not_an_error() -> None:
    # ΚΗΜΔΗΣ answers 404 for days with no records yet, such as today.
    def not_found(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    assert list(make_client(not_found).iter_records(RecordKind.NOTICE, TODAY, TODAY)) == []
