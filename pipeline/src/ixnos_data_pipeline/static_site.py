"""Data files for the static edition of the web app (GitHub Pages).

    python -m ixnos_data_pipeline.static_site --out ../web/public/data --site-url https://…

The static edition has no server: the browser searches and renders from these files, fetching
only the pieces a page needs.

    meta.json            counts, shard sizes and the code lists the other files refer to
    rows/<n>.json        record summaries, SHARD records per file, newest first (index = position)
    details/<n>.json     the rest of each record (description, contractors, links, similar)
    ids/<bucket>.json    record identifier (ΑΔΑΜ/ΑΔΑ) -> index, by fnv1a(id) % ID_BUCKETS
    attrs/<column>.bin   one little-endian column per filter (amount, cpv, published, deadline,
                         nuts, org, kind, flags), loaded only when a search needs it
    index/<xy>.json      search key token -> postings (record indexes), by the token's first two
                         characters
    orgs.json            [id, name] per authority; records refer to authorities by position
    orgs/<bucket>.json   authority pages: statistics, spending per year, main contractors
    cpv.json, nuts.json  code labels, Greek and English; cpv/<division>.json the same by division
    home.json            open tenders closing soonest
    status.json          last refresh per source and the latest runs
    feeds/*.xml          RSS per CPV division, per region, and for everything

No contractor VAT numbers and no raw source payloads are written: the same data the full
site shows, and nothing more.
"""

import argparse
import base64
import json
import logging
import math
import shutil
import struct
from array import array
from collections import defaultdict
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import quote
from xml.sax.saxutils import escape

from sqlalchemy import Connection, Engine, text

from ixnos_data_pipeline.common.greek_text import search_key

log = logging.getLogger(__name__)

SHARD = 250
ID_BUCKETS = 1024
ORG_BUCKETS = 256
DESCRIPTION_MAX = 2000
LINK_TITLE_MAX = 160
SIMILAR = 5
RECENT = 10
TOP_CONTRACTORS = 5
FEED_ITEMS = 50
HOME_CLOSING = 12

KINDS = [
    *("request", "notice", "award", "contract", "payment"),
    *("commitment", "spending_approval", "final_award"),
]
SOURCES = ["khmdhs", "diavgeia"]
EPOCH = date(2000, 1, 1)
NONE16 = 0xFFFF

# Flag bits in attrs/flags.bin.
CANCELLED, SINGLE_OFFER, NEAR_LIMIT, DIAVGEIA, SUPERSEDED, IMPLAUSIBLE = (1 << i for i in range(6))

# Signals, as IxnosData.Application.Items.Signals defines them (ADR 0012).
COMPETITIVE = {"1", "2", "4", "7", "11", "13"}
DIRECT_AWARD, WORKS = "6", "10"
DIRECT_AWARD_LIMIT, WORKS_LIMIT, MARGIN = 30_000.0, 60_000.0, 0.95
PLAUSIBLE_MAX = 1_000_000_000.0

# Dominant supplier thresholds, as DominantSupplier defines them.
MIN_SHARE, MIN_AWARDS, MIN_TOTAL_AWARDS = 0.5, 3, 10

# Words too common to narrow a search, as search keys.
STOP_TOKENS = frozenset(
    {
        *("kai", "gia", "tu", "tis", "ton", "to", "ta", "ti", "tin", "i", "o", "oi", "me", "se"),
        *("apo", "sto", "sti", "stin", "ston", "stus", "stis", "pros", "ana", "kata", "ek"),
        *("eks", "os", "and", "of", "the", "for"),
    }
)


def fnv1a(text_value: str) -> int:
    """32-bit FNV-1a over UTF-8 bytes; the web app computes the same to find a bucket."""
    value = 0x811C9DC5
    for byte in text_value.encode("utf-8"):
        value = ((value ^ byte) * 0x01000193) & 0xFFFFFFFF
    return value


def encode_postings(indexes: Iterable[int]) -> str:
    """Ascending record indexes as base64 of unsigned LEB128 varints of their differences."""
    out = bytearray()
    previous = -1
    for index in indexes:
        delta = index - previous
        previous = index
        while True:
            byte = delta & 0x7F
            delta >>= 7
            if delta:
                out.append(byte | 0x80)
            else:
                out.append(byte)
                break
    return base64.b64encode(bytes(out)).decode("ascii")


