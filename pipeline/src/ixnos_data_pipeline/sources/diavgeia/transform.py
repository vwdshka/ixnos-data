"""Διαύγεια decision -> ItemBundle, same shape as the ΚΗΜΔΗΣ transform.

Amounts go in amount_with_vat_eur only. Διαύγεια totals include VAT and its awards repeat
ΚΗΜΔΗΣ ones, so leaving amount_eur empty keeps the money from being counted twice.
Withheld payees (private individuals) are skipped.
"""

from typing import Any

from ixnos_data_pipeline.common.afm import clean_afm
from ixnos_data_pipeline.common.days import ATHENS
from ixnos_data_pipeline.common.greek_text import normalise, search_key
from ixnos_data_pipeline.db.bundles import ContractorRef, ItemBundle, LinkRef, OrganisationRef
from ixnos_data_pipeline.sources.diavgeia.ada import normalise_ada
from ixnos_data_pipeline.sources.diavgeia.client import DecisionType
from ixnos_data_pipeline.sources.diavgeia.models import Decision

SOURCE = "diavgeia"

ITEM_KIND = {
    DecisionType.COMMITMENT: "commitment",
    DecisionType.SPENDING_APPROVAL: "spending_approval",
    DecisionType.PAYMENT: "payment",
    DecisionType.AWARD: "award",
    DecisionType.FINAL_AWARD: "final_award",
}

# Which extra field holds references to which kind of earlier decision.
RELATED = {
    "relatedAnalipsiYpoxreosis": "commitment",
    "relatedEkgrisiDapanis": "spending_approval",
    "relatedDecisions": "decision",
}


def transform(raw: dict[str, Any]) -> ItemBundle:
    decision = Decision.model_validate(raw)
    kind = ITEM_KIND[DecisionType(decision.decision_type_id)]
    title = " ".join(decision.subject.split())
    extra = decision.extra_field_values
    cpv = extra.get("cpv")

    item = {
        "source": SOURCE,
        "source_id": decision.ada,
        "kind": kind,
        "title": title,
        "description": None,
        "keywords": None,
        "text_normalised": normalise(title),
        "search_key": search_key(title),
        "amount_eur": None,
        "amount_with_vat_eur": _amount(decision),
        "cpv_codes": [c for c in cpv if isinstance(c, str)] if isinstance(cpv, list) else [],
        "nuts_code": None,
        "organisation_id": decision.organization_id,
        "published_at": decision.submission_timestamp.astimezone(ATHENS),
        "signed_on": decision.issue_date.astimezone(ATHENS).date(),
        "deadline_at": None,
        "starts_on": None,
        "ends_on": None,
        "cancelled": decision.status not in (None, "PUBLISHED"),
        "cancelled_on": None,
        "procedure_type": None,
        "contract_type": None,
        "offers_received": None,
        "source_updated_at": None,
        "raw": raw,
    }
    org = decision.org
    organisation = OrganisationRef(
        decision.organization_id,
        (org.name if org and org.name else decision.organization_id),
        clean_afm(org.afm) if org else None,
    )
    return ItemBundle(item, organisation, _contractors(decision), _links(decision))


def _amount(decision: Decision) -> float | None:
    extra = decision.extra_field_values
    if decision.sponsors:
        total = sum((s.expense_amount.amount or 0.0) for s in decision.sponsors if s.expense_amount)
    else:
        field = extra.get("amountWithVAT") or extra.get("awardAmount") or {}
        total = field.get("amount") or 0.0
    return total if total > 0 else None


def _person_name(name: str) -> str:
    """ "SURNAME,,FIRST,FATHER" -> "SURNAME FIRST": the father's name adds nothing public."""
    parts = [p.strip() for p in name.split(",")]
    if len(parts) >= 3 and parts[1] == "":
        return f"{parts[0]} {parts[2]}".strip()
    return " ".join(name.split())


def _contractors(decision: Decision) -> list[ContractorRef]:
    # One payee can appear on several budget lines; their amounts add up.
    payees: dict[tuple[str | None, str], float] = {}
    for sponsor in decision.sponsors:
        party = sponsor.sponsor_afm_name
        if party is None or not (party.name or party.afm):
            continue  # withheld payee
        key = (clean_afm(party.afm), " ".join((party.name or "?").split()))
        payees[key] = payees.get(key, 0.0) + (
            sponsor.expense_amount.amount or 0.0 if sponsor.expense_amount else 0.0
        )
    contractors = [
        ContractorRef(tax_id, name, "EL", "payee", amount or None)
        for (tax_id, name), amount in payees.items()
    ]
    for person in decision.extra_field_values.get("person") or []:
        if person.get("name") or person.get("afm"):
            name = _person_name(person.get("name") or "?")
            contractors.append(ContractorRef(clean_afm(person.get("afm")), name, "EL", "winner"))
    return contractors


def _links(decision: Decision) -> list[LinkRef]:
    links = []
    for field, relation in RELATED.items():
        for entry in decision.extra_field_values.get(field) or []:
            for value in entry.values() if isinstance(entry, dict) else []:
                if ada := normalise_ada(value if isinstance(value, str) else None):
                    links.append(LinkRef(relation, SOURCE, ada))
    # Corrections name the replaced decision by version UUID, not ΑΔΑ: see mark_superseded.
    return list(dict.fromkeys(links))
