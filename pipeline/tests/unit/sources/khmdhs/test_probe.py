from datetime import date

from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.probe import (
    FULL_KINDS,
    SAMPLE_KINDS,
    earliest_day,
    plan_pull,
)


def test_plan_puts_sample_weeks_first_then_full_kinds_newest_first() -> None:
    tasks = plan_pull(date(2026, 9, 10), date(2026, 9, 20), [date(2026, 9, 14)])

    sample, full = tasks[:21], tasks[21:]
    assert {t.kind for t in sample} == set(SAMPLE_KINDS)
    assert {t.day for t in sample} == {date(2026, 9, d) for d in range(14, 21)}
    assert {t.kind for t in full} == set(FULL_KINDS)
    assert full[0].day == date(2026, 9, 20)
    assert full[-1].day == date(2026, 9, 10)
    assert len(full) == 11 * len(FULL_KINDS)


def test_plan_clips_sample_weeks_to_window() -> None:
    tasks = plan_pull(date(2026, 9, 16), date(2026, 9, 17), [date(2026, 9, 14)])

    sample_days = {t.day for t in tasks if t.kind in SAMPLE_KINDS}
    assert sample_days == {date(2026, 9, 16), date(2026, 9, 17)}


def test_earliest_day_binary_search() -> None:
    first = date(2013, 7, 1)
    calls = 0

    def count(kind: RecordKind, start: date, end: date) -> int:
        nonlocal calls
        calls += 1
        return 1 if end >= first else 0

    assert earliest_day(RecordKind.NOTICE, date(2026, 9, 22), count) == first
    assert calls < 20


def test_earliest_day_none_when_no_records() -> None:
    assert earliest_day(RecordKind.NOTICE, date(2026, 9, 22), lambda *_: 0) is None
