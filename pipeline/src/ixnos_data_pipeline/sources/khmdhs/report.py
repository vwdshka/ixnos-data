"""Report for the ΚΗΜΔΗΣ probe. Reads only the cache; no API calls.

python -m ixnos_data_pipeline.sources.khmdhs.report --probe ../.data/khmdhs-probe
"""

import argparse
import json
import re
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.common.probe_stats import (
    distribution,
    is_filled,
    md_table,
    pct,
    per_day_summary,
    retry_reasons,
)
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

_VAT = re.compile(r"^\d{9}$")
_CPV = re.compile(r"^\d{8}-\d$")
_MIXED_SCRIPT_WORD = re.compile(r"(?=\w*[α-ωΑ-Ω])(?=\w*[a-zA-Z])\w+")


@dataclass
class KindStats:
    kind: RecordKind
    records: int = 0
    references: set[str] = field(default_factory=set)
    duplicates: int = 0
    per_day: Counter[date] = field(default_factory=Counter)
    filled: Counter[str] = field(default_factory=Counter)
    derived: Counter[str] = field(default_factory=Counter)
    invalid: int = 0
    invalid_examples: list[str] = field(default_factory=list)
    ada_raw_values: Counter[str] = field(default_factory=Counter)
    publication_lag_days: list[float] = field(default_factory=list)
    deadline_lead_days: list[float] = field(default_factory=list)
    outgoing: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))


def observe(stats: KindStats, day: date, raw: dict[str, Any]) -> None:
    stats.records += 1
    stats.per_day[day] += 1
    reference = raw.get("referenceNumber", "")
    if reference in stats.references:
        stats.duplicates += 1
    stats.references.add(reference)
    for key, value in raw.items():
        if is_filled(value):
            stats.filled[key] += 1

    try:
        record = stats.kind.model.model_validate(raw)
    except ValidationError as exc:
        stats.invalid += 1
        if len(stats.invalid_examples) < 5:
            stats.invalid_examples.append(f"{reference}: {exc.errors()[0]['msg']}")
        return

    for name in _derived_flags(record, stats):
        stats.derived[name] += 1
    for target, refs in _outgoing_refs(record).items():
        stats.outgoing[target].extend(refs)


def _derived_flags(record: KhmdhsRecord, stats: KindStats) -> list[str]:
    flags = []
    if (record.total_cost_without_vat or 0) > 0:
        flags.append("amount without VAT > 0")
    if (record.total_cost_with_vat or 0) > 0:
        flags.append("amount with VAT > 0")
    cpvs = [cpv.key for item in _items(record) for cpv in item.cpvs]
    if cpvs:
        flags.append("has CPV")
        if all(_CPV.match(code) for code in cpvs):
            flags.append("all CPV codes well-formed")
    if record.nuts_code and record.nuts_code.key:
        flags.append("has NUTS")
        flags.append(f"NUTS length {len(record.nuts_code.key)}")
    if record.organization and record.organization.key:
        flags.append("has organisation key")
    if record.organization_vat_number and _VAT.match(record.organization_vat_number):
        flags.append("organisation VAT 9 digits")
    if record.cancelled:
        flags.append("cancelled")
    if _MIXED_SCRIPT_WORD.search(record.title):
        flags.append("title has mixed Greek/Latin word")

    contractor_vats = _contractor_vats(record)
    if contractor_vats:
        flags.append("has contractor VAT")

    for raw_ada in _ada_fields(record):
        stats.ada_raw_values[raw_ada] += 1
    if any(find_adas(value) for value in _ada_fields(record)):
        flags.append("has valid Διαύγεια ΑΔΑ")

    signed = getattr(record, "signed_date", None) or getattr(record, "contract_signed_date", None)
    if isinstance(signed, date):
        stats.publication_lag_days.append((record.submission_date.date() - signed).days)
    if isinstance(record, Notice) and record.final_submission_date:
        lead = record.final_submission_date - record.submission_date
        stats.deadline_lead_days.append(lead.total_seconds() / 86400)
    return flags


