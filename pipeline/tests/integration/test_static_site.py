import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, text

from ixnos_data_pipeline.db.store import store_bundles
from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.transform import transform
from ixnos_data_pipeline.static_site import ID_BUCKETS, build, fnv1a

LoadFixture = Callable[[str], Any]


def test_static_site_data_has_every_record_and_no_contractor_vat(
    engine: Engine, load_fixture: LoadFixture, tmp_path: Path
) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE item_link, item_contractor, contractor, procurement_item, organisation"
                " CASCADE"
            )
        )
        auctions = load_fixture("khmdhs/auction_page.json")["content"]
        payments = load_fixture("khmdhs/payment_page.json")["content"]
        store_bundles(
            connection,
            [transform(RecordKind.AUCTION, raw) for raw in auctions]
            + [transform(RecordKind.PAYMENT, raw) for raw in payments],
            datetime.now(UTC),
        )
        # The fixtures' VAT numbers are placeholders the pipeline rejects; give one contractor
        # a real-looking one, so the check below has something to find.
        connection.execute(
            text(
                "UPDATE contractor SET tax_id = '094014201'"
                " WHERE id = (SELECT min(id) FROM contractor)"
            )
        )
        vat_numbers = [
            row.tax_id
            for row in connection.execute(
                text("SELECT tax_id FROM contractor WHERE tax_id IS NOT NULL")
            )
        ]
        assert vat_numbers
        source_id: str = connection.execute(
            text("SELECT source_id FROM procurement_item LIMIT 1")
        ).scalar_one()

    out = tmp_path / "data"
    meta = build(engine, out, "https://example.org/ixnos-data")

    assert meta["count"] == len(auctions) + len(payments)
    rows = json.loads((out / "rows" / "0.json").read_text(encoding="utf-8"))
    details = json.loads((out / "details" / "0.json").read_text(encoding="utf-8"))
    assert len(rows) == len(details) == meta["count"]
    # Newest first, as the web app expects.
    published = [row[7] for row in rows]
    assert published == sorted(published, reverse=True)

    # Every record can be found by its identifier.
    bucket = json.loads(
        (out / "ids" / f"{fnv1a(source_id) % ID_BUCKETS}.json").read_text(encoding="utf-8")
    )
    assert rows[bucket[source_id]][0] == source_id

    # One column per filter: 4 bytes per record for amount and cpv, 2 for dates, region and
    # authority, 1 for kind and flags.
    widths = {"amount": 4, "cpv": 4, "published": 2, "deadline": 2, "nuts": 2, "org": 2}
    for name, width in {**widths, "kind": 1, "flags": 1}.items():
        assert (out / "attrs" / f"{name}.bin").stat().st_size == width * meta["count"]
    assert list((out / "index").glob("*.json"))
    assert (out / "feeds" / "all.xml").read_text(encoding="utf-8").startswith("<?xml")

    # The contractors' VAT numbers appear nowhere in what's published.
    published_text = "".join(
        path.read_text(encoding="utf-8")
        for path in out.rglob("*")
        if path.suffix in {".json", ".xml"}
    )
    for vat in vat_numbers:
        assert vat not in published_text
    assert not (tmp_path / "data.tmp").exists()
