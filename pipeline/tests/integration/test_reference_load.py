from sqlalchemy import Engine, func, select, text

from ixnos_data_pipeline.db.tables import cpv_code, nuts_region
from ixnos_data_pipeline.reference.load import load_reference


def test_loads_every_code_with_parents(engine: Engine) -> None:
    counts = load_reference(engine)

    assert counts == {"cpv_code": 9454, "nuts_region": 70}
    with engine.connect() as connection:
        cleaning = connection.execute(select(cpv_code).where(cpv_code.c.code == "90911200-8")).one()
        ioannina = connection.execute(
            select(nuts_region).where(nuts_region.c.code == "EL543")
        ).one()
    assert cleaning.label_en == "Building-cleaning services"
    assert cleaning.parent_code == "90911000-6"
    assert ioannina.label_el == "Ιωάννινα"
    assert ioannina.parent_code == "EL54"


def test_loading_twice_changes_nothing(engine: Engine) -> None:
    load_reference(engine)
    load_reference(engine)

    with engine.connect() as connection:
        total = connection.execute(select(func.count()).select_from(cpv_code)).scalar_one()
        # Every CPV subtree resolves to one of the 45 divisions.
        orphans = connection.execute(
            text("SELECT count(*) FROM cpv_code WHERE parent_code IS NULL AND level <> 1")
        ).scalar_one()
    assert total == 9454
    assert orphans == 0