def signals(
    kind: str,
    procedure_type: str | None,
    contract_type: str | None,
    offers: int | None,
    amount: float | None,
) -> list[str]:
    found = []
    if offers == 1 and procedure_type in COMPETITIVE:
        found.append("single_offer")
    if kind in ("award", "contract") and procedure_type == DIRECT_AWARD and amount is not None:
        limit = WORKS_LIMIT if contract_type == WORKS else DIRECT_AWARD_LIMIT
        if limit * MARGIN <= amount <= limit:
            found.append("near_direct_award_limit")
    return found


def document_url(source: str, kind: str, source_id: str) -> str | None:
    """The official document, as SourceDocuments.For builds it."""
    paths = {
        "request": "request",
        "notice": "notice",
        "award": "auction",
        "contract": "contract",
        "payment": "payment",
    }
    if source == "khmdhs" and kind in paths:
        return (
            "https://cerpp.eprocurement.gov.gr/khmdhs-opendata/"
            f"{paths[kind]}/attachment/{quote(source_id, safe='')}"
        )
    if source == "diavgeia":
        return f"https://diavgeia.gov.gr/doc/{quote(source_id, safe='')}"
    return None


def tokens(*texts: str | None) -> set[str]:
    found: set[str] = set()
    for value in texts:
        if value:
            found.update(t for t in value.split() if len(t) > 1 and t not in STOP_TOKENS)
    return found


def shard_of(token: str) -> str:
    head = token[:2]
    return head if len(head) == 2 and head.isascii() and head.isalnum() else "_"


def _float(value: Decimal | float | None) -> float | None:
    return None if value is None else float(value)


def _iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return value.isoformat()


def _days(value: datetime | date | None) -> int:
    if value is None:
        return 0
    day = value.date() if isinstance(value, datetime) else value
    return max(1, min(NONE16 - 1, (day - EPOCH).days))


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _stream(connection: Connection, sql: str, **params: Any) -> Iterator[Any]:
    result = connection.execution_options(stream_results=True, yield_per=5000).execute(
        text(sql), params
    )
    yield from result


ORDER = "ORDER BY p.published_at DESC, p.id DESC"


@dataclass
class Build:
    out: Path
    site_url: str
    count: int = 0
    orgs: list[tuple[str, str]] = field(default_factory=list)
    org_index: dict[str, int] = field(default_factory=dict)
    nuts: list[str] = field(default_factory=list)
    nuts_index: dict[str, int] = field(default_factory=dict)
    postings: dict[str, array[int]] = field(default_factory=lambda: defaultdict(lambda: array("I")))
    ids: list[dict[str, int]] = field(default_factory=lambda: [{} for _ in range(ID_BUCKETS)])
    recent: dict[str, list[int]] = field(default_factory=lambda: defaultdict(list))
    feeds: dict[str, list[dict[str, Any]]] = field(default_factory=lambda: defaultdict(list))


def build(engine: Engine, out: Path, site_url: str) -> dict[str, Any]:
    """Writes every file into `out`, replacing what was there."""
    work = out.with_name(out.name + ".tmp")
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    state = Build(work, site_url.rstrip("/"))
    generated = datetime.now(UTC)

    with engine.connect() as connection:
        _codes(connection, state)
        similar = _similar_groups(connection)
        _records(connection, state, similar)
        _organisations(connection, state)
        home = _home(connection, state)
        status = _status(connection)

    _write_index(state)
    for bucket, ids in enumerate(state.ids):
        _write_json(work / "ids" / f"{bucket}.json", ids)
    _write_json(work / "orgs.json", state.orgs)
    _write_feeds(state, generated)
    _write_json(work / "home.json", home)
    _write_json(work / "status.json", status)
    meta = {
        "generatedAt": _iso(generated),
        "count": state.count,
        "shard": SHARD,
        "idBuckets": ID_BUCKETS,
        "orgBuckets": ORG_BUCKETS,
        "kinds": KINDS,
        "sources": SOURCES,
        "nuts": state.nuts,
        "epoch": EPOCH.isoformat(),
        "stopTokens": sorted(STOP_TOKENS),
    }
    _write_json(work / "meta.json", meta)

    shutil.rmtree(out, ignore_errors=True)
    work.replace(out)
    return meta


