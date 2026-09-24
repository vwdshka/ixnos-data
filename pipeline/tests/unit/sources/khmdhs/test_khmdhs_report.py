from collections import Counter
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.probe_stats import distribution, per_day_summary
from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.report import collect, link_resolution, render, summarise

LoadFixture = Callable[[str], Any]


def cache_with_fixtures(load_fixture: LoadFixture, root: Path) -> RawPageCache:
    cache = RawPageCache(root)
    for kind in RecordKind:
        cache.put(kind.value, date(2026, 9, 15), 0, load_fixture(f"khmdhs/{kind.value}_page.json"))
    return cache


def test_collect_counts_coverage(load_fixture: LoadFixture, tmp_path: Path) -> None:
    stats = collect(cache_with_fixtures(load_fixture, tmp_path))

    contract = stats["contract"]
    assert contract.records == 2
    assert contract.invalid == 0
    assert contract.derived["has CPV"] == 2
    assert contract.derived["has valid Διαύγεια ΑΔΑ"] == 1
    assert contract.ada_raw_values["Δ/Α"] == 1


def test_link_resolution_reports_each_direction(load_fixture: LoadFixture, tmp_path: Path) -> None:
    rows = link_resolution(collect(cache_with_fixtures(load_fixture, tmp_path)))

    directions = {(r["from"], r["to"]) for r in rows}
    assert ("auction", "notice") in directions
    assert all(0 <= r["resolved"] <= r["unique"] for r in rows)


def test_report_renders(load_fixture: LoadFixture, tmp_path: Path) -> None:
    summary = summarise(collect(cache_with_fixtures(load_fixture, tmp_path)), tmp_path)

    report = render(summary)

    assert "# KHMDHS data verification report" in report
    assert "| notice |" in report


def test_distribution_and_per_day() -> None:
    assert distribution([]) == {"count": 0}
    assert distribution([1, 2, 3, 4, 5])["median"] == 3
    per_day = per_day_summary(Counter({date(2026, 9, 14): 10, date(2026, 9, 19): 2}))  # Mon, Sat
    assert per_day == {"days": 2, "weekday_mean": 10, "weekday_max": 10, "weekend_mean": 2}
