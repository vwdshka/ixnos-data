"""Loads the CPV and NUTS tables from the seed files. Safe to rerun.

python -m ixnos_data_pipeline.reference.load
"""

import csv
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, Table
from sqlalchemy.dialects.postgresql import insert

from ixnos_data_pipeline.config import Settings
from ixnos_data_pipeline.db.engine import engine_from_settings
from ixnos_data_pipeline.db.tables import cpv_code, nuts_region

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
SEEDS: tuple[tuple[Table, str], ...] = (
    (cpv_code, "cpv_2008.csv"),
    (nuts_region, "nuts_2024_el.csv"),
)


def read_seed(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8", newline="") as handle:
        rows = [
            {**row, "parent_code": row["parent_code"] or None, "level": int(row["level"])}
            for row in csv.DictReader(handle)
        ]
    return sorted(rows, key=lambda row: row["level"])


def upsert(engine: Engine, table: Table, rows: list[dict[str, Any]]) -> int:
    statement = insert(table)
    statement = statement.on_conflict_do_update(
        index_elements=[table.c.code],
        set_={
            name: statement.excluded[name]
            for name in ("parent_code", "level", "label_el", "label_en")
        },
    )
    with engine.begin() as connection:
        for start in range(0, len(rows), 1000):
            connection.execute(statement, rows[start : start + 1000])
    return len(rows)


def load_reference(engine: Engine, data_dir: Path = DATA_DIR) -> dict[str, int]:
    return {table.name: upsert(engine, table, read_seed(data_dir / name)) for table, name in SEEDS}


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    counts = load_reference(engine_from_settings(Settings()))
    log.info("reference data loaded: %s", counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