def _codes(connection: Connection, state: Build) -> None:
    cpv = {
        row.code: [row.label_el, row.label_en]
        for row in connection.execute(text("SELECT code, label_el, label_en FROM cpv_code"))
    }
    _write_json(state.out / "cpv.json", cpv)
    divisions: dict[str, dict[str, list[str]]] = defaultdict(dict)
    for code, labels in cpv.items():
        divisions[code[:2]][code] = labels
    for division, codes in divisions.items():
        _write_json(state.out / "cpv" / f"{division}.json", codes)
    nuts = {}
    for row in connection.execute(
        text("SELECT code, label_el, label_en, level FROM nuts_region ORDER BY code")
    ):
        nuts[row.code] = [row.label_el, row.label_en, row.level]
        state.nuts_index[row.code] = len(state.nuts)
        state.nuts.append(row.code)
    _write_json(state.out / "nuts.json", nuts)
    for row in connection.execute(text("SELECT id, name_el FROM organisation ORDER BY id")):
        state.org_index[row.id] = len(state.orgs)
        state.orgs.append((row.id, row.name_el))


def _similar_groups(connection: Connection) -> dict[tuple[str, str], list[int]]:
    """The newest records per (stage, CPV class), for "similar records" on each record page."""
    groups: dict[tuple[str, str], list[int]] = defaultdict(list)
    rows = _stream(
        connection,
        f"SELECT p.kind, p.cpv_codes[1] AS cpv, p.superseded_by FROM procurement_item p {ORDER}",
    )
    for index, row in enumerate(rows):
        if row.cpv and row.superseded_by is None:
            group = groups[(row.kind, row.cpv[:5])]
            if len(group) <= SIMILAR:
                group.append(index)
    return groups


RECORDS = f"""
    SELECT p.id, p.source, p.source_id, p.kind, p.title, p.description, p.organisation_id,
           p.amount_eur, p.amount_with_vat_eur, p.published_at, p.signed_on, p.deadline_at,
           p.starts_on, p.ends_on, p.cancelled, p.cancelled_on, p.superseded_by, p.nuts_code,
           p.cpv_codes, p.search_key, p.keywords, p.procedure_type, p.contract_type,
           p.offers_received, p.raw->'procedureType'->>'value' AS procedure
    FROM procurement_item p {ORDER}
"""


