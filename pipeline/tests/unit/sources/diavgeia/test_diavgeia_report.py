import gzip
import json
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

from ixnos_data_pipeline.common.cache import RawPageCache
from ixnos_data_pipeline.sources.diavgeia.report import (
    KhmdhsSide,
    collect,
    cross_source,
    render,
    summarise,
)

LoadFixture = Callable[[str], Any]


def diavgeia_cache(load_fixture: LoadFixture, root: Path) -> RawPageCache:
    cache = RawPageCache(root)
    for slug in ("b-2-1", "b-2-2"):
        cache.put(slug, date(2026, 9, 15), 0, load_fixture(f"diavgeia/{slug}_page.json"))
    return cache


def test_collect_measures_payees(load_fixture: LoadFixture, tmp_path: Path) -> None:
    stats = collect(diavgeia_cache(load_fixture, tmp_path))

    payments = stats["Β.2.2"]
    assert payments.decisions == 2
    assert payments.derived["has payee VAT (ΑΦΜ)"] == 1
    assert payments.skip_vat_reasons == {"SKIP_VAT_REASON_1": 1}
    assert stats["Β.2.1"].commitment_refs


def test_cross_source_matches_organisations_and_payees(
    load_fixture: LoadFixture, tmp_path: Path
) -> None:
    stats = collect(diavgeia_cache(load_fixture, tmp_path / "raw"))
    payee = next(iter(stats["Β.2.2"].payee_afms))
    checks = tmp_path / "checks"
    checks.mkdir()
    register = {"organizations": [{"uid": "6235", "vatNumber": "090114939", "category": "X"}]}
    (checks / "organizations.json.gz").write_bytes(gzip.compress(json.dumps(register).encode()))
    khmdhs = KhmdhsSide(
        org_vats={"6235": "090114939", "999": "000000000"},
        contract_contractor_vats={payee, "123456789"},
    )

    cross = cross_source(stats, khmdhs, checks)

    assert cross["organisations"]["found_in_register"] == [1, "50.0%"]
    assert cross["organisations"]["same_vat"] == [1, "100.0%"]
    assert cross["contractors_paid_in_sample"]["contractors_also_payees"] == [1, "50.0%"]


def test_report_renders(load_fixture: LoadFixture, tmp_path: Path) -> None:
    stats = collect(diavgeia_cache(load_fixture, tmp_path))

    report = render(summarise(stats, {}, tmp_path))

    assert "| Β.2.2 | 2 |" in report
