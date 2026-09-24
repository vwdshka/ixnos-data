"""ΚΗΜΔΗΣ record -> ItemBundle. Pure: writing happens in db.store.

Source times are naive Greek local time. Titles are cut at 100 characters, so the line
items are kept as the description and searched too.
"""

from datetime import date, datetime
from typing import Any

from ixnos_data_pipeline.common.afm import clean_afm
from ixnos_data_pipeline.common.days import ATHENS
from ixnos_data_pipeline.common.greek_text import normalise, search_key
from ixnos_data_pipeline.db.bundles import ContractorRef, ItemBundle, LinkRef, OrganisationRef
from ixnos_data_pipeline.sources.diavgeia.ada import find_adas
from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.models import (
    Auction,
    Contract,
    KhmdhsRecord,
    Notice,
    ObjectDetail,
    Payment,
    ProcurementRequest,
)

SOURCE = "khmdhs"

ITEM_KIND = {
    RecordKind.REQUEST: "request",
    RecordKind.NOTICE: "notice",
    RecordKind.AUCTION: "award",
    RecordKind.CONTRACT: "contract",
    RecordKind.PAYMENT: "payment",
}


def transform(kind: RecordKind, raw: dict[str, Any]) -> ItemBundle:
    record = kind.model.model_validate(raw)
    title = " ".join(record.title.split())
    description = _description(record, title)
    amount = _amount(record)

    item = {
        "source": SOURCE,
        "source_id": record.reference_number,
        "kind": ITEM_KIND[kind],
        "title": title,
        "description": description,
        # Searchable but not shown: «ειδών πυρασφάλειας» is then found by «πυροσβεστήρες».
        "keywords": _cpv_labels(record),
        "text_normalised": normalise(f"{title} {description or ''}"),
        "search_key": search_key(title),
        "amount_eur": amount,
        "amount_with_vat_eur": _positive(record.total_cost_with_vat),
        "cpv_codes": list(dict.fromkeys(c.key for i in _items(record) for c in i.cpvs if c.key)),
        "nuts_code": _nuts(record),
        "organisation_id": record.organization.key if record.organization else None,
        "published_at": _aware(record.submission_date),
        "signed_on": _signed_on(record),
        "deadline_at": _aware(record.final_submission_date) if isinstance(record, Notice) else None,
        "starts_on": record.start_date if isinstance(record, Contract) else None,
        "ends_on": record.end_date if isinstance(record, Contract) else None,
        "cancelled": record.cancelled,
        "cancelled_on": record.cancellation_date,
        # For the procedure signals (ADR 0012): procedure and contract type keys, and the number
        # of offers when a contract reports it.
        "procedure_type": _key(raw.get("procedureType")),
        "contract_type": _key(raw.get("contractType")),
        "offers_received": _offers(raw.get("bidsSubmitted")),
        "source_updated_at": _aware(record.last_update_date),
        "raw": raw,
    }
    organisation = None
    if record.organization and record.organization.key:
        organisation = OrganisationRef(
            id=record.organization.key,
            name_el=" ".join((record.organization.value or record.organization.key).split()),
            tax_id=clean_afm(record.organization_vat_number),
        )
    links = [
        link
        for link in dict.fromkeys(_links(record))
        if link.to_source_id != record.reference_number
    ]
    return ItemBundle(item, organisation, _contractors(record), links)


def _key(code: Any) -> str | None:
    return str(code["key"]) if isinstance(code, dict) and code.get("key") else None


def _offers(value: Any) -> int | None:
    text = str(value).strip() if value is not None else ""
    return int(text) if text.isdigit() and len(text) <= 6 else None


def _items(record: KhmdhsRecord) -> list[ObjectDetail]:
    if isinstance(record, Auction | Contract):
        return list(record.object_details_list)
    if isinstance(record, Notice | ProcurementRequest | Payment):
        return list(record.object_details)
    return []


def _description(record: KhmdhsRecord, title: str) -> str | None:
    parts = dict.fromkeys(
        " ".join(item.short_description.split())
        for item in _items(record)
        if item.short_description and item.short_description.strip()
    )
    text = "\n".join(part for part in parts if part != title)
    return text or None


def _cpv_labels(record: KhmdhsRecord) -> str | None:
    labels = dict.fromkeys(cpv.value for item in _items(record) for cpv in item.cpvs if cpv.value)
    return "\n".join(labels) or None


