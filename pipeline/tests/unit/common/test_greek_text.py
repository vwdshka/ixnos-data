import json
from pathlib import Path
from typing import Any

import pytest

from ixnos_data_pipeline.common.greek_text import (
    fix_latin_lookalikes,
    normalise,
    search_key,
    search_keys,
)

# The same cases run in the .NET suite (IxnosData.Application.Tests).
CASES_FILE = Path(__file__).parents[4] / "contracts" / "text-normalisation" / "cases.json"
CASES: dict[str, list[dict[str, Any]]] = json.loads(CASES_FILE.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES["normalise"], ids=lambda c: c["input"][:30])
def test_normalise_matches_shared_cases(case: dict[str, Any]) -> None:
    assert normalise(case["input"]) == case["expected"]


@pytest.mark.parametrize("case", CASES["search_keys"], ids=lambda c: c["input"][:30])
def test_search_keys_match_shared_cases(case: dict[str, Any]) -> None:
    assert search_keys(case["input"]) == case["expected"]


def test_normalise_is_idempotent() -> None:
    for case in CASES["normalise"]:
        once = normalise(case["input"])
        assert normalise(once) == once


def test_search_key_is_first_key() -> None:
    assert search_key("xrimata") == "hrimata"


def test_greeklish_query_keys_include_the_greek_text_key() -> None:
    assert search_key("Υπηρεσίες καθαρισμού") in search_keys("ypiresies katharismou")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Aττική", "Αττική"),  # Latin A + Greek
        ("ΠPOMHΘEIA", "ΠΡΟΜΗΘΕΙΑ"),
        ("catering 2026", "catering 2026"),
        ("Βόρειος Τομέας Αθηνών", "Βόρειος Τομέας Αθηνών"),
    ],
)
def test_fix_latin_lookalikes_keeps_case(raw: str, expected: str) -> None:
    assert fix_latin_lookalikes(raw) == expected
