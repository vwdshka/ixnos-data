"""Daily bulk exports: records and organisations as gzipped CSV and JSON Lines.

    python -m ixnos_data_pipeline.export --out /srv/exports

No contractor data (a bulk list of sole traders is a profile) and no raw payloads (the
sources publish those). Files are swapped in only once they're complete.
"""

import argparse
import csv
import gzip
import json
import logging
from collections.abc import Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, TextIO

from sqlalchemy import Engine, text

log = logging.getLogger(__name__)

RECORDS = """
    SELECT p.source, p.source_id, p.kind, p.title, p.organisation_id,
           o.name_el AS organisation_name, p.amount_eur, p.amount_with_vat_eur, p.cpv_codes,
           p.nuts_code, p.published_at,
           p.signed_on, p.deadline_at, p.cancelled, p.superseded_by
    FROM procurement_item p LEFT JOIN organisation o ON o.id = p.organisation_id
    ORDER BY p.id
"""
ORGANISATIONS = """
    SELECT id, name_el, name_en, type, tax_id, parent_id, website FROM organisation ORDER BY id
"""

README = """ixnos-data bulk data, generated {generated}

records.csv.gz, records.jsonl.gz: every record from ΚΗΜΔΗΣ and Διαύγεια, one per line.
  amount_eur is without VAT (ΚΗΜΔΗΣ); amount_with_vat_eur is with VAT (both sources).
  superseded_by: the ΑΔΑ of the correction that replaced a Διαύγεια decision.
organisations.csv.gz: contracting authorities (shared ΚΗΜΔΗΣ/Διαύγεια IDs).

Licence: the source data is open data under CC BY 4.0. Credit the sources when you reuse it:
  ΚΗΜΔΗΣ (https://cerpp.eprocurement.gov.gr/khmdhs-opendata), Διαύγεια (https://diavgeia.gov.gr).
Records may name individuals: use them only in line with data-protection law.
"""


def _plain(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _rows(engine: Engine, sql: str) -> Iterator[dict[str, Any]]:
    # Streamed from a server-side cursor, so memory stays flat however many records there are.
    with engine.connect().execution_options(stream_results=True, yield_per=5000) as connection:
        for row in connection.execute(text(sql)).mappings():
            yield {key: _plain(value) for key, value in row.items()}


def _write(rows: Iterator[dict[str, Any]], csv_file: TextIO, jsonl_file: TextIO | None) -> int:
    writer: csv.DictWriter[str] | None = None
    count = 0
    for row in rows:
        if writer is None:
            writer = csv.DictWriter(csv_file, fieldnames=list(row))
            writer.writeheader()
        csv_row = {k: "|".join(v) if isinstance(v, list) else v for k, v in row.items()}
        writer.writerow(csv_row)
        if jsonl_file is not None:
            jsonl_file.write(json.dumps(row, ensure_ascii=False) + "\n")
        count += 1
    return count


def export(engine: Engine, out: Path) -> dict[str, Any]:
    out.mkdir(parents=True, exist_ok=True)
    generated = datetime.now(UTC)

    def gz(name: str) -> TextIO:
        # Written as .tmp and renamed at the end, so a download never sees a half-written file.
        return gzip.open(out / f"{name}.tmp", "wt", encoding="utf-8", newline="")

    with gz("records.csv.gz") as records_csv, gz("records.jsonl.gz") as records_jsonl:
        records = _write(_rows(engine, RECORDS), records_csv, records_jsonl)
    with gz("organisations.csv.gz") as organisations_csv:
        organisations = _write(_rows(engine, ORGANISATIONS), organisations_csv, None)
    for name in ("records.csv.gz", "records.jsonl.gz", "organisations.csv.gz"):
        (out / f"{name}.tmp").replace(out / name)

    manifest = {
        "generated_at": generated.isoformat(),
        "records": records,
        "organisations": organisations,
        "files": ["records.csv.gz", "records.jsonl.gz", "organisations.csv.gz"],
        "licence": "CC BY 4.0 (ΚΗΜΔΗΣ, Διαύγεια)",
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (out / "README.txt").write_text(README.format(generated=generated.date()), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="export", description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    from ixnos_data_pipeline.config import Settings
    from ixnos_data_pipeline.db.engine import engine_from_settings

    manifest = export(engine_from_settings(Settings()), args.out)
    log.info(
        "exported %d records, %d organisations", manifest["records"], manifest["organisations"]
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
