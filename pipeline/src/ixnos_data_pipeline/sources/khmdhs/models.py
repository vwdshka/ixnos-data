"""Pydantic models of ΚΗΜΔΗΣ responses, written from real data because the OpenAPI spec
just says "object".

Dates come as either YYYY-MM-DD or naive local datetimes, and the same reference can be a
string on one record type and a list on another.
"""

from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field
from pydantic.alias_generators import to_camel


def _to_date(value: Any) -> Any:
    if isinstance(value, str):
        return value[:10]
    return value


def _to_list(value: Any) -> Any:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return [value]
    return value


LooseDate = Annotated[date, BeforeValidator(_to_date)]
RefList = Annotated[list[str], BeforeValidator(_to_list)]


class _Model(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="allow", frozen=True
    )


class KeyValue(_Model):
    key: str
    value: str | None = None


class ContractingData(_Model):
    units_operator: KeyValue | None = None
    signers: KeyValue | None = None


class ContractingMember(_Model):
    vat_number: str | None = None
    greek_vat_number: bool | None = None
    name: str | None = None


class ContractingDataDetails(ContractingData):
    contracting_members_data_list: list[ContractingMember] = Field(default_factory=list)


class ObjectDetail(_Model):
    """One line item: what is bought, how much, and its CPV codes."""

    quantity: float | None = None
    type: KeyValue | None = None
    cost_without_vat: float | None = Field(default=None, alias="costWithoutVAT")
    vat: str | None = None
    currency: KeyValue | None = None
    short_description: str | None = None
    cpvs: list[KeyValue] = Field(default_factory=list)


class PaymentObjectDetail(ObjectDetail):
    """Payment line items also carry the payee."""

    vat_no: str | None = None
    greek_vat_no: bool | None = None
    name: str | None = None


class ApprovedRequestRef(_Model):
    code: str


class ContractRelatedAda(_Model):
    """Up to three Diavgeia ADA references; free text, may hold placeholders like 'Δ/Α'."""

    number1: str | None = None
    number2: str | None = None
    number3: str | None = None


class KhmdhsRecord(_Model):
    reference_number: str
    title: str
    submission_date: datetime
    last_update_date: datetime | None = None
    cancelled: bool = False
    cancellation_date: LooseDate | None = None
    cancellation_reason: str | None = None
    cancellation_ada: str | None = Field(default=None, alias="cancellationADA")
    organization: KeyValue | None = None
    organization_vat_number: str | None = None
    # The contracting authority's address region. Notices and contracts also list the place of
    # performance in nuts_codes, which differs on about 15% of notices.
    nuts_code: KeyValue | None = None
    nuts_codes: list[dict[str, KeyValue]] = Field(default_factory=list)
    aaht: str | None = None
    total_cost_with_vat: float | None = Field(default=None, alias="totalCostWithVAT")
    total_cost_without_vat: float | None = Field(default=None, alias="totalCostWithoutVAT")


class ProcurementRequest(KhmdhsRecord):
    """Αίτημα: a request to procure, before any tender (ref prefix REQ)."""

    signed_date: LooseDate | None = None
    procurement_delivery_date: LooseDate | None = None
    approved: bool | None = None
    pre_approval: bool | None = None
    previous_request_reference_number: str | None = None
    contract_types: list[dict[str, KeyValue]] = Field(default_factory=list)
    object_details: list[ObjectDetail] = Field(default_factory=list)
    approval_ref_no: RefList = Field(default_factory=list)
    notice_ref_no: RefList = Field(default_factory=list)
    auction_ref_no: RefList = Field(default_factory=list)
    contract_ref_no: RefList = Field(default_factory=list)
    payment_ref_no: RefList = Field(default_factory=list)


class Notice(KhmdhsRecord):
    """Πρόσκληση / Προκήρυξη / Διακήρυξη: a call for tenders (ref prefix PROC)."""

    signed_date: LooseDate | None = None
    final_submission_date: datetime | None = None
    notice_type: KeyValue | None = None
    type_of_procedure: KeyValue | None = None
    contract_type: KeyValue | None = None
    nuts_city: str | None = None
    nuts_postal_code: str | None = None
    contracting_data: ContractingData | None = None
    object_details: list[ObjectDetail] = Field(default_factory=list)
    approved_requests: list[ApprovedRequestRef] = Field(default_factory=list)
    amended_notice_adam: str | None = Field(default=None, alias="amendedNoticeADAM")
    auction_ref_no: RefList = Field(default_factory=list)


class Auction(KhmdhsRecord):
    """Ανάθεση: an award decision naming the winning contractor(s) (ref prefix AWRD)."""

    signed_date: LooseDate | None = None
    procedure_type: KeyValue | None = None
    contract_type: KeyValue | None = None
    budget: float | None = None
    nuts_city: str | None = None
    nuts_postal_code: str | None = None
    contracting_data: ContractingData | None = None
    contracting_data_details: ContractingDataDetails | None = None
    object_details_list: list[ObjectDetail] = Field(default_factory=list)
    approved_requests_list: list[ApprovedRequestRef] = Field(default_factory=list)
    amended_auction_adam: str | None = Field(default=None, alias="amendedAuctionADAM")
    notice_ref_no: RefList = Field(default_factory=list)
    contract_ref_no: RefList = Field(default_factory=list)
    payment_ref_no: RefList = Field(default_factory=list)


class Contract(KhmdhsRecord):
    """Σύμβαση: a signed contract (ref prefix SYMV)."""

    contract_signed_date: LooseDate | None = None
    start_date: LooseDate | None = None
    end_date: LooseDate | None = None
    no_end_date: bool | None = None
    contract_number: str | None = None
    contract_budget: float | None = None
    procedure_type: KeyValue | None = None
    contract_type: KeyValue | None = None
    nuts_city: str | None = None
    nuts_postal_code: str | None = None
    contracting_data_details: ContractingDataDetails | None = None
    object_details_list: list[ObjectDetail] = Field(default_factory=list)
    contract_related_ada: ContractRelatedAda | None = Field(
        default=None, alias="contractRelatedADA"
    )
    diavgeia_ada: str | None = Field(default=None, alias="diavgeiaADA")
    prev_reference_no: str | None = None
    auction_ref_no: RefList = Field(default_factory=list)
    payment_ref_no: RefList = Field(default_factory=list)


class Payment(KhmdhsRecord):
    """Εντολή πληρωμής: a payment order (ref prefix PAY)."""

    signed_date: LooseDate | None = None
    credit: bool | None = None
    contract_type: KeyValue | None = None
    payment_related_ada: str | None = None
    contracting_data: ContractingData | None = None
    object_details: list[PaymentObjectDetail] = Field(default_factory=list)
    request_ref_no: RefList = Field(default_factory=list)
    auction_ref_no: RefList = Field(default_factory=list)
    contract_ref_no: RefList = Field(default_factory=list)


class SearchPage(_Model):
    """Spring Data page. Content stays raw."""

    content: list[dict[str, Any]]
    number: int
    size: int
    total_elements: int
    total_pages: int
    last: bool


class AdamChain(_Model):
    requests: list[str] = Field(default_factory=list)
    approved_requests: list[str] = Field(default_factory=list)
    notices: list[str] = Field(default_factory=list)
    auctions: list[str] = Field(default_factory=list)
    contracts: list[str] = Field(default_factory=list)
    payments: list[str] = Field(default_factory=list)