def _records(
    connection: Connection, state: Build, similar: dict[tuple[str, str], list[int]]
) -> None:
    contractors: dict[int, list[list[Any]]] = defaultdict(list)
    for row in connection.execute(
        text(
            "SELECT ic.item_id, c.name, ic.role, ic.amount_eur, c.country_code"
            " FROM item_contractor ic JOIN contractor c ON c.id = ic.contractor_id"
            " ORDER BY ic.item_id, ic.role, c.name"
        )
    ):
        contractors[row.item_id].append(
            [row.name, row.role, _float(row.amount_eur), row.country_code]
        )
    links: dict[int, list[list[Any]]] = defaultdict(list)
    for row in connection.execute(
        text(
            "SELECT l.from_item_id, l.relation, l.to_source, l.to_source_id, t.kind,"
            f" left(t.title, {LINK_TITLE_MAX}) AS title"
            " FROM item_link l LEFT JOIN procurement_item t ON t.id = l.to_item_id"
            " ORDER BY l.from_item_id, l.relation, l.to_source_id"
        )
    ):
        links[row.from_item_id].append(
            [row.relation, row.to_source, row.to_source_id, row.kind, row.title]
        )

    count = connection.execute(text("SELECT count(*) FROM procurement_item")).scalar_one()
    kind = bytearray(count)
    flags = bytearray(count)
    published = array("H", bytes(2 * count))
    deadline = array("H", bytes(2 * count))
    amount = array("f", bytes(4 * count))
    cpv = array("I", bytes(4 * count))
    nuts = array("H", [NONE16]) * count
    org = array("H", [NONE16]) * count

    rows: list[list[Any]] = []
    details: list[dict[str, Any]] = []
    for index, row in enumerate(_stream(connection, RECORDS)):
        found = signals(
            row.kind,
            row.procedure_type,
            row.contract_type,
            row.offers_received,
            _float(row.amount_eur),
        )
        money = _float(row.amount_eur if row.amount_eur is not None else row.amount_with_vat_eur)
        implausible = row.amount_eur is not None and float(row.amount_eur) > PLAUSIBLE_MAX
        org_position = state.org_index.get(row.organisation_id or "", -1)

        kind[index] = KINDS.index(row.kind) if row.kind in KINDS else 255
        flags[index] = (
            (CANCELLED if row.cancelled else 0)
            | (SINGLE_OFFER if "single_offer" in found else 0)
            | (NEAR_LIMIT if "near_direct_award_limit" in found else 0)
            | (DIAVGEIA if row.source == "diavgeia" else 0)
            | (SUPERSEDED if row.superseded_by else 0)
            | (IMPLAUSIBLE if implausible else 0)
        )
        published[index] = _days(row.published_at)
        deadline[index] = _days(row.deadline_at)
        amount[index] = money if money is not None else math.nan
        first_cpv = (row.cpv_codes or [""])[0].split("-")[0]
        cpv[index] = int(first_cpv) if first_cpv.isdigit() else 0
        nuts[index] = state.nuts_index.get(row.nuts_code or "", NONE16)
        org[index] = org_position if org_position >= 0 else NONE16

        rows.append(
            [
                row.source_id,
                SOURCES.index(row.source),
                row.kind,
                row.title,
                org_position,
                _float(row.amount_eur),
                _float(row.amount_with_vat_eur),
                _iso(row.published_at),
                _iso(row.deadline_at),
                row.nuts_code,
                row.cpv_codes or [],
                1 if row.cancelled else 0,
                found,
            ]
        )
        group = similar.get((row.kind, (row.cpv_codes or [""])[0][:5]), [])
        description = row.description or None
        if description and len(description) > DESCRIPTION_MAX:
            description = description[:DESCRIPTION_MAX].rstrip() + "…"
        details.append(
            {
                "d": description,
                "si": _iso(row.signed_on),
                "st": _iso(row.starts_on),
                "en": _iso(row.ends_on),
                "co": _iso(row.cancelled_on),
                "sb": row.superseded_by,
                "pr": row.procedure,
                "of": row.offers_received,
                "c": contractors.get(row.id, []),
                "l": links.get(row.id, []),
                "u": document_url(row.source, row.kind, row.source_id),
                "sm": [i for i in group if i != index][:SIMILAR],
            }
        )
        state.ids[fnv1a(row.source_id) % ID_BUCKETS][row.source_id] = index

        if not row.superseded_by:
            for token in tokens(row.search_key, search_key(row.keywords) if row.keywords else None):
                state.postings[token].append(index)
            if row.organisation_id and len(state.recent[row.organisation_id]) < RECENT:
                state.recent[row.organisation_id].append(index)
            _collect_feeds(state, row, rows[-1])

        if len(rows) == SHARD:
            _flush(state, rows, details)
    if rows:
        _flush(state, rows, details)

    (state.out / "attrs").mkdir()
    columns = {"amount": amount, "cpv": cpv, "published": published, "deadline": deadline}
    for name, column in {**columns, "nuts": nuts, "org": org}.items():
        if struct.pack("=H", 1) != struct.pack("<H", 1):
            column.byteswap()  # the web app reads little-endian
        (state.out / "attrs" / f"{name}.bin").write_bytes(column.tobytes())
    (state.out / "attrs" / "kind.bin").write_bytes(bytes(kind))
    (state.out / "attrs" / "flags.bin").write_bytes(bytes(flags))


def _flush(state: Build, rows: list[list[Any]], details: list[dict[str, Any]]) -> None:
    shard = state.count // SHARD
    _write_json(state.out / "rows" / f"{shard}.json", rows)
    _write_json(state.out / "details" / f"{shard}.json", details)
    state.count += len(rows)
    rows.clear()
    details.clear()


def _collect_feeds(state: Build, row: Any, summary: list[Any]) -> None:
    entry = {"row": summary, "published": row.published_at}
    keys = ["all"]
    for code in row.cpv_codes or []:
        keys.append(f"cpv-{code[:2]}")
    if row.nuts_code and row.nuts_code.startswith("EL") and len(row.nuts_code) >= 4:
        keys.append(f"region-{row.nuts_code[:4]}")
    for key in dict.fromkeys(keys):
        if len(state.feeds[key]) < FEED_ITEMS:
            state.feeds[key].append(entry)


def _write_index(state: Build) -> None:
    shards: dict[str, dict[str, str]] = defaultdict(dict)
    for token, indexes in state.postings.items():
        shards[shard_of(token)][token] = encode_postings(indexes)
    for name, entries in shards.items():
        _write_json(state.out / "index" / f"{name}.json", entries)


