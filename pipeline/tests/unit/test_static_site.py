import base64

import pytest

from ixnos_data_pipeline.static_site import (
    encode_postings,
    fnv1a,
    shard_of,
    signals,
    tokens,
)


def decode_postings(encoded: str) -> list[int]:
    """What the web app does to read a posting list."""
    indexes, value, shift, previous = [], 0, 0, -1
    for byte in base64.b64decode(encoded):
        value |= (byte & 0x7F) << shift
        if byte & 0x80:
            shift += 7
            continue
        previous += value
        indexes.append(previous)
        value, shift = 0, 0
    return indexes


def test_fnv1a_matches_the_reference_values() -> None:
    # Published FNV-1a 32-bit test vectors; the web app uses the same function to find buckets.
    assert fnv1a("") == 0x811C9DC5
    assert fnv1a("a") == 0xE40C292C
    assert fnv1a("foobar") == 0xBF9CF968


@pytest.mark.parametrize("indexes", [[0], [0, 1, 2], [5, 130, 131, 20_000, 585_266]])
def test_postings_round_trip(indexes: list[int]) -> None:
    assert decode_postings(encode_postings(indexes)) == indexes


def test_signals_follow_the_published_definitions() -> None:
    assert signals("contract", "1", None, 1, 100_000) == ["single_offer"]
    assert signals("contract", "6", None, 1, 5_000) == []  # direct awards have one offer
    assert signals("award", "6", None, None, 29_900) == ["near_direct_award_limit"]
    assert signals("award", "6", None, None, 30_001) == []
    assert signals("award", "6", "10", None, 29_900) == []  # works: the limit is 60,000
    assert signals("contract", "6", "10", None, 59_000) == ["near_direct_award_limit"]
    assert signals("notice", "6", None, None, 29_900) == []


def test_tokens_skip_common_words_and_single_letters() -> None:
    assert tokens("promithia farmakon gia to kentro i ygias", None) == {
        "promithia",
        "farmakon",
        "kentro",
        "ygias",
    }


def test_shards_are_the_first_two_characters() -> None:
    assert shard_of("promithia") == "pr"
    assert shard_of("2026") == "20"
    assert shard_of("x") == "_"
