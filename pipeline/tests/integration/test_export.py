import csv
import gzip
import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, text

from ixnos_data_pipeline.db.store import store_bundles
from ixnos_data_pipeline.export import export
from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.transform import transform

LoadFixture = Callable[[str], Any]


def test_export_writes_every_record_without_contractors(
    engine: Engine, load_fixture: LoadFixture, tmp_path: Path
) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE item_link, item_contractor, contractor, procurement_item, organisation"
                " CASCADE"
            )
        )
        page = load_fixture("khmdhs/auction_page.json")["content"]
        store_bundles(
            connection, [transform(RecordKind.AUCTION, raw) for raw in page], datetime.now(UTC)
        )

    manifest = export(engine, tmp_path)

    assert manifest["records"] == len(page)
    with gzip.open(tmp_path / "records.csv.gz", "rt", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == len(page)
    assert "contractor" not in " ".join(rows[0])  # no contractor columns
    with gzip.open(tmp_path / "records.jsonl.gz", "rt", encoding="utf-8") as f:
        first = json.loads(f.readline())
    assert first["source"] == "khmdhs" and isinstance(first["cpv_codes"], list)
    assert not list(tmp_path.glob("*.tmp"))