def _write_feeds(state: Build, generated: datetime) -> None:
    kinds_el = {
        "request": "Αίτημα",
        "notice": "Διαγωνισμός",
        "award": "Ανάθεση",
        "contract": "Σύμβαση",
        "payment": "Πληρωμή",
        "spending_approval": "Έγκριση δαπάνης",
        "commitment": "Ανάληψη υποχρέωσης",
        "final_award": "Κατακύρωση",
    }
    for key, entries in state.feeds.items():
        items = []
        for entry in entries:
            row = entry["row"]
            link = f"{state.site_url}/el/record/?id={quote(row[0], safe='')}"
            org = state.orgs[row[4]][1] if row[4] >= 0 else ""
            amount = row[5] if row[5] is not None else row[6]
            summary = " · ".join(
                part
                for part in (
                    kinds_el.get(row[2], row[2]),
                    org,
                    f"{amount:,.2f} €".replace(",", " ") if amount is not None else "",
                )
                if part
            )
            published: datetime = entry["published"]
            items.append(
                "<item>"
                f"<title>{escape(row[3])}</title>"
                f"<link>{escape(link)}</link>"
                f'<guid isPermaLink="false">{escape(row[0])}</guid>'
                f"<pubDate>{published.strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>"
                f"<description>{escape(summary)}</description>"
                "</item>"
            )
        title = "ixnos-data" + ("" if key == "all" else f" · {key}")
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<rss version="2.0"><channel>'
            f"<title>{escape(title)}</title>"
            f"<link>{escape(state.site_url)}/el/</link>"
            "<description>ΚΗΜΔΗΣ, Διαύγεια (CC BY 4.0)</description>"
            "<language>el</language>"
            f"<lastBuildDate>{generated.strftime('%a, %d %b %Y %H:%M:%S +0000')}</lastBuildDate>"
            + "".join(items)
            + "</channel></rss>"
        )
        path = state.out / "feeds" / f"{key}.xml"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(xml, encoding="utf-8")


VALID = "NOT p.cancelled AND p.superseded_by IS NULL"
AWARDED = f"p.kind = 'award' AND p.amount_eur <= {PLAUSIBLE_MAX}"
APPROVED = (
    "p.source = 'diavgeia' AND p.kind = 'spending_approval'"
    f" AND p.amount_with_vat_eur <= {PLAUSIBLE_MAX}"
)
PAID = f"p.source = 'diavgeia' AND p.kind = 'payment' AND p.amount_with_vat_eur <= {PLAUSIBLE_MAX}"


