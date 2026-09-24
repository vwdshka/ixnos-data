"""The API's JSON as typed dictionaries. Amounts are euros: ΚΗΜΔΗΣ states them without VAT
(``amountEur``), Διαύγεια with VAT (``amountWithVatEur``). Dates are ISO 8601 strings."""

from typing import TypedDict


class OrganisationRef(TypedDict):
    id: str
    name: str


class CodeLabel(TypedDict):
    code: str
    labelEl: str | None
    labelEn: str | None


class ItemSummary(TypedDict):
    sourceId: str
    source: str
    kind: str
    title: str
    organisation: OrganisationRef | None
    amountEur: float | None
    publishedAt: str
    deadlineAt: str | None
    nutsCode: str | None
    cpvCodes: list[str]
    cancelled: bool
    amountWithVatEur: float | None
    signals: list[str] | None
    amountImplausible: bool


class SearchResult(TypedDict):
    """A page of results. ``total`` stops at 10,000 (``totalCapped``)."""

    total: int
    page: int
    pageSize: int
    mode: str
    items: list[ItemSummary]
    totalCapped: bool


class ItemContractor(TypedDict):
    """A contractor on a record. VAT numbers are never included."""

    name: str
    role: str
    amountEur: float | None
    countryCode: str | None


class ItemLink(TypedDict):
    relation: str
    source: str
    sourceId: str
    kind: str | None
    title: str | None


class ItemDetail(TypedDict):
    sourceId: str
    source: str
    kind: str
    title: str
    description: str | None
    organisation: OrganisationRef | None
    amountEur: float | None
    amountWithVatEur: float | None
    publishedAt: str
    signedOn: str | None
    deadlineAt: str | None
    startsOn: str | None
    endsOn: str | None
    cancelled: bool
    cancelledOn: str | None
    cpv: list[CodeLabel]
    nuts: CodeLabel | None
    contractors: list[ItemContractor]
    links: list[ItemLink]
    documentUrl: str | None
    supersededBy: str | None
    procedure: str | None
    offersReceived: int | None
    signals: list[str] | None
    amountImplausible: bool


class YearSpend(TypedDict):
    year: int
    awards: int
    amountEur: float
    approvedEur: float
    paidEur: float


class ContractorSpend(TypedDict):
    name: str
    awards: int
    amountEur: float
    paidEur: float


class DominantSupplier(TypedDict):
    name: str
    share: float
    awards: int
    totalAwards: int


class OrganisationDetail(TypedDict):
    id: str
    nameEl: str
    nameEn: str | None
    type: str | None
    taxId: str | None
    parent: OrganisationRef | None
    website: str | None
    itemCounts: dict[str, int]
    awardedLast12MonthsEur: float | None
    paidLast12MonthsEur: float | None
    awardedByYear: list[YearSpend]
    topContractors: list[ContractorSpend]
    recentItems: list[ItemSummary]
    dominantSupplier: DominantSupplier | None


class SourceStatus(TypedDict):
    source: str
    updatedAt: str | None


class DataStatus(TypedDict):
    updatedAt: str | None
    sources: list[SourceStatus]
