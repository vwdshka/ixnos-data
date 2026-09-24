"""Small helpers for the data verification reports: fill rates, distributions, markdown."""

import re
import statistics
from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import date
from pathlib import Path
from typing import Any

_RETRY_LINE = re.compile(r"WARNING \w+ \S+: (.+?), retry \d+/\d+")


def is_filled(value: Any) -> bool:
    return value not in (None, "", [], {})


def pct(part: int, whole: int) -> str:
    return f"{100 * part / whole:.1f}%" if whole else "n/a"


def distribution(values: Sequence[float]) -> dict[str, float | int]:
    """Count, median and 10th/90th percentiles, rounded for reading."""
    if not values:
        return {"count": 0}
    ordered = sorted(values)
    if len(ordered) == 1:
        p10 = p90 = ordered[0]
    else:
        deciles = statistics.quantiles(ordered, n=10, method="inclusive")
        p10, p90 = deciles[0], deciles[-1]
    return {
        "count": len(ordered),
        "p10": round(p10, 1),
        "median": round(statistics.median(ordered), 1),
        "p90": round(p90, 1),
        "max": round(ordered[-1], 1),
    }


def per_day_summary(per_day: Counter[date]) -> dict[str, float | int]:
    """Records per weekday and per weekend day, over the days that were pulled."""
    weekdays = [n for d, n in per_day.items() if d.weekday() < 5]
    weekends = [n for d, n in per_day.items() if d.weekday() >= 5]
    return {
        "days": len(per_day),
        "weekday_mean": round(statistics.mean(weekdays)) if weekdays else 0,
        "weekday_max": max(weekdays, default=0),
        "weekend_mean": round(statistics.mean(weekends)) if weekends else 0,
    }


def retry_reasons(log_file: Path) -> Counter[str]:
    """Why requests were retried, from a probe log ("HTTP 429", "ReadTimeout", ...)."""
    reasons: Counter[str] = Counter()
    if log_file.exists():
        for line in log_file.read_text(encoding="utf-8").splitlines():
            match = _RETRY_LINE.search(line)
            if match:
                reasons[match.group(1)] += 1
    return reasons


def md_table(headers: Sequence[str], rows: Iterable[Sequence[Any]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + " --- |" * len(headers)]
    lines += ["| " + " | ".join(str(cell) for cell in row) + " |" for row in rows]
    return "\n".join(lines)
