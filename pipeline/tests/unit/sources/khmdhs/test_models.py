import re
from collections.abc import Callable
from datetime import date, datetime
from typing import Any

import pytest

from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.models import (
    Auction,
    Contract,
    Notice,
    Payment,
    ProcurementRequest,
)

LoadFixture = Callable[[str], Any]
CPV_CODE = re.compile(r"^\d{8}-\d$")


def first_record(load_fixture: LoadFixture, kind: str) -> Any:
    return load_fixture(f"khmdhs/{kind}_page.json")["content"][0]


@pytest.mark.parametrize("kind", list(RecordKind))
def test_every_fixture_record_parses(kind: RecordKind, load_fixture: LoadFixture) -> None:
    page = load_fixture(f"khmdhs/{kind.value}_page.json")

    records = [kind.model.model_validate(raw) for raw in page["content"]]

    assert records
    for record in records:
        assert kind.reference_prefix in record.reference_number
        assert isinstance(record.submission_date, datetime)


def test_request_keeps_cross_references(load_fixture: LoadFixture) -> None:
    first, second = (
        ProcurementRequest.model_validate(raw)
        for raw in load_fixture("khmdhs/request_page.json")["content"]
    )

    assert first.notice_ref_no == ["26PROC019787855"]
    assert first.previous_request_reference_number == "26REQ019787851"
    assert first.signed_date == date(2026, 7, 31)
    assert second.approval_ref_no == ["26REQ019805828", "26REQ019805825"]


def test_notice_parses_datetime_signed_date_as_date(load_fixture: LoadFixture) -> None:
    raw = first_record(load_fixture, "notice")
    assert "T" in raw["signedDate"]

    notice = Notice.model_validate(raw)

    assert type(notice.signed_date) is date
    assert notice.approved_requests
    assert CPV_CODE.match(notice.object_details[0].cpvs[0].key)


def test_auction_single_notice_ref_becomes_list(load_fixture: LoadFixture) -> None:
    raw = first_record(load_fixture, "auction")
    assert isinstance(raw["noticeRefNo"], str)

    auction = Auction.model_validate(raw)

    assert auction.notice_ref_no == [raw["noticeRefNo"]]
    assert auction.contracting_data_details is not None
    assert auction.contracting_data_details.contracting_members_data_list[0].vat_number


def test_contract_exposes_diavgeia_ada(load_fixture: LoadFixture) -> None:
    raw_with_ada, raw_placeholder = load_fixture("khmdhs/contract_page.json")["content"]

    with_ada = Contract.model_validate(raw_with_ada)
    placeholder = Contract.model_validate(raw_placeholder)

    assert with_ada.contract_related_ada is not None
    assert with_ada.contract_related_ada.number3 == "Ψ2ΤΗ46904Ε-ΡΡΓ"
    assert placeholder.contract_related_ada is not None
    assert placeholder.contract_related_ada.number3 == "Δ/Α"


def test_payment_line_items_carry_payee(load_fixture: LoadFixture) -> None:
    payment = Payment.model_validate(first_record(load_fixture, "payment"))

    assert payment.contract_ref_no
    assert payment.object_details[0].vat_no
    assert payment.object_details[0].cost_without_vat is not None


def test_unknown_fields_are_kept_as_extras(load_fixture: LoadFixture) -> None:
    notice = Notice.model_validate(first_record(load_fixture, "notice"))

    assert notice.model_extra is not None
    assert "offersValidTime" in notice.model_extra
