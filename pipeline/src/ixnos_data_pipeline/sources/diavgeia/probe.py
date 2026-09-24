"""One-off data check from Phase 0: pulls Διαύγεια decisions for the same weeks as the ΚΗΜΔΗΣ
probe, so the report can measure how the sources link. Rerunning resumes.

    python -m ixnos_data_pipeline.sources.diavgeia.probe run --out ../.data/diavgeia-probe \
        --khmdhs-cache ../.data/khmdhs-probe/raw
"""

import argparse
import gzip
import json
import logging
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.http import SourceHttpError
from ixnos_data_pipeline.config import Settings
from ixnos_data_pipeline.sources.diavgeia.ada import find_adas
from ixnos_data_pipeline.sources.diavgeia.client import DecisionType, DiavgeiaClient

log = logging.getLogger("ixnos_data_pipeline.probe")

SAMPLE_WEEKS = (date(2026, 3, 23), date(2026, 6, 15), date(2026, 9, 14))
ADA_SAMPLE_LIMIT = 150

# Where KHMDHS records mention Διαύγεια ΑΔΑ, as (cache kind, path through the record).
KHMDHS_ADA_FIELDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("contract", ("contractRelatedADA", "number1")),
    ("contract", ("contractRelatedADA", "number2")),
    ("contract", ("contractRelatedADA", "number3")),
    ("contract", ("diavgeiaADA",)),
    ("payment", ("paymentRelatedAda",)),
    ("notice", ("cancellationADA",)),
    ("auction", ("cancellationADA",)),
)


@dataclass(frozen=True)
class PullTask:
    decision_type: DecisionType
    day: date


def plan_pull(sample_weeks: Iterable[date]) -> list[PullTask]:
    return [
        PullTask(decision_type, monday + timedelta(days=offset))
        for monday in sample_weeks
        for offset in range(7)
        for decision_type in DecisionType
    ]


def run_pull(client: DiavgeiaClient, tasks: list[PullTask]) -> list[PullTask]:
    failed: list[PullTask] = []
    started = time.monotonic()
    for index, task in enumerate(tasks, start=1):
        pages = records = 0
        total = 0
        try:
            for day_page in client.iter_day_pages(task.decision_type, task.day):
                pages += 1
                records += len(day_page.page.decisions)
                total = day_page.page.info.total
        except SourceHttpError as exc:
            failed.append(task)
            log.error("%s %s failed after %d pages: %s", task.decision_type, task.day, pages, exc)
            continue
        if records != total:
            log.warning("%s %s: got %d of %d", task.decision_type, task.day, records, total)
        log.info(
            "[%d/%d] %s %s: %d decisions, %d pages, %d requests, %.0f min",
            index, len(tasks), task.decision_type, task.day, records, pages,
            client.http.requests_sent, (time.monotonic() - started) / 60,
        )  # fmt: skip
    return failed


def khmdhs_ada_references(khmdhs_cache: RawPageCache) -> Iterator[dict[str, str]]:
    """Every ΑΔΑ reference in cached KHMDHS records: one entry per ΑΔΑ found in a field,
    or a single entry with an empty "ada" when the field holds none."""
    for kind, path in KHMDHS_ADA_FIELDS:
        for _, page in khmdhs_cache.iter_pages(kind):
            for record in page["content"]:
                value: Any = record
                for key in path:
                    value = value.get(key) if isinstance(value, dict) else None
                if isinstance(value, str) and value.strip():
                    for ada in find_adas(value) or [""]:
                        yield {
                            "kind": kind,
                            "field": ".".join(path),
                            "reference_number": record["referenceNumber"],
                            "raw": value,
                            "ada": ada,
                        }


def check_ada_links(client: DiavgeiaClient, khmdhs_cache: RawPageCache) -> dict[str, Any]:
    """Resolves a spread of the valid ΑΔΑ that KHMDHS mentions, to learn which decision
    types they point to and whether they exist at all."""
    references = list(khmdhs_ada_references(khmdhs_cache))
    valid = [r for r in references if r["ada"]]
    step = max(1, len(valid) // ADA_SAMPLE_LIMIT)
    lookups = []
    for reference in valid[::step][:ADA_SAMPLE_LIMIT]:
        try:
            decision = client.decision(reference["ada"])
        except SourceHttpError as exc:
            lookups.append({**reference, "found": False, "error": str(exc)})
            continue
        lookups.append({
            **reference,
            "found": True,
            "decision_type": decision.get("decisionTypeId"),
            "organization_id": decision.get("organizationId"),
            "subject": decision.get("subject"),
        })  # fmt: skip
    log.info("ada links: %d references, %d valid, %d looked up", len(references), len(valid),
             len(lookups))  # fmt: skip
    return {"references": references, "lookups": lookups}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="diavgeia-probe", description=__doc__)
    parser.add_argument("command", choices=("run", "pull", "checks"))
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--khmdhs-cache", type=Path, required=True)
    args = parser.parse_args(argv)

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(out / "probe.log", "a", "utf-8")],
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)

    client = DiavgeiaClient.from_settings(Settings(raw_cache_dir=out / "raw"))
    checks_dir = out / "checks"
    checks_dir.mkdir(exist_ok=True)
    failed: list[PullTask] = []

    with client.http:
        if args.command in ("run", "pull"):
            tasks = plan_pull(SAMPLE_WEEKS)
            log.info("pull: %d day tasks", len(tasks))
            failed = run_pull(client, tasks)

        if args.command in ("run", "checks"):
            organizations = checks_dir / "organizations.json.gz"
            if not organizations.exists():
                payload = json.dumps(client.organizations(), ensure_ascii=False)
                organizations.write_bytes(gzip.compress(payload.encode("utf-8")))
                log.info("saved organisation register")
            # The ΑΔΑ check reads whatever KHMDHS has cached, so it reruns every time.
            links = check_ada_links(client, RawPageCache(args.khmdhs_cache))
            (checks_dir / "ada_links.json").write_text(
                json.dumps(links, ensure_ascii=False, indent=1), encoding="utf-8"
            )

    log.info("done: %d requests, %d retries, %d failed day tasks",
             client.http.requests_sent, client.http.retries, len(failed))  # fmt: skip
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
