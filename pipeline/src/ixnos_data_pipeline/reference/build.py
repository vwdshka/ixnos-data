"""Builds the committed CPV and NUTS seed files from the official downloads.

    python -m ixnos_data_pipeline.reference.build --cpv-xml ../.data/reference/cpv/cpv_2008.xml \
        --nuts-csv ../.data/reference/NUTS_AT_2024.csv

Sources are listed in data/README.md.
"""

import argparse
import csv
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from ixnos_data_pipeline.common.greek_text import fix_latin_lookalikes

DATA_DIR = Path(__file__).parent / "data"


@dataclass(frozen=True)
class CpvRow:
    code: str  # "03111000-2", as KHMDHS publishes it
    parent_code: str | None
    level: int  # 1 division (XX000000) .. 7
    label_el: str
    label_en: str


@dataclass(frozen=True)
class NutsRow:
    code: str
    parent_code: str | None
    level: int  # 0 country .. 3
    label_el: str
    label_en: str  # Eurostat's Latin transliteration until English names are curated


def significant_digits(code: str) -> str:
    """ "03111000-2" -> "03111": the digits that place a code in the hierarchy. Divisions
    keep two digits even when the second is zero ("03000000" -> "03")."""
    digits = code.split("-")[0].rstrip("0")
    return digits.ljust(2, "0")


def parse_cpv(xml_path: Path) -> list[CpvRow]:
    labels: dict[str, dict[str, str]] = {}
    for _, element in ET.iterparse(xml_path, events=("end",)):
        if element.tag == "CPV":
            texts = {t.get("LANG", ""): (t.text or "").strip() for t in element.iter("TEXT")}
            labels[element.get("CODE", "")] = texts
            element.clear()

    by_digits = {significant_digits(code): code for code in labels}
    rows = []
    for code, texts in labels.items():
        digits = significant_digits(code)
        parent = None
        for length in range(len(digits) - 1, 1, -1):
            candidate = by_digits.get(digits[:length])
            if candidate:
                parent = candidate
                break
        rows.append(CpvRow(code, parent, len(digits) - 1, texts.get("EL", ""), texts.get("EN", "")))
    return sorted(rows, key=lambda r: r.code)


def parse_nuts_greece(csv_path: Path) -> list[NutsRow]:
    with csv_path.open(encoding="utf-8", newline="") as handle:
        rows = [r for r in csv.DictReader(handle) if r["CNTR_CODE"] == "EL"]
    codes = {r["NUTS_ID"] for r in rows}
    regions = []
    for r in rows:
        code = r["NUTS_ID"]
        parent = code[:-1] if code[:-1] in codes else None
        # Eurostat's names carry trailing spaces and at least one Latin look-alike ("Aττική").
        label_el = fix_latin_lookalikes(r["NUTS_NAME"].strip())
        label_en = "Greece" if code == "EL" else r["NAME_LATN"].strip()
        regions.append(NutsRow(code, parent, len(code) - 2, label_el, label_en))
    return sorted(regions, key=lambda r: r.code)


HEADER = ["code", "parent_code", "level", "label_el", "label_en"]


def _as_row(row: CpvRow | NutsRow) -> tuple[object, ...]:
    return (row.code, row.parent_code or "", row.level, row.label_el, row.label_en)


def write_csv(path: Path, header: list[str], rows: list[tuple[object, ...]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="reference-build", description=__doc__)
    parser.add_argument("--cpv-xml", type=Path, required=True)
    parser.add_argument("--nuts-csv", type=Path, required=True)
    args = parser.parse_args(argv)

    cpv = parse_cpv(args.cpv_xml)
    nuts = parse_nuts_greece(args.nuts_csv)
    write_csv(DATA_DIR / "cpv_2008.csv", HEADER, [_as_row(r) for r in cpv])
    write_csv(DATA_DIR / "nuts_2024_el.csv", HEADER, [_as_row(r) for r in nuts])
    print(f"cpv: {len(cpv)} codes, nuts: {len(nuts)} regions -> {DATA_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