def _organisations(connection: Connection, state: Build) -> None:
    """Authority pages, with the same figures as the API's GET /v1/organisations/{id}."""
    pages: dict[str, dict[str, Any]] = {}
    for row in connection.execute(
        text(
            "SELECT o.id, o.name_el, o.name_en, o.type, o.tax_id, o.website, o.parent_id,"
            " parent.name_el AS parent_name"
            " FROM organisation o LEFT JOIN organisation parent ON parent.id = o.parent_id"
        )
    ):
        pages[row.id] = {
            "id": row.id,
            "nameEl": row.name_el,
            "nameEn": row.name_en,
            "type": row.type,
            "taxId": row.tax_id,
            "website": row.website,
            "parent": {"id": row.parent_id, "name": row.parent_name or row.parent_id}
            if row.parent_id
            else None,
            "itemCounts": {},
            "awardedLast12MonthsEur": None,
            "paidLast12MonthsEur": None,
            "awardedByYear": [],
            "topContractors": [],
            "recent": state.recent.get(row.id, []),
            "dominantSupplier": None,
        }

    for row in connection.execute(
        text(
            "SELECT organisation_id, kind, count(*) AS n FROM procurement_item"
            " WHERE organisation_id IS NOT NULL GROUP BY 1, 2"
        )
    ):
        if row.organisation_id in pages:
            pages[row.organisation_id]["itemCounts"][row.kind] = row.n

    for row in connection.execute(
        text(
            f"SELECT p.organisation_id,"
            f" sum(p.amount_eur) FILTER (WHERE {AWARDED}) AS awarded,"
            f" sum(p.amount_with_vat_eur) FILTER (WHERE {PAID}) AS paid"
            f" FROM procurement_item p"
            f" WHERE p.organisation_id IS NOT NULL AND {VALID}"
            f" AND p.published_at >= now() - interval '12 months' GROUP BY 1"
        )
    ):
        if row.organisation_id in pages:
            pages[row.organisation_id]["awardedLast12MonthsEur"] = _float(row.awarded)
            pages[row.organisation_id]["paidLast12MonthsEur"] = _float(row.paid)

    for row in connection.execute(
        text(
            f"SELECT p.organisation_id,"
            f" extract(year FROM p.published_at AT TIME ZONE 'Europe/Athens')::int AS year,"
            f" count(*) FILTER (WHERE {AWARDED})::int AS awards,"
            f" coalesce(sum(p.amount_eur) FILTER (WHERE {AWARDED}), 0) AS amount,"
            f" coalesce(sum(p.amount_with_vat_eur) FILTER (WHERE {APPROVED}), 0) AS approved,"
            f" coalesce(sum(p.amount_with_vat_eur) FILTER (WHERE {PAID}), 0) AS paid"
            f" FROM procurement_item p"
            f" WHERE p.organisation_id IS NOT NULL AND {VALID}"
            f" AND (({AWARDED}) OR ({APPROVED}) OR ({PAID}))"
            f" GROUP BY 1, 2 ORDER BY 1, 2 DESC"
        )
    ):
        if row.organisation_id in pages:
            pages[row.organisation_id]["awardedByYear"].append(
                {
                    "year": row.year,
                    "awards": row.awards,
                    "amountEur": float(row.amount),
                    "approvedEur": float(row.approved),
                    "paidEur": float(row.paid),
                }
            )

    for row in connection.execute(
        text(
            f"""
            SELECT * FROM (
              SELECT t.*, row_number() OVER (
                PARTITION BY organisation_id ORDER BY greatest(amount, paid) DESC) AS rank
              FROM (
                SELECT p.organisation_id, c.id, c.name,
                  count(*) FILTER (WHERE ic.role = 'winner' AND {AWARDED})::int AS awards,
                  coalesce(sum(coalesce(ic.amount_eur, p.amount_eur))
                    FILTER (WHERE ic.role = 'winner' AND {AWARDED}), 0) AS amount,
                  coalesce(sum(coalesce(ic.amount_eur, p.amount_with_vat_eur))
                    FILTER (WHERE ic.role = 'payee' AND {PAID}), 0) AS paid
                FROM procurement_item p
                JOIN item_contractor ic ON ic.item_id = p.id
                JOIN contractor c ON c.id = ic.contractor_id
                WHERE p.organisation_id IS NOT NULL AND {VALID}
                  AND ((ic.role = 'winner' AND {AWARDED}) OR (ic.role = 'payee' AND {PAID}))
                GROUP BY p.organisation_id, c.id, c.name) t) ranked
            WHERE rank <= {TOP_CONTRACTORS} ORDER BY organisation_id, rank
            """
        )
    ):
        if row.organisation_id in pages:
            pages[row.organisation_id]["topContractors"].append(
                {
                    "name": row.name,
                    "awards": row.awards,
                    "amountEur": float(row.amount),
                    "paidEur": float(row.paid),
                }
            )

    for row in connection.execute(
        text(
            f"""
            WITH awards AS (
              SELECT p.organisation_id, c.id, c.name,
                     coalesce(ic.amount_eur, p.amount_eur) AS amount
              FROM procurement_item p
              JOIN item_contractor ic ON ic.item_id = p.id AND ic.role = 'winner'
              JOIN contractor c ON c.id = ic.contractor_id
              WHERE p.organisation_id IS NOT NULL AND {VALID} AND {AWARDED}
                AND p.published_at >= now() - interval '12 months'),
            totals AS (
              SELECT organisation_id, sum(amount) AS total, count(*) AS n
              FROM awards GROUP BY 1),
            leaders AS (
              SELECT a.organisation_id, a.name, sum(a.amount) AS amount, count(*) AS n,
                     row_number() OVER (
                       PARTITION BY a.organisation_id
                       ORDER BY sum(a.amount) DESC NULLS LAST) AS rank
              FROM awards a GROUP BY a.organisation_id, a.id, a.name)
            SELECT l.organisation_id, l.name,
                   coalesce(l.amount / nullif(t.total, 0), 0) AS share,
                   l.n::int AS awards, t.n::int AS total_awards
            FROM leaders l JOIN totals t USING (organisation_id)
            WHERE l.rank = 1
            """
        )
    ):
        if (
            row.organisation_id in pages
            and float(row.share) >= MIN_SHARE
            and row.awards >= MIN_AWARDS
            and row.total_awards >= MIN_TOTAL_AWARDS
        ):
            pages[row.organisation_id]["dominantSupplier"] = {
                "name": row.name,
                "share": round(float(row.share), 3),
                "awards": row.awards,
                "totalAwards": row.total_awards,
            }

    buckets: list[dict[str, Any]] = [{} for _ in range(ORG_BUCKETS)]
    for org_id, page in pages.items():
        buckets[fnv1a(org_id) % ORG_BUCKETS][org_id] = page
    for bucket, entries in enumerate(buckets):
        _write_json(state.out / "orgs" / f"{bucket}.json", entries)


