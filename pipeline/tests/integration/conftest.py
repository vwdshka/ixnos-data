"""A throwaway PostgreSQL 16 with the real schema, for tests that touch the database.

The schema comes from contracts/db/schema.sql, generated from the EF Core migrations by
scripts/generate-contracts.sh, so these tests run against exactly what production has.
Needs Docker; skipped when Docker is not reachable.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text

SCHEMA_SQL = Path(__file__).parents[3] / "contracts" / "db" / "schema.sql"


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    try:
        from testcontainers.community.postgres import PostgresContainer

        container = PostgresContainer("postgres:16-alpine", driver="psycopg")
        container.start()
    except Exception as exc:  # Docker missing or not running
        pytest.skip(f"PostgreSQL container unavailable: {exc}")

    try:
        engine = create_engine(container.get_connection_url())
        with engine.begin() as connection:
            connection.exec_driver_sql(SCHEMA_SQL.read_text(encoding="utf-8"))
        yield engine
        engine.dispose()
    finally:
        container.stop()


@pytest.fixture
def clean_engine(engine: Engine) -> Engine:
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE ingestion_run RESTART IDENTITY"))
    return engine
