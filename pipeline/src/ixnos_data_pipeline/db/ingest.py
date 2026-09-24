"""Pages of raw source records -> bundles -> stored, one transaction per page. Shared by every
source; each passes its own transform."""

import logging
from collections import Counter
from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy import Engine

from ixnos_data_pipeline.common.runs import RunCounts
from ixnos_data_pipeline.db.bundles import ItemBundle
from ixnos_data_pipeline.db.store import store_bundles

log = logging.getLogger(__name__)

# (what the page holds, e.g. a ΚΗΜΔΗΣ kind or a Διαύγεια decision type; its raw records)
Page = tuple[Any, list[dict[str, Any]]]


def ingest_pages(
    engine: Engine,
    pages: Iterable[Page],
    counts: RunCounts,
    to_bundle: Callable[[Any, dict[str, Any]], ItemBundle],
) -> None:
    per_kind: Counter[str] = Counter()
    for kind, records in pages:
        bundles = []
        for raw in records:
            counts.fetched += 1
            try:
                bundles.append(to_bundle(kind, raw))
            except ValidationError as exc:
                counts.errors += 1
                record_id = raw.get("referenceNumber") or raw.get("ada")
                log.warning("%s %s invalid: %s", kind, record_id, exc.errors()[0])
        with engine.begin() as connection:
            stored = store_bundles(connection, bundles, datetime.now(UTC))
        counts.inserted += stored.inserted
        counts.updated += stored.updated
        per_kind[str(kind)] += len(records)
        if counts.fetched % 5000 < len(records):
            log.info(
                "%d fetched, %d inserted, %d updated",
                counts.fetched,
                counts.inserted,
                counts.updated,
            )
    counts.details = {"per_kind": dict(per_kind)}
