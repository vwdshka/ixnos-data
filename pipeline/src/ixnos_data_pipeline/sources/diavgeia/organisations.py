"""Loads the Διαύγεια organisation register, which ΚΗΜΔΗΣ shares IDs with.

    python -m ixnos_data_pipeline.sources.diavgeia.organisations [--file saved.json]

Two passes because the table references itself. Never overwrites the English name or NUTS
region, which we curate.
"""

import argparse
import gzip
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, bindparam, update
from sqlalchemy.dialects.postgresql import insert

from ixnos_data_pipeline.common.afm import clean_afm
from ixnos_data_pipeline.common.greek_text import fix_latin_lookalikes
from ixnos_data_pipeline.common.runs import track_run
from ixnos_data_pipeline.config import Settings
from ixnos_data_pipeline.db.engine import engine_from_settings
from ixnos_data_pipeline.db.tables import organisation
from ixnos_data_pipeline.sources.diavgeia.client import DiavgeiaClient

log = logging.getLogger(__name__)


def parse_register(payload: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    """Register entries as organisation rows. Parents that are missing from the register, or
    an organisation listed as its own parent, become None."""
    entries = payload.get("organizations", [])
    ids = {entry["uid"] for entry in entries}
    rows = []
    for entry in entries:
        parent = entry.get("supervisorId")
        rows.append({
            "id": entry["uid"],
            "name_el": fix_latin_lookalikes(" ".join(entry["label"].split())),
            "type": entry.get("category") or None,
            "tax_id": clean_afm(entry.get("vatNumber")),
            "parent_id": parent if parent in ids and parent != entry["uid"] else None,
            "website": (entry.get("website") or "").strip() or None,
            "updated_at": now,
        })  # fmt: skip
    return rows


def load_register(engine: Engine, rows: list[dict[str, Any]]) -> None:
    upsert = insert(organisation)
    upsert = upsert.on_conflict_do_update(
        index_elements=[organisation.c.id],
        set_={
            name: upsert.excluded[name]
            for name in ("name_el", "type", "tax_id", "website", "updated_at")
        },
    )
    set_parent = (
        update(organisation)
        .where(organisation.c.id == bindparam("row_id"))
        .values(parent_id=bindparam("row_parent_id"))
    )
    without_parents = [{k: v for k, v in row.items() if k != "parent_id"} for row in rows]
    parents = [{"row_id": row["id"], "row_parent_id": row["parent_id"]} for row in rows]
    with engine.begin() as connection:
        for start in range(0, len(rows), 1000):
            connection.execute(upsert, without_parents[start : start + 1000])
        connection.execute(set_parent, parents)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="load-organisations", description=__doc__)
    parser.add_argument(
        "--file", type=Path, help="saved organizations.json(.gz) instead of the API"
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    settings = Settings()
    engine = engine_from_settings(settings)
    with track_run(engine, "diavgeia", "organisations") as counts:
        if args.file:
            raw = args.file.read_bytes()
            payload = json.loads(gzip.decompress(raw) if args.file.suffix == ".gz" else raw)
        else:
            with DiavgeiaClient.from_settings(settings).http as http:
                payload = http.get_json("/organizations.json")
        rows = parse_register(payload, datetime.now(UTC))
        load_register(engine, rows)
        counts.fetched = counts.updated = len(rows)
        counts.details = {"without_valid_vat": sum(1 for r in rows if r["tax_id"] is None)}
    log.info("loaded %d organisations", len(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
