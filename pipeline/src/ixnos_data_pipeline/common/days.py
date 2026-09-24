"""Days in Greek time, which is what both sources publish by."""

from collections.abc import Iterator
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

ATHENS = ZoneInfo("Europe/Athens")
NIGHTLY_DAYS = 7


def greek_today() -> date:
    return datetime.now(ATHENS).date()


def window(mode: str, today: date | None = None) -> tuple[date, date]:
    """Hourly runs re-read yesterday (today keeps growing); nightly runs re-read the last
    week for late corrections and cancellations."""
    today = today or greek_today()
    if mode == "hourly":
        return today - timedelta(days=1), today
    if mode == "nightly":
        return today - timedelta(days=NIGHTLY_DAYS), today
    raise ValueError(f"no live window for mode {mode!r}")


def each_day(start: date, end: date) -> Iterator[date]:
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)
