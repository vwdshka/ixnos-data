"""ΚΗΜΔΗΣ open data client. Docs: https://cerpp.eprocurement.gov.gr/khmdhs-opendata/help

Search endpoints are POST /<kind>?page=N and return 50 records a page. dateFrom/dateTo
filter on when a record was entered, not when it was signed, which is what we want for
incremental runs.
"""

import logging
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from typing import Any

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.days import greek_today
from ixnos_data_pipeline.common.http import RateLimitedClient, SourceHttpError
from ixnos_data_pipeline.config import Settings
from ixnos_data_pipeline.sources.khmdhs.models import (
    AdamChain,
    Auction,
    Contract,
    KhmdhsRecord,
    Notice,
    Payment,
    ProcurementRequest,
    SearchPage,
)

log = logging.getLogger(__name__)


class RecordKind(StrEnum):
    REQUEST = "request"
    NOTICE = "notice"
    AUCTION = "auction"
    CONTRACT = "contract"
    PAYMENT = "payment"

    @property
    def model(self) -> type[KhmdhsRecord]:
        return _MODELS[self]

    @property
    def reference_prefix(self) -> str:
        """Middle part of the ΑΔΑΜ, e.g. 26PROC019787840 for a notice."""
        return _PREFIXES[self]


_MODELS: dict[RecordKind, type[KhmdhsRecord]] = {
    RecordKind.REQUEST: ProcurementRequest,
    RecordKind.NOTICE: Notice,
    RecordKind.AUCTION: Auction,
    RecordKind.CONTRACT: Contract,
    RecordKind.PAYMENT: Payment,
}

_PREFIXES = {
    RecordKind.REQUEST: "REQ",
    RecordKind.NOTICE: "PROC",
    RecordKind.AUCTION: "AWRD",
    RecordKind.CONTRACT: "SYMV",
    RecordKind.PAYMENT: "PAY",
}

# The request endpoint rejects criteria without these three flags. All false returned
# records in the probe; whether that means "no filter" is still to be confirmed.
_EXTRA_CRITERIA: dict[RecordKind, dict[str, Any]] = {
    RecordKind.REQUEST: {"isInitial": False, "isApproved": False, "isApproval": False},
}


@dataclass(frozen=True)
class DayPage:
    kind: RecordKind
    day: date
    page: SearchPage
    from_cache: bool


class KhmdhsClient:
    def __init__(
        self,
        http: RateLimitedClient,
        *,
        cache: RawPageCache | None = None,
        today: Callable[[], date] = greek_today,
    ) -> None:
        self._http = http
        self._cache = cache
        self._today = today

    @classmethod
    def from_settings(cls, settings: Settings) -> "KhmdhsClient":
        http = RateLimitedClient(
            settings.khmdhs_base_url,
            min_interval=settings.khmdhs_min_interval_seconds,
            timeout=settings.http_timeout_seconds,
            user_agent=settings.user_agent,
        )
        cache = RawPageCache(settings.raw_cache_dir) if settings.raw_cache_dir else None
        return cls(http, cache=cache)

    @property
    def http(self) -> RateLimitedClient:
        return self._http

    def search(self, kind: RecordKind, criteria: dict[str, Any], *, page: int = 0) -> SearchPage:
        body = {**_EXTRA_CRITERIA.get(kind, {}), **criteria}
        payload = self._http.post_json(f"/{kind.value}", params={"page": page}, json=body)
        return SearchPage.model_validate(payload)

    def fetch_day_page(self, kind: RecordKind, day: date, page: int) -> DayPage:
        """One page of records submitted on `day`. Pages of closed days come from the cache
        when one is configured; today's pages are always fetched because they still grow."""
        cache = self._cache if day < self._today() else None
        if cache is not None:
            cached = cache.get(kind, day, page)
            if cached is not None:
                return DayPage(kind, day, SearchPage.model_validate(cached), from_cache=True)

        body = {**_EXTRA_CRITERIA.get(kind, {}), **_day_criteria(day)}
        try:
            payload = self._http.post_json(f"/{kind.value}", params={"page": page}, json=body)
        except SourceHttpError as error:
            # ΚΗΜΔΗΣ answers 404, not an empty page, when a day has no records: always for the
            # current day (published the day after) and for days like Easter Sunday.
            if error.status_code != 404:
                raise
            payload = {
                "content": [],
                "number": page,
                "size": 0,
                "totalElements": 0,
                "totalPages": 0,
                "last": True,
            }
        search_page = SearchPage.model_validate(payload)
        if cache is not None:
            cache.put(kind, day, page, payload)
        return DayPage(kind, day, search_page, from_cache=False)

    def iter_day_pages(self, kind: RecordKind, day: date) -> Iterator[DayPage]:
        page = 0
        while True:
            day_page = self.fetch_day_page(kind, day, page)
            yield day_page
            if day_page.page.last or not day_page.page.content:
                return
            page += 1

    def iter_raw(self, kind: RecordKind, start: date, end: date) -> Iterator[dict[str, Any]]:
        """Raw records submitted from `start` to `end` inclusive, one day at a time so that
        page numbers stay small and a failed day can be retried on its own."""
        day = start
        while day <= end:
            for day_page in self.iter_day_pages(kind, day):
                yield from day_page.page.content
            day += timedelta(days=1)

    def iter_records(self, kind: RecordKind, start: date, end: date) -> Iterator[KhmdhsRecord]:
        model = kind.model
        for raw in self.iter_raw(kind, start, end):
            yield model.model_validate(raw)

    def adam_chain(self, reference_number: str) -> AdamChain:
        """All records linked to one ΑΔΑΜ (request → notice → award → contract → payment)."""
        return AdamChain.model_validate(self._http.get_json(f"/adamChain/{reference_number}"))


def _day_criteria(day: date) -> dict[str, str]:
    return {"dateFrom": day.isoformat(), "dateTo": day.isoformat()}
