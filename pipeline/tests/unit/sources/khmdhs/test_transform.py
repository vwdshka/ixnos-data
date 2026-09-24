from collections.abc import Callable
from datetime import date
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from ixnos_data_pipeline.db.bundles import ItemBundle, LinkRef
from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.transform import transform

LoadFixture = Callable[[str], Any]
ATHENS = ZoneInfo("Europe/Athens")


def bundles(load_fixture: LoadFixture, kind: RecordKind) -> list[ItemBundle]:
    page = load_fixture(f"khmdhs/{kind.value}_page.json")
    return [transform(kind, raw) for raw in page["content"]]


@pytest.mark.parametrize("kind", list(RecordKind))
def test_every_fixture_transforms(kind: RecordKind, load_fixture: LoadFixture) -> None:
    for bundle in bundles(load_fixture, kind):
        item = bundle.item
        assert item["source"] == "khmdhs"
        assert item["published_at"].tzinfo == ATHENS
        assert item["cpv_codes"]
        assert item["text_normalised"] == item["text_normalised"].lower()
        assert item["search_key"]
        assert item["raw"]["referenceNumber"] == item["source_id"]
        assert bundle.organisation is not None
        assert all(link.to_source_id != item["source_id"] for link in bundle.links)


def test_notice(load_fixture: LoadFixture) -> None:
    bundle = bundles(load_fixture, RecordKind.NOTICE)[0]

    assert bundle.item["kind"] == "notice"
    assert bundle.item["deadline_at"].tzinfo == ATHENS
    assert isinstance(bundle.item["signed_on"], date)
    assert any(link.relation == "request" for link in bundle.links)


def test_region_is_the_place_of_work_when_given(load_fixture: LoadFixture) -> None:
    raw = load_fixture("khmdhs/notice_page.json")["content"][0]
    raw["nutsCode"] = {"key": "EL307", "value": "Πειραιάς, Νήσοι"}
    raw["nutsCodes"] = [{"nutsCode": {"key": "EL543", "value": "Ιωάννινα"}}]
    assert transform(RecordKind.NOTICE, raw).item["nuts_code"] == "EL543"

    raw["nutsCodes"] = []
    assert transform(RecordKind.NOTICE, raw).item["nuts_code"] == "EL307"


def test_award_links_and_winner(load_fixture: LoadFixture) -> None:
    raw = load_fixture("khmdhs/auction_page.json")["content"][0]
    bundle = transform(RecordKind.AUCTION, raw)

    assert bundle.item["kind"] == "award"
    assert LinkRef("notice", "khmdhs", raw["noticeRefNo"]) in bundle.links
    assert LinkRef("contract", "khmdhs", raw["contractRefNo"][0]) in bundle.links
    winner = bundle.contractors[0]
    assert winner.role == "winner"
    assert winner.name == "ΑΝΑΔΟΧΟΣ 1"
    assert winner.tax_id is None  # fixture VAT numbers are placeholders that fail the check digit


def test_contract_links_to_diavgeia_decisions(load_fixture: LoadFixture) -> None:
    with_ada, placeholder = bundles(load_fixture, RecordKind.CONTRACT)

    assert LinkRef("decision", "diavgeia", "Ψ2ΤΗ46904Ε-ΡΡΓ") in with_ada.links
    assert not any(link.to_source == "diavgeia" for link in placeholder.links)  # "Δ/Α"
    assert with_ada.item["starts_on"] is not None


def test_payment_payees_carry_amounts(load_fixture: LoadFixture) -> None:
    bundle = bundles(load_fixture, RecordKind.PAYMENT)[0]

    assert bundle.contractors
    assert all(c.role == "payee" for c in bundle.contractors)
    assert sum(c.amount_eur or 0 for c in bundle.contractors) > 0


def test_description_holds_line_items_but_not_a_copy_of_the_title(
    load_fixture: LoadFixture,
) -> None:
    for kind in RecordKind:
        for bundle in bundles(load_fixture, kind):
            description = bundle.item["description"]
            if description:
                assert bundle.item["title"] not in description.split("\n")


def test_procedure_contract_type_and_offers(load_fixture: LoadFixture) -> None:
    raw = load_fixture("khmdhs/contract_page.json")["content"][0]
    raw["procedureType"] = {"key": "1", "value": "Ανοικτή"}
    raw["contractType"] = {"key": "10", "value": "Έργα"}
    raw["bidsSubmitted"] = "1"
    item = transform(RecordKind.CONTRACT, raw).item
    assert (item["procedure_type"], item["contract_type"], item["offers_received"]) == (
        "1",
        "10",
        1,
    )

    raw["bidsSubmitted"] = "δύο"  # free text in the source: not a count
    assert transform(RecordKind.CONTRACT, raw).item["offers_received"] is None