def _nuts(record: KhmdhsRecord) -> str | None:
    """Where the work is done when the record says so, else the authority's address."""
    places = [kv.key for entry in record.nuts_codes for kv in entry.values() if kv.key]
    if places:
        return places[0]
    return record.nuts_code.key if record.nuts_code else None


def _positive(value: float | None) -> float | None:
    return value if value and value > 0 else None


def _amount(record: KhmdhsRecord) -> float | None:
    amount = _positive(record.total_cost_without_vat)
    if amount is None and isinstance(record, Auction):
        amount = _positive(record.budget)
    if amount is None and isinstance(record, Contract):
        amount = _positive(record.contract_budget)
    return amount


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=ATHENS)


def _signed_on(record: KhmdhsRecord) -> date | None:
    if isinstance(record, Contract):
        return record.contract_signed_date
    signed = getattr(record, "signed_date", None)
    return signed if isinstance(signed, date) else None


def _contractors(record: KhmdhsRecord) -> list[ContractorRef]:
    if isinstance(record, Auction | Contract) and record.contracting_data_details:
        winners = []
        for member in record.contracting_data_details.contracting_members_data_list:
            name = " ".join((member.name or "").split())
            if not name and not member.vat_number:
                continue
            extra = member.model_extra or {}
            country = (extra.get("country") or extra.get("installationCountry") or {}).get("key")
            winners.append(
                ContractorRef(clean_afm(member.vat_number), name or "?", country, "winner")
            )
        return winners
    if isinstance(record, Payment):
        payees: dict[tuple[str | None, str], float] = {}
        countries: dict[tuple[str | None, str], str | None] = {}
        for item in record.object_details:
            name = " ".join((item.name or "").split())
            if not name and not item.vat_no:
                continue
            key = (clean_afm(item.vat_no), name or "?")
            payees[key] = payees.get(key, 0.0) + (item.cost_without_vat or 0.0)
            countries[key] = ((item.model_extra or {}).get("country") or {}).get("key")
        return [
            ContractorRef(tax_id, name, countries[(tax_id, name)], "payee", amount or None)
            for (tax_id, name), amount in payees.items()
        ]
    return []


def _refs(relation: str, values: list[str]) -> list[LinkRef]:
    return [LinkRef(relation, SOURCE, v.strip()) for v in values if v and v.strip()]


def _decisions(relation: str, *texts: str | None) -> list[LinkRef]:
    return [LinkRef(relation, "diavgeia", ada) for text in texts for ada in find_adas(text)]


def _links(record: KhmdhsRecord) -> list[LinkRef]:
    links = _decisions("cancellation", record.cancellation_ada)
    if isinstance(record, ProcurementRequest):
        links += _refs("request", record.approval_ref_no)
        links += _refs("notice", record.notice_ref_no)
        links += _refs("award", record.auction_ref_no)
        links += _refs("contract", record.contract_ref_no)
        links += _refs("payment", record.payment_ref_no)
        links += _refs("previous", [record.previous_request_reference_number or ""])
    elif isinstance(record, Notice):
        links += _refs("request", [r.code for r in record.approved_requests])
        links += _refs("award", record.auction_ref_no)
        links += _refs("amends", [record.amended_notice_adam or ""])
    elif isinstance(record, Auction):
        links += _refs("request", [r.code for r in record.approved_requests_list])
        links += _refs("notice", record.notice_ref_no)
        links += _refs("contract", record.contract_ref_no)
        links += _refs("payment", record.payment_ref_no)
        links += _refs("amends", [record.amended_auction_adam or ""])
    elif isinstance(record, Contract):
        links += _refs("award", record.auction_ref_no)
        links += _refs("payment", record.payment_ref_no)
        links += _refs("previous", [record.prev_reference_no or ""])
        related = record.contract_related_ada
        links += _decisions(
            "decision",
            record.diavgeia_ada,
            *((related.number1, related.number2, related.number3) if related else ()),
        )
    elif isinstance(record, Payment):
        links += _refs("request", record.request_ref_no)
        links += _refs("award", record.auction_ref_no)
        links += _refs("contract", record.contract_ref_no)
        links += _decisions("decision", record.payment_related_ada)
    return links
