"""Source-neutral rows produced by every source's transform and written by `db.store`."""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class OrganisationRef:
    id: str
    name_el: str
    tax_id: str | None


@dataclass(frozen=True)
class ContractorRef:
    tax_id: str | None
    name: str
    country_code: str | None
    role: str  # "winner" or "payee"
    amount_eur: float | None = None


@dataclass(frozen=True)
class LinkRef:
    relation: str
    to_source: str
    to_source_id: str


@dataclass
class ItemBundle:
    item: dict[str, Any]
    organisation: OrganisationRef | None
    contractors: list[ContractorRef] = field(default_factory=list)
    links: list[LinkRef] = field(default_factory=list)
