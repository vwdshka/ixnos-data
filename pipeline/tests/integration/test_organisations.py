from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Engine, select, text, update

from ixnos_data_pipeline.db.tables import organisation
from ixnos_data_pipeline.sources.diavgeia.organisations import load_register, parse_register

LoadFixture = Callable[[str], Any]
NOW = datetime(2026, 9, 22, 23, 0, tzinfo=UTC)


def test_parse_cleans_parents_and_vat(load_fixture: LoadFixture) -> None:
    rows = {r["id"]: r for r in parse_register(load_fixture("diavgeia/organizations.json"), NOW)}

    assert rows["6235"]["parent_id"] == "5008"  # parent in the register
    assert rows["99221105"]["parent_id"] is None  # parent missing from the register
    assert rows["55016"]["parent_id"] is None  # listed as its own parent
    assert rows["6235"]["tax_id"] == "090114939"
    assert rows["55016"]["tax_id"] is None  # placeholder 123456789
    assert rows["50019"]["tax_id"] is None  # ten digits


def test_load_is_idempotent_and_keeps_curated_fields(
    engine: Engine, load_fixture: LoadFixture
) -> None:
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE organisation CASCADE"))
    rows = parse_register(load_fixture("diavgeia/organizations.json"), NOW)

    load_register(engine, rows)
    with engine.begin() as connection:
        connection.execute(
            update(organisation)
            .where(organisation.c.id == "6235")
            .values(name_en="Municipality of Paxoi")
        )
    load_register(engine, rows)

    with engine.connect() as connection:
        paxoi = connection.execute(select(organisation).where(organisation.c.id == "6235")).one()
        total = connection.execute(text("SELECT count(*) FROM organisation")).scalar_one()
    assert total == len(rows)
    assert paxoi.parent_id == "5008"
    assert paxoi.name_en == "Municipality of Paxoi"
