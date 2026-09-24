"""Command line entry point.

python -m ixnos_data_pipeline khmdhs hourly|nightly
python -m ixnos_data_pipeline khmdhs seed --cache ../.data/khmdhs-probe/raw
python -m ixnos_data_pipeline diavgeia hourly [--kinds Β.2.2]
"""

from __future__ import annotations

import argparse
import logging
from collections.abc import Callable, Iterable
from contextlib import nullcontext
from pathlib import Path
from typing import TYPE_CHECKING, Any, NamedTuple

if TYPE_CHECKING:
    from ixnos_data_pipeline.common.cache import RawPageCache
    from ixnos_data_pipeline.common.http import RateLimitedClient
    from ixnos_data_pipeline.config import Settings
    from ixnos_data_pipeline.db.bundles import ItemBundle

SOURCES = ("khmdhs", "diavgeia")
MODES = ("hourly", "nightly", "seed")

log = logging.getLogger(__name__)


class Job(NamedTuple):
    pages: Iterable[tuple[Any, list[dict[str, Any]]]]
    to_bundle: Callable[[Any, dict[str, Any]], ItemBundle]
    http: RateLimitedClient | None  # None when reading a cache


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ixnos-data-pipeline")
    parser.add_argument("source", choices=SOURCES)
    parser.add_argument("mode", choices=MODES)
    parser.add_argument("--cache", type=Path, help="raw page cache to read (seed mode)")
    parser.add_argument(
        "--kinds",
        help="ΚΗΜΔΗΣ kinds (default: notice,auction) or Διαύγεια types (default: all)",
        default=None,
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)

    if args.mode == "seed" and not args.cache:
        parser.error("seed needs --cache")
    return run(args.source, args.mode, args.cache, args.kinds)


def run(source: str, mode: str, cache_dir: Path | None, kinds: str | None) -> int:
    # Imported here so `--help` and argument errors need no database settings.
    from ixnos_data_pipeline.common.cache import RawPageCache
    from ixnos_data_pipeline.common.runs import track_run
    from ixnos_data_pipeline.config import Settings
    from ixnos_data_pipeline.db.engine import engine_from_settings
    from ixnos_data_pipeline.db.ingest import ingest_pages

    settings = Settings()
    engine = engine_from_settings(settings)
    cache = RawPageCache(cache_dir) if mode == "seed" and cache_dir else None
    job = (khmdhs_job if source == "khmdhs" else diavgeia_job)(settings, cache, mode, kinds)

    with track_run(engine, source, mode) as counts, job.http or nullcontext():
        ingest_pages(engine, job.pages, counts, job.to_bundle)
        if source == "diavgeia":
            from ixnos_data_pipeline.sources.diavgeia.ingest import mark_superseded

            counts.details["superseded"] = mark_superseded(engine)
    log.info(
        "done: %d fetched, %d inserted, %d updated, %d invalid",
        counts.fetched, counts.inserted, counts.updated, counts.errors,
    )  # fmt: skip
    return 0


def khmdhs_job(settings: Settings, cache: RawPageCache | None, mode: str, kinds: str | None) -> Job:
    from ixnos_data_pipeline.common.days import window
    from ixnos_data_pipeline.sources.khmdhs import ingest
    from ixnos_data_pipeline.sources.khmdhs.client import KhmdhsClient, RecordKind
    from ixnos_data_pipeline.sources.khmdhs.transform import transform

    selected = [RecordKind(k) for k in kinds.split(",")] if kinds else list(ingest.DEFAULT_KINDS)
    if cache:
        return Job(ingest.cache_pages(cache, selected), transform, None)
    client = KhmdhsClient.from_settings(settings)
    return Job(ingest.live_pages(client, selected, *window(mode)), transform, client.http)


def diavgeia_job(
    settings: Settings, cache: RawPageCache | None, mode: str, kinds: str | None
) -> Job:
    from ixnos_data_pipeline.common.days import window
    from ixnos_data_pipeline.sources.diavgeia import ingest
    from ixnos_data_pipeline.sources.diavgeia.client import DecisionType, DiavgeiaClient

    selected = [DecisionType(t) for t in kinds.split(",")] if kinds else list(DecisionType)
    if cache:
        return Job(ingest.cache_pages(cache, selected), ingest.to_bundle, None)
    client = DiavgeiaClient.from_settings(settings)
    return Job(ingest.live_pages(client, selected, *window(mode)), ingest.to_bundle, client.http)
