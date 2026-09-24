import copy
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import Engine, func, select, text

from ixnos_data_pipeline.db.store import store_bundles
from ixnos_data_pipeline.db.tables import contractor, procurement_item
from ixnos_data_pipeline.sources.diavgeia import transform as diavgeia
from ixnos_data_pipeline.sources.diavgeia.ingest import mark_superseded
from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.transform import transform as khmdhs

LoadFixture = Callable[[str], Any]
NOW = datetime(2026, 9, 23, 9, 0, tzinfo=UTC)


@pytest.fixture
def empty(engine: Engine) -> Engine:
    with engine.begin() as connection:
        tables = "item_link, item_contractor, contractor, procurement_item, organisation"
        connection.execute(text(f"TRUNCATE {tables} CASCADE"))
    return engine


def payment(ada: str, payee_vat: str, corrects: str | None = None) -> dict[str, Any]:
    return {
        "ada": ada,
        "versionId": f"version-of-{ada}",
        "subject": "Πληρωμή προμηθευτή",
        "decisionTypeId": "Β.2.2",
        "organizationId": "99221070",
        "issueDate": 1789000000000,
        "submissionTimestamp": 1789100000000,
        "status": "PUBLISHED",
        "correctedVersionId": f"version-of-{corrects}" if corrects else None,
        "extraFieldValues": {
            "sponsor": [
                {
                    "sponsorAFMName": {"afm": payee_vat, "name": "ΠΡΟΜΗΘΕΥΤΗΣ"},
                    "expenseAmount": {"amount": 100.0},
                }
            ]
        },
    }


def store(engine: Engine, bundles: list[Any]) -> None:
    with engine.begin() as connection:
        store_bundles(connection, bundles, NOW)


def superseded_by(engine: Engine, ada: str) -> str | None:
    with engine.connect() as connection:
        value = connection.execute(
            select(procurement_item.c.superseded_by).where(procurement_item.c.source_id == ada)
        ).scalar_one()
        return str(value) if value else None


@pytest.mark.parametrize("correction_first", [False, True])
def test_a_correction_retires_the_decision_it_replaces(
    empty: Engine, correction_first: bool
) -> None:
    original = diavgeia.transform(payment("ΨΑΑΑ46ΜΤΛ6-ΑΑΑ", "094014201"))
    correction = diavgeia.transform(
        payment("ΨΒΒΒ46ΜΤΛ6-ΒΒΒ", "094014201", corrects="ΨΑΑΑ46ΜΤΛ6-ΑΑΑ")
    )
    for bundle in [correction, original] if correction_first else [original, correction]:
        store(empty, [bundle])

    assert mark_superseded(empty) == 1
    assert superseded_by(empty, "ΨΑΑΑ46ΜΤΛ6-ΑΑΑ") == "ΨΒΒΒ46ΜΤΛ6-ΒΒΒ"
    assert superseded_by(empty, "ΨΒΒΒ46ΜΤΛ6-ΒΒΒ") is None
    assert mark_superseded(empty) == 0  # idempotent


def test_a_payee_and_a_winner_with_one_vat_number_are_one_contractor(
    empty: Engine, load_fixture: LoadFixture
) -> None:
    award = copy.deepcopy(load_fixture("khmdhs/auction_page.json")["content"][0])
    members = award["contractingDataDetails"]["contractingMembersDataList"]
    members[0]["vatNumber"] = "094014201"  # a valid Greek VAT number
    winner = khmdhs(RecordKind.AUCTION, award).contractors[0]
    assert winner.tax_id == "094014201"

    store(empty, [khmdhs(RecordKind.AUCTION, award)])
    store(empty, [diavgeia.transform(payment("ΨΓΓΓ46ΜΤΛ6-ΓΓΓ", winner.tax_id))])

    with empty.connect() as connection:
        rows = connection.execute(
            select(func.count()).select_from(contractor).where(contractor.c.tax_id == winner.tax_id)
        ).scalar_one()
    assert rows == 1
