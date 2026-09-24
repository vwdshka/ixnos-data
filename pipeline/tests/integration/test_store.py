import copy
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import Engine, func, select, text

from ixnos_data_pipeline.db.store import store_bundles
from ixnos_data_pipeline.db.tables import contractor, item_contractor, item_link, procurement_item
from ixnos_data_pipeline.sources.khmdhs.client import RecordKind
from ixnos_data_pipeline.sources.khmdhs.transform import transform

LoadFixture = Callable[[str], Any]
NOW = datetime(2026, 9, 23, 9, 0, tzinfo=UTC)


@pytest.fixture
def empty(engine: Engine) -> Engine:
    with engine.begin() as connection:
        tables = "item_link, item_contractor, contractor, procurement_item, organisation"
        connection.execute(text(f"TRUNCATE {tables} CASCADE"))
    return engine


def fixture_records(load_fixture: LoadFixture) -> list[tuple[RecordKind, dict[str, Any]]]:
    return [
        (kind, raw)
        for kind in RecordKind
        for raw in load_fixture(f"khmdhs/{kind.value}_page.json")["content"]
    ]


def store(engine: Engine, records: list[tuple[RecordKind, dict[str, Any]]]) -> Any:
    with engine.begin() as connection:
        return store_bundles(connection, [transform(k, r) for k, r in records], NOW)


def count(engine: Engine, table: Any) -> int:
    with engine.connect() as connection:
        return int(connection.execute(select(func.count()).select_from(table)).scalar_one())


def test_storing_the_same_records_twice_changes_nothing(
    empty: Engine, load_fixture: LoadFixture
) -> None:
    records = fixture_records(load_fixture)

    first = store(empty, records)
    contractors = count(empty, contractor)
    second = store(empty, records)

    assert (first.inserted, first.updated, first.unchanged) == (10, 0, 0)
    assert (second.inserted, second.updated, second.unchanged) == (0, 0, 10)
    assert count(empty, procurement_item) == 10
    assert count(empty, contractor) == contractors


def test_changed_record_is_updated_and_its_links_replaced(
    empty: Engine, load_fixture: LoadFixture
) -> None:
    kind, raw = RecordKind.AUCTION, load_fixture("khmdhs/auction_page.json")["content"][0]
    store(empty, [(kind, raw)])
    links_before = count(empty, item_link)

    changed = copy.deepcopy(raw)
    changed["title"] = raw["title"] + " (ΟΡΘΗ ΕΠΑΝΑΛΗΨΗ)"
    result = store(empty, [(kind, changed)])

    assert (result.inserted, result.updated) == (0, 1)
    assert count(empty, item_link) == links_before
    assert count(empty, item_contractor) == 1
    with empty.connect() as connection:
        title = connection.execute(select(procurement_item.c.title)).scalar_one()
    assert title.endswith("(ΟΡΘΗ ΕΠΑΝΑΛΗΨΗ)")


def test_links_resolve_whichever_record_arrives_first(
    empty: Engine, load_fixture: LoadFixture
) -> None:
    award = load_fixture("khmdhs/auction_page.json")["content"][0]
    notice = copy.deepcopy(load_fixture("khmdhs/notice_page.json")["content"][0])
    notice["referenceNumber"] = award["noticeRefNo"]  # the notice this award names

    store(empty, [(RecordKind.AUCTION, award)])
    with empty.connect() as connection:
        before = connection.execute(
            select(item_link.c.to_item_id).where(item_link.c.relation == "notice")
        ).scalar_one()
    store(empty, [(RecordKind.NOTICE, notice)])
    with empty.connect() as connection:
        after = connection.execute(
            select(item_link.c.to_item_id).where(item_link.c.relation == "notice")
        ).scalar_one()
        notice_id = connection.execute(
            select(procurement_item.c.id).where(
                procurement_item.c.source_id == award["noticeRefNo"]
            )
        ).scalar_one()

    assert before is None
    assert after == notice_id


def test_search_finds_records_by_description(empty: Engine, load_fixture: LoadFixture) -> None:
    store(empty, fixture_records(load_fixture))

    with empty.connect() as connection:
        found = (
            connection.execute(
                text(
                    "SELECT source_id FROM procurement_item "
                    "WHERE search @@ websearch_to_tsquery('ixnos_data_greek', 'πυροσβεστήρες')"
                )
            )
            .scalars()
            .all()
        )

    assert found  # the fire-extinguisher award names them only in its CPV label and line items
