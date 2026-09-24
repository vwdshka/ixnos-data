"""Which Διαύγεια pages to read, and retiring corrected decisions after a run."""

from collections.abc import Iterable, Iterator
from datetime import date
from typing import Any

from sqlalchemy import Engine, text

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.days import each_day
from ixnos_data_pipeline.db.bundles import ItemBundle
from ixnos_data_pipeline.sources.diavgeia.client import DecisionType, DiavgeiaClient
from ixnos_data_pipeline.sources.diavgeia.transform import transform

Page = tuple[DecisionType, list[dict[str, Any]]]


def to_bundle(_: DecisionType, raw: dict[str, Any]) -> ItemBundle:
    return transform(raw)


def cache_pages(cache: RawPageCache, types: Iterable[DecisionType]) -> Iterator[Page]:
    for decision_type in types:
        for _, page in cache.iter_pages(decision_type.slug):
            yield decision_type, page["decisions"]


def live_pages(
    client: DiavgeiaClient, types: Iterable[DecisionType], start: date, end: date
) -> Iterator[Page]:
    for decision_type in types:
        for day in each_day(start, end):
            for day_page in client.iter_day_pages(decision_type, day):
                yield decision_type, day_page.page.decisions


def mark_superseded(engine: Engine) -> int:
    """Marks decisions replaced by a correction («ορθή επανάληψη») and returns how many changed.

    A correction gets its own ΑΔΑ and points at the old decision's versionId, not its ΑΔΑ.
    This scans the whole table, so it works whichever of the two arrives first.
    """
    with engine.begin() as connection:
        updated = connection.execute(
            text(
                """
                UPDATE procurement_item old SET superseded_by = new.source_id
                FROM procurement_item new
                WHERE new.source = 'diavgeia' AND old.source = 'diavgeia'
                  AND new.raw->>'correctedVersionId' IS NOT NULL
                  AND old.raw->>'versionId' = new.raw->>'correctedVersionId'
                  AND old.superseded_by IS DISTINCT FROM new.source_id
                """
            )
        )
    return updated.rowcount
