"""One ingestion_run row per run.

The row is committed as "running" before any work starts, so a crash still leaves a failed
run behind for the alarms to see.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Engine, insert, update

from ixnos_data_pipeline.db.tables import ingestion_run


@dataclass
class RunCounts:
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    errors: int = 0
    details: dict[str, Any] = field(default_factory=dict)


def _now() -> datetime:
    return datetime.now(UTC)


@contextmanager
def track_run(
    engine: Engine, source: str, mode: str, *, clock: Callable[[], datetime] = _now
) -> Iterator[RunCounts]:
    """Records a run around the block; the block updates the yielded counts as it goes."""
    counts = RunCounts()
    with engine.begin() as connection:
        run_id = connection.execute(
            insert(ingestion_run)
            .values(
                source=source,
                mode=mode,
                status="running",
                started_at=clock(),
                fetched=0,
                inserted=0,
                updated=0,
                errors=0,
            )
            .returning(ingestion_run.c.id)
        ).scalar_one()

    try:
        yield counts
    except BaseException as exc:
        _finish(engine, run_id, counts, "failed", clock(), f"{type(exc).__name__}: {exc}")
        raise
    _finish(engine, run_id, counts, "succeeded", clock(), None)


def _finish(
    engine: Engine,
    run_id: int,
    counts: RunCounts,
    status: str,
    finished_at: datetime,
    error_message: str | None,
) -> None:
    with engine.begin() as connection:
        connection.execute(
            update(ingestion_run)
            .where(ingestion_run.c.id == run_id)
            .values(
                status=status,
                finished_at=finished_at,
                fetched=counts.fetched,
                inserted=counts.inserted,
                updated=counts.updated,
                errors=counts.errors,
                error_message=error_message,
                details=counts.details or None,
            )
        )
