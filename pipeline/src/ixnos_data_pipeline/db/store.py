"""Writes transformed records to the database, one page per transaction.

A record is only rewritten when its raw payload changed. ingested_at is set once, on insert,
because the notifier uses it as its checkpoint. Links resolve in both directions, so an
award finds its notice whichever arrives first.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Connection, and_, delete, literal_column, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from ixnos_data_pipeline.db.bundles import ContractorRef, ItemBundle
from ixnos_data_pipeline.db.tables import (
    contractor,
    item_contractor,
    item_link,
    organisation,
    procurement_item,
)

_KEY_COLUMNS = {"id", "source", "source_id", "ingested_at", "search"}
_UPDATABLE = [c.name for c in procurement_item.columns if c.name not in _KEY_COLUMNS]


@dataclass
class StoreCounts:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0


def store_bundles(
    connection: Connection, bundles: Sequence[ItemBundle], now: datetime
) -> StoreCounts:
    # The same record can appear twice in a batch (e.g. repeated across pages); keep the last.
    by_key = {(b.item["source"], b.item["source_id"]): b for b in bundles}
    bundles = list(by_key.values())
    if not bundles:
        return StoreCounts()

    _ensure_organisations(connection, bundles, now)
    changed = _upsert_items(connection, bundles, now)
    counts = StoreCounts(
        inserted=sum(1 for _, inserted in changed.values() if inserted),
        updated=sum(1 for _, inserted in changed.values() if not inserted),
        unchanged=len(bundles) - len(changed),
    )
    if changed:
        changed_bundles = [b for b in bundles if b.item["source_id"] in changed]
        item_ids = {source_id: item_id for source_id, (item_id, _) in changed.items()}
        _replace_contractors(connection, changed_bundles, item_ids)
        _replace_links(connection, changed_bundles, item_ids)
        _resolve_links(connection, bundles[0].item["source"], item_ids)
    return counts


def _ensure_organisations(
    connection: Connection, bundles: Sequence[ItemBundle], now: datetime
) -> None:
    rows = {
        b.organisation.id: {
            "id": b.organisation.id,
            "name_el": b.organisation.name_el,
            "tax_id": b.organisation.tax_id,
            "updated_at": now,
        }
        for b in bundles
        if b.organisation
    }
    if rows:
        connection.execute(
            insert(organisation)
            .values(list(rows.values()))
            .on_conflict_do_nothing(index_elements=[organisation.c.id])
        )


def _upsert_items(
    connection: Connection, bundles: Sequence[ItemBundle], now: datetime
) -> dict[str, tuple[int, bool]]:
    """Returns {source_id: (id, inserted)} for every inserted or changed record."""
    values = insert(procurement_item).values([{**b.item, "updated_at": now} for b in bundles])
    statement = values.on_conflict_do_update(
        index_elements=[procurement_item.c.source, procurement_item.c.source_id],
        set_={name: values.excluded[name] for name in _UPDATABLE},
        where=procurement_item.c.raw.is_distinct_from(values.excluded.raw),
    ).returning(
        procurement_item.c.id,
        procurement_item.c.source_id,
        # xmax is 0 for a freshly inserted row and non-zero for an updated one.
        literal_column("(xmax = 0)").label("inserted"),
    )
    return {row.source_id: (row.id, row.inserted) for row in connection.execute(statement)}


def _contractor_ids(
    connection: Connection, refs: Sequence[ContractorRef]
) -> dict[tuple[str | None, str], int]:
    ids: dict[tuple[str | None, str], int] = {}

    with_vat = {r.tax_id: r for r in refs if r.tax_id}
    if with_vat:
        values = insert(contractor).values(
            [
                {"tax_id": r.tax_id, "name": r.name, "country_code": r.country_code}
                for r in with_vat.values()
            ]
        )
        statement = values.on_conflict_do_update(
            index_elements=[contractor.c.tax_id],
            index_where=contractor.c.tax_id.isnot(None),
            set_={"name": values.excluded.name},
        ).returning(contractor.c.id, contractor.c.tax_id)
        by_vat = {row.tax_id: row.id for row in connection.execute(statement)}
        ids.update({(r.tax_id, r.name): by_vat[r.tax_id] for r in refs if r.tax_id})

    names = {r.name: r for r in refs if not r.tax_id}
    if names:
        found = connection.execute(
            select(contractor.c.id, contractor.c.name).where(
                contractor.c.tax_id.is_(None), contractor.c.name.in_(list(names))
            )
        ).all()
        by_name = {row.name: row.id for row in found}
        missing = [r for name, r in names.items() if name not in by_name]
        if missing:
            inserted = connection.execute(
                insert(contractor)
                .values([{"name": r.name, "country_code": r.country_code} for r in missing])
                .returning(contractor.c.id, contractor.c.name)
            )
            by_name.update({row.name: row.id for row in inserted})
        ids.update({(None, name): by_name[name] for name in names})
    return ids


def _replace_contractors(
    connection: Connection, bundles: Sequence[ItemBundle], item_ids: dict[str, int]
) -> None:
    connection.execute(
        delete(item_contractor).where(item_contractor.c.item_id.in_(item_ids.values()))
    )
    refs = [ref for b in bundles for ref in b.contractors]
    if not refs:
        return
    contractor_ids = _contractor_ids(connection, refs)
    rows: dict[tuple[int, int, str], dict[str, Any]] = {}
    for bundle in bundles:
        item_id = item_ids[bundle.item["source_id"]]
        for ref in bundle.contractors:
            key = (item_id, contractor_ids[(ref.tax_id, ref.name)], ref.role)
            row = rows.setdefault(key, {
                "item_id": key[0], "contractor_id": key[1], "role": ref.role, "amount_eur": None,
            })  # fmt: skip
            if ref.amount_eur is not None:
                row["amount_eur"] = (row["amount_eur"] or 0) + ref.amount_eur
    connection.execute(insert(item_contractor).values(list(rows.values())))


def _replace_links(
    connection: Connection, bundles: Sequence[ItemBundle], item_ids: dict[str, int]
) -> None:
    connection.execute(delete(item_link).where(item_link.c.from_item_id.in_(item_ids.values())))
    rows = {
        (item_ids[b.item["source_id"]], link.relation, link.to_source, link.to_source_id): {
            "from_item_id": item_ids[b.item["source_id"]],
            "relation": link.relation,
            "to_source": link.to_source,
            "to_source_id": link.to_source_id,
        }
        for b in bundles
        for link in b.links
    }
    if rows:
        connection.execute(insert(item_link).values(list(rows.values())))


def _resolve_links(connection: Connection, source: str, item_ids: dict[str, int]) -> None:
    """Points unresolved links at their target: links from these records, and links from
    earlier records to these ones."""
    target = procurement_item.alias("target")
    connection.execute(
        update(item_link)
        .where(
            item_link.c.to_item_id.is_(None),
            target.c.source == item_link.c.to_source,
            target.c.source_id == item_link.c.to_source_id,
            or_(
                item_link.c.from_item_id.in_(item_ids.values()),
                and_(item_link.c.to_source == source, item_link.c.to_source_id.in_(list(item_ids))),
            ),
        )
        .values(to_item_id=target.c.id)
    )
