from datetime import date

import pytest

from ixnos_data_pipeline.common.days import each_day, window


def test_hourly_rereads_yesterday_and_nightly_the_last_week() -> None:
    today = date(2026, 9, 23)
    assert window("hourly", today) == (date(2026, 9, 22), today)
    assert window("nightly", today) == (date(2026, 9, 16), today)
    with pytest.raises(ValueError):
        window("seed", today)


def test_each_day_includes_both_ends() -> None:
    assert list(each_day(date(2026, 2, 27), date(2026, 3, 1))) == [
        date(2026, 2, 27),
        date(2026, 2, 28),
        date(2026, 3, 1),
    ]
    assert list(each_day(date(2026, 3, 2), date(2026, 3, 1))) == []
