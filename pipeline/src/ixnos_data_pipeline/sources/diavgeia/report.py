"""Report for the Διαύγεια probe, including how it links to ΚΗΜΔΗΣ. Reads only cached data.

    python -m ixnos_data_pipeline.sources.diavgeia.report --probe ../.data/diavgeia-probe \
        --khmdhs-cache ../.data/khmdhs-probe/raw
"""

import argparse
import gzip
import json
from collections import Counter
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
from ixnos_data_pipeline.sources.diavgeia.client import DecisionType
from ixnos_data_pipeline.sources.diavgeia.models import Decision
from ixnos_data_pipeline.sources.khmdhs.client import RecordKind


@dataclass
class TypeStats:
    decision_type: DecisionType
    decisions: int = 0
    adas: set[str] = field(default_factory=set)
    per_day: Counter[date] = field(default_factory=Counter)
    extra_filled: Counter[str] = field(default_factory=Counter)
    derived: Counter[str] = field(default_factory=Counter)
    invalid: int = 0
    amounts: list[float] = field(default_factory=list)
    payee_afms: set[str] = field(default_factory=set)
    skip_vat_reasons: Counter[str] = field(default_factory=Counter)
    commitment_refs: list[str] = field(default_factory=list)


def observe(stats: TypeStats, day: date, raw: dict[str, Any]) -> None:
    stats.decisions += 1
    stats.per_day[day] += 1
    for key, value in (raw.get("extraFieldValues") or {}).items():
        if is_filled(value):
            stats.extra_filled[key] += 1
    try:
        decision = Decision.model_validate(raw)
    except ValidationError:
        stats.invalid += 1
        return
    stats.adas.add(decision.ada)

    sponsors = decision.sponsors
    parties = [s.sponsor_afm_name for s in sponsors if s.sponsor_afm_name]
    afms = [p.afm for p in parties if p and p.afm]
    amount = sum((s.expense_amount.amount or 0) for s in sponsors if s.expense_amount)
    if sponsors:
        stats.derived["has payee/beneficiary entry"] += 1
    if afms:
        stats.derived["has payee VAT (ΑΦΜ)"] += 1
        stats.payee_afms.update(afms)
    if amount > 0:
        stats.derived["amount > 0"] += 1
        stats.amounts.append(amount)
    if decision.org and decision.org.afm:
        stats.derived["issuer VAT present"] += 1
    if decision.corrected_version_id:
        stats.derived["is a correction of an earlier version"] += 1
    reason = decision.extra_field_values.get("skipVatReason")
    if reason:
        stats.skip_vat_reasons[str(reason)] += 1
    for related in decision.extra_field_values.get("relatedAnalipsiYpoxreosis") or []:
        stats.commitment_refs.extend(find_adas(related.get("textRelatedADA")))


def collect(cache: RawPageCache) -> dict[str, TypeStats]:
    stats: dict[str, TypeStats] = {}
    for decision_type in DecisionType:
        type_stats = TypeStats(decision_type)
        for day, page in cache.iter_pages(decision_type.slug):
            for raw in page["decisions"]:
                observe(type_stats, day, raw)
        if type_stats.decisions:
            stats[decision_type.value] = type_stats
    return stats


@dataclass
class KhmdhsSide:
    org_vats: dict[str, str] = field(default_factory=dict)  # organisation key -> VAT
    org_of_reference: dict[str, str] = field(default_factory=dict)  # ΑΔΑΜ -> org key
    contract_contractor_vats: set[str] = field(default_factory=set)


def read_khmdhs(cache: RawPageCache) -> KhmdhsSide:
    side = KhmdhsSide()
    for kind in RecordKind:
        for _, page in cache.iter_pages(kind.value):
            for record in page["content"]:
                org_key = (record.get("organization") or {}).get("key")
                if not org_key:
                    continue
                side.org_of_reference[record["referenceNumber"]] = org_key
                if record.get("organizationVatNumber"):
                    side.org_vats.setdefault(org_key, record["organizationVatNumber"])
                if kind is RecordKind.CONTRACT:
                    details = record.get("contractingDataDetails") or {}
                    for member in details.get("contractingMembersDataList") or []:
                        if member.get("vatNumber"):
                            side.contract_contractor_vats.add(member["vatNumber"])
    return side