def _items(record: KhmdhsRecord) -> list[ObjectDetail]:
    if isinstance(record, Auction | Contract):
        return list(record.object_details_list)
    if isinstance(record, Notice | ProcurementRequest | Payment):
        return list(record.object_details)
    return []


def _contractor_vats(record: KhmdhsRecord) -> list[str]:
    if isinstance(record, Auction | Contract) and record.contracting_data_details:
        members = record.contracting_data_details.contracting_members_data_list
        return [m.vat_number for m in members if m.vat_number]
    if isinstance(record, Payment):
        return [item.vat_no for item in record.object_details if item.vat_no]
    return []


def _ada_fields(record: KhmdhsRecord) -> list[str]:
    values = [record.cancellation_ada]
    if isinstance(record, Contract):
        related = record.contract_related_ada
        values += [record.diavgeia_ada]
        if related:
            values += [related.number1, related.number2, related.number3]
    if isinstance(record, Payment):
        values.append(record.payment_related_ada)
    return [v for v in values if v and v.strip()]


def _outgoing_refs(record: KhmdhsRecord) -> dict[str, list[str]]:
    if isinstance(record, ProcurementRequest):
        return {
            "request": record.approval_ref_no,
            "notice": record.notice_ref_no,
            "auction": record.auction_ref_no,
            "contract": record.contract_ref_no,
            "payment": record.payment_ref_no,
        }
    if isinstance(record, Notice):
        return {
            "request": [r.code for r in record.approved_requests],
            "auction": record.auction_ref_no,
        }
    if isinstance(record, Auction):
        return {
            "request": [r.code for r in record.approved_requests_list],
            "notice": record.notice_ref_no,
            "contract": record.contract_ref_no,
            "payment": record.payment_ref_no,
        }
    if isinstance(record, Contract):
        return {"auction": record.auction_ref_no, "payment": record.payment_ref_no}
    if isinstance(record, Payment):
        return {
            "request": record.request_ref_no,
            "auction": record.auction_ref_no,
            "contract": record.contract_ref_no,
        }
    return {}


def collect(
    cache: RawPageCache, kinds: Iterable[RecordKind] = tuple(RecordKind)
) -> dict[str, KindStats]:
    stats: dict[str, KindStats] = {}
    for kind in kinds:
        kind_stats = KindStats(kind)
        for day, page in cache.iter_pages(kind):
            for raw in page["content"]:
                observe(kind_stats, day, raw)
        if kind_stats.records:
            stats[kind.value] = kind_stats
    return stats


def link_resolution(stats: dict[str, KindStats]) -> list[dict[str, Any]]:
    """For each (source kind -> target kind) reference, how many point at a record that
    was pulled. Only meaningful where the target kind covers the source's time range."""
    rows = []
    for source, kind_stats in stats.items():
        for target, refs in sorted(kind_stats.outgoing.items()):
            if not refs or target not in stats:
                continue
            unique = set(refs)
            found = unique & stats[target].references
            rows.append({
                "from": source, "to": target, "references": len(refs),
                "unique": len(unique), "resolved": len(found),
            })  # fmt: skip
    return rows


def summarise(stats: dict[str, KindStats], probe_dir: Path) -> dict[str, Any]:
    summary: dict[str, Any] = {"kinds": {}, "links": link_resolution(stats)}
    for name, s in stats.items():
        summary["kinds"][name] = {
            "records": s.records,
            "unique": len(s.references),
            "duplicates": s.duplicates,
            "invalid": s.invalid,
            "invalid_examples": s.invalid_examples,
            "per_day": per_day_summary(s.per_day),
            "derived": {k: [v, pct(v, s.records)] for k, v in s.derived.most_common()},
            "filled": {k: [v, pct(v, s.records)] for k, v in s.filled.most_common()},
            "publication_lag_days": distribution(s.publication_lag_days),
            "deadline_lead_days": distribution(s.deadline_lead_days),
            "invalid_ada_values": [
                [value, count]
                for value, count in s.ada_raw_values.most_common()
                if not find_adas(value)
            ][:15],
        }
    checks_dir = probe_dir / "checks"
    for check in ("history", "request_flags"):
        path = checks_dir / f"{check}.json"
        if path.exists():
            summary[check] = json.loads(path.read_text(encoding="utf-8"))
    chains = checks_dir / "adam_chains.json"
    if chains.exists():
        summary["adam_chains"] = _compare_chains(json.loads(chains.read_text(encoding="utf-8")))
    summary["retries"] = dict(retry_reasons(probe_dir / "probe.log"))
    return summary


