"""One-off data check from Phase 0: pulls a sample into the raw cache and runs a few API
checks, to measure field coverage and history before designing the schema. Rerunning resumes.

    python -m ixnos_data_pipeline.sources.khmdhs.probe run --out ../.data/khmdhs-probe
"""

import argparse
import itertools
import json
import logging
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.http import SourceHttpError
from ixnos_data_pipeline.config import Settings
from ixnos_data_pipeline.sources.khmdhs.client import KhmdhsClient, RecordKind

log = logging.getLogger("ixnos_data_pipeline.probe")

# Notices and awards drive alerts and "who won what", so they are pulled for every day.
FULL_KINDS = (RecordKind.NOTICE, RecordKind.AUCTION)
# The other kinds are measured on sample weeks only, to keep the pull under ~10 hours.
SAMPLE_KINDS = (RecordKind.REQUEST, RecordKind.CONTRACT, RecordKind.PAYMENT)

DEFAULT_START = date(2026, 3, 22)
DEFAULT_END = date(2026, 9, 21)
DEFAULT_SAMPLE_WEEKS = (date(2026, 3, 23), date(2026, 6, 15), date(2026, 9, 14))

HISTORY_EPOCH = date(2000, 1, 1)
REQUEST_FLAGS = ("isInitial", "isApproved", "isApproval")

CountFn = Callable[[RecordKind, date, date], int]


@dataclass(frozen=True)
class PullTask:
    kind: RecordKind
    day: date


def plan_pull(start: date, end: date, sample_weeks: Iterable[date]) -> list[PullTask]:
    """Sample weeks first (short, and they give early results), then the full kinds from
    the newest day backwards."""
    tasks: list[PullTask] = []
    for monday in sample_weeks:
        for offset in range(7):
            day = monday + timedelta(days=offset)
            if start <= day <= end:
                tasks.extend(PullTask(kind, day) for kind in SAMPLE_KINDS)
    day = end
    while day >= start:
        tasks.extend(PullTask(kind, day) for kind in FULL_KINDS)
        day -= timedelta(days=1)
    return tasks


def run_pull(client: KhmdhsClient, tasks: list[PullTask]) -> list[PullTask]:
    """Fetches every task's pages into the cache. Returns the tasks that failed."""
    failed: list[PullTask] = []
    started = time.monotonic()
    for index, task in enumerate(tasks, start=1):
        pages = records = cached = 0
        try:
            for day_page in client.iter_day_pages(task.kind, task.day):
                pages += 1
                records += len(day_page.page.content)
                cached += day_page.from_cache
        except SourceHttpError as exc:
            failed.append(task)
            log.error("%s %s failed after %d pages: %s", task.kind, task.day, pages, exc)
            continue
        log.info(
            "[%d/%d] %s %s: %d records, %d pages (%d cached), %d requests, %.0f min",
            index, len(tasks), task.kind, task.day, records, pages, cached,
            client.http.requests_sent, (time.monotonic() - started) / 60,
        )  # fmt: skip
    return failed


def earliest_day(kind: RecordKind, today: date, count: CountFn) -> date | None:
    """Binary search for the first submission day with records, assuming none before
    HISTORY_EPOCH. About 14 requests per kind."""
    if count(kind, HISTORY_EPOCH, today) == 0:
        return None
    low, high = HISTORY_EPOCH, today
    while low < high:
        mid = low + (high - low) // 2
        if count(kind, HISTORY_EPOCH, mid) > 0:
            high = mid
        else:
            low = mid + timedelta(days=1)
    return low


def check_history(client: KhmdhsClient, today: date) -> dict[str, Any]:
    def count(kind: RecordKind, start: date, end: date) -> int:
        criteria = {"dateFrom": start.isoformat(), "dateTo": end.isoformat()}
        return client.search(kind, criteria).total_elements

    result: dict[str, Any] = {}
    for kind in RecordKind:
        first = earliest_day(kind, today, count)
        result[kind.value] = {
            "earliest_submission_day": first.isoformat() if first else None,
            "total_to_date": count(kind, HISTORY_EPOCH, today),
        }
        log.info("history %s: %s", kind, result[kind.value])
    return result