def cross_source(
    stats: dict[str, TypeStats], khmdhs: KhmdhsSide, checks_dir: Path
) -> dict[str, Any]:
    result: dict[str, Any] = {}

    register_file = checks_dir / "organizations.json.gz"
    if register_file.exists():
        register = json.loads(gzip.decompress(register_file.read_bytes()))
        by_uid = {o["uid"]: o for o in register.get("organizations", register)}
        keys = set(khmdhs.org_vats)
        in_register = [k for k in keys if k in by_uid]
        same_vat = [k for k in in_register if by_uid[k].get("vatNumber") == khmdhs.org_vats[k]]
        result["organisations"] = {
            "register_size": len(by_uid),
            "register_categories": Counter(o.get("category") for o in by_uid.values()),
            "khmdhs_org_keys": len(keys),
            "found_in_register": [len(in_register), pct(len(in_register), len(keys))],
            "same_vat": [len(same_vat), pct(len(same_vat), len(in_register))],
        }

    links_file = checks_dir / "ada_links.json"
    if links_file.exists():
        links = json.loads(links_file.read_text(encoding="utf-8"))
        references, lookups = links["references"], links["lookups"]
        found = [x for x in lookups if x.get("found")]
        same_org = [
            x for x in found
            if x.get("organization_id") == khmdhs.org_of_reference.get(x["reference_number"])
        ]  # fmt: skip
        result["ada_links"] = {
            "references_by_field": Counter(r["field"] for r in references),
            "with_valid_ada": [sum(1 for r in references if r["ada"]), len(references)],
            "looked_up": len(lookups),
            "found": [len(found), pct(len(found), len(lookups))],
            "decision_types": Counter(x.get("decision_type") for x in found),
            "same_organisation": [len(same_org), pct(len(same_org), len(found))],
        }

    if "Β.2.2" in stats and khmdhs.contract_contractor_vats:
        payees = stats["Β.2.2"].payee_afms
        overlap = khmdhs.contract_contractor_vats & payees
        result["contractors_paid_in_sample"] = {
            "khmdhs_contract_contractors": len(khmdhs.contract_contractor_vats),
            "diavgeia_payees": len(payees),
            "contractors_also_payees": [
                len(overlap),
                pct(len(overlap), len(khmdhs.contract_contractor_vats)),
            ],
        }

    if "Β.2.1" in stats and "Β.1.3" in stats:
        refs = set(stats["Β.2.1"].commitment_refs)
        found_refs = refs & stats["Β.1.3"].adas
        result["approvals_to_commitments"] = {
            "distinct_commitment_refs": len(refs),
            "resolved_in_pull": [len(found_refs), pct(len(found_refs), len(refs))],
        }
    return result


def _shares(counts: Counter[str], whole: int) -> dict[str, list[Any]]:
    return {key: [value, pct(value, whole)] for key, value in counts.most_common()}


def summarise(
    stats: dict[str, TypeStats], cross: dict[str, Any], probe_dir: Path
) -> dict[str, Any]:
    return {
        "types": {
            name: {
                "decisions": s.decisions,
                "invalid": s.invalid,
                "per_day": per_day_summary(s.per_day),
                "derived": _shares(s.derived, s.decisions),
                "extra_filled": _shares(s.extra_filled, s.decisions),
                "amount_eur": distribution(s.amounts),
                "skip_vat_reasons": dict(s.skip_vat_reasons),
            }
            for name, s in stats.items()
        },
        "cross_source": cross,
        "retries": dict(retry_reasons(probe_dir / "probe.log")),
    }


def render(summary: dict[str, Any]) -> str:
    out = ["# Διαύγεια data verification report", "", "## Volume", ""]
    out.append(md_table(
        ["type", "decisions", "invalid", "days", "weekday mean", "weekday max", "weekend mean"],
        [[name, t["decisions"], t["invalid"], t["per_day"]["days"], t["per_day"]["weekday_mean"],
          t["per_day"]["weekday_max"], t["per_day"]["weekend_mean"]]
         for name, t in summary["types"].items()],
    ))  # fmt: skip
    out += ["", "## Coverage", ""]
    for name, t in summary["types"].items():
        out += [f"### {name}", ""]
        rows = [[m, v[0], v[1]] for m, v in t["derived"].items()]
        rows += [[f"extraFieldValues.{m}", v[0], v[1]] for m, v in t["extra_filled"].items()]
        out.append(md_table(["measure", "decisions", "share"], rows))
        out += ["", f"Amount per decision (EUR): {t['amount_eur']}"]
        if t["skip_vat_reasons"]:
            out.append(f"Payee withheld, by skipVatReason: {t['skip_vat_reasons']}")
        out.append("")
    out += ["## Links to KHMDHS", "", "```json",
            json.dumps(summary["cross_source"], ensure_ascii=False, indent=1, default=dict),
            "```", "", "## retries", "", f"{summary['retries']}"]  # fmt: skip
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="diavgeia-report", description=__doc__)
    parser.add_argument("--probe", type=Path, required=True)
    parser.add_argument("--khmdhs-cache", type=Path, required=True)
    args = parser.parse_args(argv)
    probe_dir: Path = args.probe

    stats = collect(RawPageCache(probe_dir / "raw"))
    cross = cross_source(stats, read_khmdhs(RawPageCache(args.khmdhs_cache)), probe_dir / "checks")
    summary = summarise(stats, cross, probe_dir)
    (probe_dir / "stats.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1, default=dict), encoding="utf-8"
    )
    (probe_dir / "report.md").write_text(render(summary), encoding="utf-8")
    print(f"wrote {probe_dir / 'report.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
