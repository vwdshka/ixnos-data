"""Which ΚΗΜΔΗΣ pages to read: live from the API, or every page in a raw cache."""

from collections.abc import Iterable, Iterator
from datetime import date
from typing import Any

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.days import each_day
from ixnos_data_pipeline.sources.khmdhs.client import KhmdhsClient, RecordKind

DEFAULT_KINDS = (RecordKind.NOTICE, RecordKind.AUCTION)

Page = tuple[RecordKind, list[dict[str, Any]]]


def cache_pages(cache: RawPageCache, kinds: Iterable[RecordKind]) -> Iterator[Page]:
    for kind in kinds:
        for _, page in cache.iter_pages(kind.value):
            yield kind, page["content"]


def live_pages(
    client: KhmdhsClient, kinds: Iterable[RecordKind], start: date, end: date
) -> Iterator[Page]:
    for kind in kinds:
        for day in each_day(start, end):
            for day_page in client.iter_day_pages(kind, day):
                yield kind, day_page.page.content