def check_request_flags(client: KhmdhsClient, day: date) -> dict[str, Any]:
    """Totals for one day under every combination of the three mandatory request flags,
    to learn whether all-false means 'no filter'."""
    result: dict[str, Any] = {"day": day.isoformat(), "totals": {}}
    for values in itertools.product((False, True), repeat=len(REQUEST_FLAGS)):
        flags = dict(zip(REQUEST_FLAGS, values, strict=True))
        criteria = {"dateFrom": day.isoformat(), "dateTo": day.isoformat(), **flags}
        total = client.search(RecordKind.REQUEST, criteria).total_elements
        key = ",".join(f"{name}={value}" for name, value in flags.items())
        result["totals"][key] = total
        log.info("request flags %s: %d", key, total)
    return result


def check_adam_chains(client: KhmdhsClient, cache: RawPageCache, limit: int) -> dict[str, Any]:
    """ΑΔΑΜ chains for a spread of awards, stored next to the refs the award itself carries,
    so the report can compare the two."""
    awards = [
        record
        for _, page in cache.iter_pages(RecordKind.AUCTION)
        for record in page["content"]
        if record.get("noticeRefNo") or record.get("contractRefNo")
    ]
    step = max(1, len(awards) // limit)
    result: dict[str, Any] = {}
    for record in awards[::step][:limit]:
        ref = record["referenceNumber"]
        chain = client.adam_chain(ref)
        result[ref] = {
            "record": {
                "noticeRefNo": record.get("noticeRefNo"),
                "contractRefNo": record.get("contractRefNo"),
                "paymentRefNo": record.get("paymentRefNo"),
                "approvedRequestsList": record.get("approvedRequestsList"),
            },
            "chain": chain.model_dump(),
        }
    log.info("adam chains: %d awards checked", len(result))
    return result


def run_checks(client: KhmdhsClient, cache: RawPageCache, out: Path, today: date) -> None:
    checks: dict[str, Callable[[], dict[str, Any]]] = {
        "history": lambda: check_history(client, today),
        "request_flags": lambda: check_request_flags(client, date(2026, 9, 15)),
        "adam_chains": lambda: check_adam_chains(client, cache, limit=100),
    }
    checks_dir = out / "checks"
    checks_dir.mkdir(parents=True, exist_ok=True)
    for name, check in checks.items():
        path = checks_dir / f"{name}.json"
        if path.exists():
            log.info("check %s already done", name)
            continue
        try:
            result = check()
        except SourceHttpError as exc:
            log.error("check %s failed: %s", name, exc)
            continue
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="khmdhs-probe", description=__doc__)
    parser.add_argument("command", choices=("run", "pull", "checks"))
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--start", type=date.fromisoformat, default=DEFAULT_START)
    parser.add_argument("--end", type=date.fromisoformat, default=DEFAULT_END)
    args = parser.parse_args(argv)

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(out / "probe.log", "a", "utf-8")],
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)

    settings = Settings(raw_cache_dir=out / "raw")
    client = KhmdhsClient.from_settings(settings)
    cache = RawPageCache(out / "raw")
    failed: list[PullTask] = []

    with client.http:
        if args.command in ("run", "pull"):
            tasks = plan_pull(args.start, args.end, DEFAULT_SAMPLE_WEEKS)
            log.info("pull: %d day tasks from %s to %s", len(tasks), args.start, args.end)
            failed = run_pull(client, tasks)
        if args.command in ("run", "checks"):
            run_checks(client, cache, out, today=args.end + timedelta(days=1))

    log.info(
        "done: %d requests, %d retries, %d failed day tasks%s",
        client.http.requests_sent, client.http.retries, len(failed),
        " (rerun the same command to retry them)" if failed else "",
    )  # fmt: skip
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