def _compare_chains(chains: dict[str, Any]) -> dict[str, int]:
    """Whether the refs an award carries agree with what /adamChain returns for it."""
    agree = {"awards": len(chains), "notice_agrees": 0, "contracts_agree": 0}
    for entry in chains.values():
        record, chain = entry["record"], entry["chain"]
        notice = record.get("noticeRefNo")
        notices = [notice] if isinstance(notice, str) else notice or []
        if set(notices) <= set(chain.get("notices", [])):
            agree["notice_agrees"] += 1
        if set(record.get("contractRefNo") or []) <= set(chain.get("contracts", [])):
            agree["contracts_agree"] += 1
    return agree


def render(summary: dict[str, Any]) -> str:
    out = ["# KHMDHS data verification report", ""]
    out += ["## Volume", ""]
    out.append(md_table(
        ["kind", "records", "unique", "duplicates", "invalid", "days", "weekday mean",
         "weekday max", "weekend mean"],
        [[name, k["records"], k["unique"], k["duplicates"], k["invalid"], k["per_day"]["days"],
          k["per_day"]["weekday_mean"], k["per_day"]["weekday_max"], k["per_day"]["weekend_mean"]]
         for name, k in summary["kinds"].items()],
    ))  # fmt: skip
    out += ["", "## Coverage of the fields ixnos-data needs", ""]
    for name, k in summary["kinds"].items():
        out += [f"### {name}", ""]
        out.append(md_table(["measure", "records", "share"],
                            [[m, v[0], v[1]] for m, v in k["derived"].items()]))  # fmt: skip
        out += [
            "",
            f"Publication lag (submission minus signing, days): {k['publication_lag_days']}",
        ]
        if k["deadline_lead_days"].get("count"):
            out.append(f"Tender deadline lead (days after submission): {k['deadline_lead_days']}")
        if k["invalid_ada_values"]:
            out.append(f"Non-ΑΔΑ values in ΑΔΑ fields: {k['invalid_ada_values']}")
        if k["invalid_examples"]:
            out.append(f"Model validation failures: {k['invalid_examples']}")
        out.append("")
    out += ["## References between record types", ""]
    out.append(md_table(
        ["from", "to", "references", "unique", "resolved in pull", "share"],
        [[r["from"], r["to"], r["references"], r["unique"], r["resolved"],
          pct(r["resolved"], r["unique"])] for r in summary["links"]],
    ))  # fmt: skip
    for check in ("history", "request_flags", "adam_chains", "retries"):
        if check in summary:
            out += ["", f"## {check}", "", "```json",
                    json.dumps(summary[check], ensure_ascii=False, indent=1), "```"]  # fmt: skip
    out += ["", "## Top-level field fill rates", ""]
    for name, k in summary["kinds"].items():
        out += [f"### {name}", ""]
        out.append(md_table(["field", "filled", "share"],
                            [[f, v[0], v[1]] for f, v in k["filled"].items()]))  # fmt: skip
        out.append("")
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="khmdhs-report", description=__doc__)
    parser.add_argument("--probe", type=Path, required=True)
    args = parser.parse_args(argv)
    probe_dir: Path = args.probe

    summary = summarise(collect(RawPageCache(probe_dir / "raw")), probe_dir)
    (probe_dir / "stats.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1, default=str), encoding="utf-8"
    )
    (probe_dir / "report.md").write_text(render(summary), encoding="utf-8")
    print(f"wrote {probe_dir / 'report.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
