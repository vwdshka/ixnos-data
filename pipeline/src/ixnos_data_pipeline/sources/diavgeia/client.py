"""Διαύγεια OpenData client. Docs: https://diavgeia.gov.gr/api/help

Things the docs don't tell you:
- from_date/to_date are both midnight, so one day is [day, day + 1).
- Every search is also capped to a 180-day issueDate window, so each query sets the window
  to end after its day. Decisions issued long before they were submitted fall outside it
  (well under 1%).
- Pages are capped at 500 whatever size you ask for.
"""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from typing import Any

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.days import greek_today
from ixnos_data_pipeline.common.http import RateLimitedClient
from ixnos_data_pipeline.config import Settings
from ixnos_data_pipeline.sources.diavgeia.models import Decision, SearchPage

PAGE_SIZE = 500
ISSUE_DATE_WINDOW = timedelta(days=180)


class DecisionType(StrEnum):
    # KHMDHS contracts reference these by ΑΔΑ, and Β.2.1 approvals point back at them.
    COMMITMENT = "Β.1.3"  # ΑΝΑΛΗΨΗ ΥΠΟΧΡΕΩΣΗΣ
    SPENDING_APPROVAL = "Β.2.1"  # ΕΓΚΡΙΣΗ ΔΑΠΑΝΗΣ
    PAYMENT = "Β.2.2"  # ΟΡΙΣΤΙΚΟΠΟΙΗΣΗ ΠΛΗΡΩΜΗΣ
    AWARD = "Δ.1"  # ΑΝΑΘΕΣΗ ΕΡΓΩΝ / ΠΡΟΜΗΘΕΙΩΝ / ΥΠΗΡΕΣΙΩΝ / ΜΕΛΕΤΩΝ
    FINAL_AWARD = "Δ.2.2"  # ΚΑΤΑΚΥΡΩΣΗ

    @property
    def slug(self) -> str:
        """ASCII name for cache directories, e.g. "b-2-1"."""
        latin = self.value.replace("Β", "b").replace("Δ", "d")
        return latin.replace(".", "-")


@dataclass(frozen=True)
class DayPage:
    decision_type: DecisionType
    day: date
    page: SearchPage
    from_cache: bool


class DiavgeiaClient:
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
    def from_settings(cls, settings: Settings) -> "DiavgeiaClient":
        http = RateLimitedClient(
            settings.diavgeia_base_url,
            min_interval=settings.diavgeia_min_interval_seconds,
            timeout=settings.http_timeout_seconds,
            user_agent=settings.user_agent,
        )
        cache = RawPageCache(settings.raw_cache_dir) if settings.raw_cache_dir else None
        return cls(http, cache=cache)

    @property
    def http(self) -> RateLimitedClient:
        return self._http

    def fetch_day_page(self, decision_type: DecisionType, day: date, page: int) -> DayPage:
        """One page of decisions of one type submitted on `day`. Closed days are cached."""
        cache = self._cache if day < self._today() else None
        if cache is not None:
            cached = cache.get(decision_type.slug, day, page)
            if cached is not None:
                return DayPage(
                    decision_type, day, SearchPage.model_validate(cached), from_cache=True
                )

        payload = self._http.get_json("/search.json", params=_day_params(decision_type, day, page))
        search_page = SearchPage.model_validate(payload)
        if cache is not None:
            cache.put(decision_type.slug, day, page, payload)
        return DayPage(decision_type, day, search_page, from_cache=False)

    def iter_day_pages(self, decision_type: DecisionType, day: date) -> Iterator[DayPage]:
        page = 0
        while True:
            day_page = self.fetch_day_page(decision_type, day, page)
            yield day_page
            if day_page.page.is_last:
                return
            page += 1

    def iter_decisions(
        self, decision_type: DecisionType, start: date, end: date
    ) -> Iterator[Decision]:
        day = start
        while day <= end:
            for day_page in self.iter_day_pages(decision_type, day):
                for raw in day_page.page.decisions:
                    yield Decision.model_validate(raw)
            day += timedelta(days=1)

    def decision(self, ada: str) -> dict[str, Any]:
        payload: dict[str, Any] = self._http.get_json(f"/decisions/{ada}.json")
        return payload

    def organizations(self) -> dict[str, Any]:
        """Every organisation (about 5,400) with its VAT number and parent. Slow: ~2.5 MB."""
        payload: dict[str, Any] = self._http.get_json("/organizations.json")
        return payload


def _day_params(decision_type: DecisionType, day: date, page: int) -> dict[str, str | int]:
    # The issue-date window ends two days after `day`, clear of any timezone rounding.
    window_start = day + timedelta(days=2) - ISSUE_DATE_WINDOW
    return {
        "type": decision_type.value,
        "from_date": day.isoformat(),
        "to_date": (day + timedelta(days=1)).isoformat(),
        "from_issue_date": window_start.isoformat(),
        "page": page,
        "size": PAGE_SIZE,
    }
