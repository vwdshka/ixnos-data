import pytest

from ixnos_data_pipeline.common.afm import clean_afm, is_valid_afm


@pytest.mark.parametrize(
    ("value", "valid"),
    [
        ("090114939", True),  # ΔΗΜΟΣ ΠΑΞΩΝ
        ("997913715", True),  # ΠΕΡΙΦΕΡΕΙΑ ΙΟΝΙΩΝ ΝΗΣΩΝ
        ("090114938", False),  # wrong check digit
        ("123456789", False),  # placeholder seen in the register
        ("000000000", False),
        ("0902690808", False),  # ten digits
        ("09011493", False),
        ("", False),
    ],
)
def test_is_valid_afm(value: str, valid: bool) -> None:
    assert is_valid_afm(value) is valid


def test_clean_afm_strips_spaces_and_rejects_invalid() -> None:
    assert clean_afm(" 090114939 ") == "090114939"
    assert clean_afm("123456789") is None
    assert clean_afm(None) is None
