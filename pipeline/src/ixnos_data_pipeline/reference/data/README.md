# Reference data

Seed files for the `cpv_code` and `nuts_region` tables, loaded with
`python -m ixnos_data_pipeline.reference.load` and rebuilt from the official downloads with
`python -m ixnos_data_pipeline.reference.build`.

| File | Rows | Source | Licence |
| --- | --- | --- | --- |
| `cpv_2008.csv` | 9,454 | Common Procurement Vocabulary (CPV 2008, as revised in 2013), EU Publications Office, via [TED](https://ted.europa.eu/en/simap/cpv) (`cpv_2008_xml`) | © European Union; reuse authorised under the Commission's reuse policy (Decision 2011/833/EU) |
| `nuts_2024_el.csv` | 70 | NUTS 2024, [Eurostat GISCO](https://gisco-services.ec.europa.eu/distribution/v2/nuts/) (`NUTS_AT_2024.csv`), Greek regions only | © European Union, Eurostat; reuse with attribution |

Columns: `code`, `parent_code` (empty at the top level), `level`, `label_el`, `label_en`.

Cleaning applied by `build.py`:

- CPV parents are derived from the code's significant digits (`33141000` → `33140000`).
- NUTS names are trimmed, and Latin look-alike letters inside Greek names are replaced
  (Eurostat spells `Αττική` with a Latin `A`).
- NUTS `label_en` is Eurostat's Latin transliteration ("Ipeiros"), except "Greece" for the
  country, until proper English names are curated.

Checked against the ΚΗΜΔΗΣ probe (September 2026): all 4,020 distinct CPV codes in 74,080 uses
exist in this list, and every Greek NUTS code does too. The 0.04% of uses with foreign NUTS
codes (delivery abroad) have no row here, so records store NUTS codes without a foreign key.