def _home(connection: Connection, state: Build) -> dict[str, Any]:
    """Open tenders, closing soonest first, for the home page."""
    open_count = connection.execute(
        text(
            "SELECT count(*) FROM procurement_item WHERE kind = 'notice' AND NOT cancelled"
            " AND deadline_at > now() AND superseded_by IS NULL"
        )
    ).scalar_one()
    closing = [
        row.source_id
        for row in connection.execute(
            text(
                "SELECT source_id FROM procurement_item WHERE kind = 'notice' AND NOT cancelled"
                " AND deadline_at > now() AND superseded_by IS NULL"
                f" ORDER BY deadline_at LIMIT {HOME_CLOSING}"
            )
        )
    ]
    indexes = [state.ids[fnv1a(source_id) % ID_BUCKETS][source_id] for source_id in closing]
    return {"openCount": open_count, "closing": indexes}


def _status(connection: Connection) -> dict[str, Any]:
    """What /status shows, in the shape of GET /v1/metrics, without the account figures."""
    sources = [
        {
            "source": row.source,
            "records": row.records,
            "updatedAt": _iso(row.updated_at),
            "lagMinutes": None if row.lag_minutes is None else round(float(row.lag_minutes), 1),
            "runsSucceeded": row.succeeded,
            "runsTotal": row.total,
        }
        for row in connection.execute(
            text(
                """
                WITH records AS (
                  SELECT source, count(*) AS records,
                         percentile_cont(0.5) WITHIN GROUP (
                           ORDER BY extract(epoch FROM ingested_at - published_at) / 60)
                           FILTER (WHERE ingested_at >= now() - interval '7 days'
                                     AND published_at >= now() - interval '7 days'
                                     AND ingested_at >= published_at) AS lag_minutes
                  FROM procurement_item GROUP BY source),
                runs AS (
                  SELECT source, max(finished_at) FILTER (WHERE status = 'succeeded') AS updated_at,
                         count(*) FILTER (WHERE status = 'succeeded'
                                AND started_at >= now() - interval '7 days') AS succeeded,
                         count(*) FILTER (WHERE started_at >= now() - interval '7 days') AS total
                  FROM ingestion_run GROUP BY source)
                SELECT coalesce(r.source, u.source) AS source, coalesce(r.records, 0) AS records,
                       u.updated_at, r.lag_minutes, coalesce(u.succeeded, 0) AS succeeded,
                       coalesce(u.total, 0) AS total
                FROM records r FULL JOIN runs u ON u.source = r.source
                ORDER BY 1
                """
            )
        )
    ]
    runs = [
        {
            "source": row.source,
            "mode": row.mode,
            "status": row.status,
            "startedAt": _iso(row.started_at),
            "durationSeconds": (
                round((row.finished_at - row.started_at).total_seconds(), 1)
                if row.finished_at
                else None
            ),
            "fetched": row.fetched,
            "inserted": row.inserted,
            "updated": row.updated,
        }
        for row in connection.execute(
            text(
                "SELECT source, mode, status, started_at, finished_at, fetched, inserted, updated"
                " FROM ingestion_run ORDER BY started_at DESC LIMIT 10"
            )
        )
    ]
    updated = [s["updatedAt"] for s in sources if s["updatedAt"]]
    return {"updatedAt": max(updated) if updated else None, "sources": sources, "recentRuns": runs}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="static_site", description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--site-url",
        default="https://vwdshka.github.io/ixnos-data",
        help="public address of the site, for links in the RSS feeds",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    from ixnos_data_pipeline.config import Settings
    from ixnos_data_pipeline.db.engine import engine_from_settings

    started = datetime.now(UTC)
    meta = build(engine_from_settings(Settings()), args.out, args.site_url)
    log.info(
        "static site data: %d records in %s",
        meta["count"],
        timedelta(seconds=round((datetime.now(UTC) - started).total_seconds())),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
