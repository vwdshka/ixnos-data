from collections.abc import Iterator, Sequence
from datetime import date
from typing import Any, cast
from urllib.parse import quote

import httpx

from .models import CodeLabel, DataStatus, ItemDetail, ItemSummary, OrganisationDetail, SearchResult

PAGE_LIMIT = 10_000
MAX_PAGE_SIZE = 100


class IxnosDataError(Exception):
    """The API refused a request: 400 (invalid parameters; ``body`` names them), 429 (rate
    limit; retry after the Retry-After delay) or 503 (search too broad; add a filter)."""

    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"The ixnos-data API answered {status_code}.")
        self.status_code = status_code
        self.body = body


class IxnosDataClient:
    """The ixnos-data public API. Without an API key requests share the per-address limit; a free
    key (created on the account page) has its own.

    Use it as a context manager, or call ``close()``, to release the connection pool.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        *,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        headers = {"X-Api-Key": api_key} if api_key else {}
        self._http = httpx.Client(
            base_url=base_url, headers=headers, timeout=timeout, transport=transport
        )

    def __enter__(self) -> "IxnosDataClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    def search(
        self,
        q: str | None = None,
        *,
        kind: str | Sequence[str] | None = None,
        cpv: str | None = None,
        nuts: str | None = None,
        organisation: str | None = None,
        min_amount: float | None = None,
        max_amount: float | None = None,
        date_from: date | str | None = None,
        date_to: date | str | None = None,
        sort: str | None = None,
        signal: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> SearchResult:
        """One page of results. ``q`` may be Greek, Greeklish, an ΑΔΑΜ/ΑΔΑ or a VAT number; ``sort``
        is "relevance" (default), "newest", "deadline" or "amount"; ``signal`` is
        "single_offer" or "near_direct_award_limit"."""
        kinds = [kind] if isinstance(kind, str) else list(kind or [])
        params: list[tuple[str, str]] = [("kind", k) for k in kinds]
        for name, value in [
            ("q", q),
            ("cpv", cpv),
            ("nuts", nuts),
            ("organisation", organisation),
            ("minAmount", min_amount),
            ("maxAmount", max_amount),
            ("from", date_from),
            ("to", date_to),
            ("sort", sort),
            ("signal", signal),
            ("page", page),
            ("pageSize", page_size),
        ]:
            if value is not None and value != "":
                params.append((name, value.isoformat() if isinstance(value, date) else str(value)))
        return cast(SearchResult, self._get("/v1/search", params))

    def search_all(self, q: str | None = None, **filters: Any) -> Iterator[ItemSummary]:
        """Every result of a search, 100 per request, up to the API's limit of 10,000. Takes the
        same arguments as ``search`` except ``page`` and ``page_size``."""
        page = 1
        while True:
            result = self.search(q, page=page, page_size=MAX_PAGE_SIZE, **filters)
            yield from result["items"]
            if len(result["items"]) < MAX_PAGE_SIZE or page * MAX_PAGE_SIZE >= min(
                result["total"], PAGE_LIMIT
            ):
                return
            page += 1

    def item(self, source_id: str) -> ItemDetail | None:
        """A record by its ΑΔΑΜ (ΚΗΜΔΗΣ) or ΑΔΑ (Διαύγεια), or None."""
        return cast(ItemDetail | None, self._get(f"/v1/items/{quote(source_id, safe='')}"))

    def organisation(self, organisation_id: str) -> OrganisationDetail | None:
        """A contracting authority by id, or None."""
        path = f"/v1/organisations/{quote(organisation_id, safe='')}"
        return cast(OrganisationDetail | None, self._get(path))

    def find_cpv(self, q: str) -> list[CodeLabel]:
        """CPV codes matching a label (Greek or English) or a code prefix; at least 2 characters."""
        return cast(list[CodeLabel], self._get("/v1/cpv", [("q", q)]))

    def status(self) -> DataStatus:
        """When each source was last refreshed."""
        return cast(DataStatus, self._get("/v1/status"))

    def _get(self, path: str, params: list[tuple[str, str]] | None = None) -> Any:
        response = self._http.get(path, params=tuple(params or ()))
        if response.status_code == 404:
            return None
        if response.is_error:
            raise IxnosDataError(response.status_code, response.text)
        return response.json()
