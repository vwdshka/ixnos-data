from datetime import UTC, datetime

import pytest
from sqlalchemy import Engine, inspect, select

from ixnos_data_pipeline.common.runs import track_run
from ixnos_data_pipeline.db.tables import ingestion_run, metadata


@pytest.mark.parametrize("table", sorted(metadata.tables))
def test_python_tables_match_the_migrated_schema(engine: Engine, table: str) -> None:
    """Fails when an EF migration changes a table and db/tables.py has not followed."""
    database = {c["name"]: c["nullable"] for c in inspect(engine).get_columns(table)}
    python = {c.name: c.nullable for c in metadata.tables[table].columns}

    assert python == database


def test_successful_run_is_recorded(clean_engine: Engine) -> None:
    started = datetime(2026, 9, 22, 12, 0, tzinfo=UTC)

    with track_run(clean_engine, "khmdhs", "hourly", clock=lambda: started) as counts:
        counts.fetched = 120
        counts.inserted = 100
        counts.updated = 20
        counts.details = {"notice": 50, "auction": 70}

    with clean_engine.connect() as connection:
        row = connection.execute(select(ingestion_run)).one()
    assert row.status == "succeeded"
    assert (row.fetched, row.inserted, row.updated, row.errors) == (120, 100, 20, 0)
    assert row.details == {"notice": 50, "auction": 70}
    assert row.started_at == started
    assert row.finished_at is not None
    assert row.error_message is None


def test_failed_run_is_recorded_and_the_error_propagates(clean_engine: Engine) -> None:
    with pytest.raises(RuntimeError), track_run(clean_engine, "khmdhs", "hourly") as counts:
        counts.fetched = 10
        raise RuntimeError("KHMDHS returned 503 five times")

    with clean_engine.connect() as connection:
        row = connection.execute(select(ingestion_run)).one()
    assert row.status == "failed"
    assert row.fetched == 10
    assert row.error_message == "RuntimeError: KHMDHS returned 503 five times"


def test_run_is_visible_as_running_while_in_progress(clean_engine: Engine) -> None:
    with track_run(clean_engine, "diavgeia", "nightly"), clean_engine.connect() as connection:
        status = connection.execute(select(ingestion_run.c.status)).scalar_one()

    assert status == "running"
