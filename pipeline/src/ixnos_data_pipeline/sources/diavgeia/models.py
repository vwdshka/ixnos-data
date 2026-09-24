"""Pydantic models of Διαύγεια responses. Timestamps are epoch milliseconds; the
type-specific bits live in extraFieldValues and only the parts we use are typed.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Model(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="allow", frozen=True
    )


class Amount(_Model):
    amount: float | None = None
    currency: str | None = None


class Party(_Model):
    afm: str | None = None
    afm_type: str | None = None
    name: str | None = None


class Sponsor(_Model):
    """A payee (Β.2.2) or beneficiary (Β.2.1) and the amount concerned. The party is
    missing when the decision withholds it, e.g. for payments to private individuals."""

    sponsor_afm_name: Party | None = Field(default=None, alias="sponsorAFMName")
    expense_amount: Amount | None = None


class Decision(_Model):
    ada: str
    subject: str
    decision_type_id: str
    organization_id: str
    issue_date: datetime
    submission_timestamp: datetime
    publish_timestamp: datetime | None = None
    protocol_number: str | None = None
    status: str | None = None
    unit_ids: list[str] = Field(default_factory=list)
    signer_ids: list[str] = Field(default_factory=list)
    thematic_category_ids: list[str] = Field(default_factory=list)
    extra_field_values: dict[str, Any] = Field(default_factory=dict)
    document_url: str | None = None
    corrected_version_id: str | None = None

    @property
    def org(self) -> Party | None:
        raw = self.extra_field_values.get("org")
        return Party.model_validate(raw) if raw else None

    @property
    def sponsors(self) -> list[Sponsor]:
        return [Sponsor.model_validate(s) for s in self.extra_field_values.get("sponsor") or []]


class SearchInfo(_Model):
    query: str | None = None
    page: int
    size: int
    actual_size: int
    total: int


class SearchPage(_Model):
    decisions: list[dict[str, Any]]
    info: SearchInfo

    @property
    def is_last(self) -> bool:
        return (
            self.info.actual_size == 0 or (self.info.page + 1) * self.info.size >= self.info.total
        )
