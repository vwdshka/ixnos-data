"""Greek VAT numbers (ΑΦΜ): nine digits, the last one a check digit.

The sources are full of placeholders ("123456789"), spaces and ten-digit typos, so nothing
gets linked on an ΑΦΜ that fails the check.
"""

import re

_NINE_DIGITS = re.compile(r"^\d{9}$")


def is_valid_afm(value: str) -> bool:
    if not _NINE_DIGITS.match(value) or value == "0" * 9:
        return False
    total = sum(int(digit) << (8 - i) for i, digit in enumerate(value[:8]))
    return total % 11 % 10 == int(value[8])


def clean_afm(value: str | None) -> str | None:
    """The ΑΦΜ with surrounding spaces removed, or None when it is missing or invalid."""
    if not value:
        return None
    candidate = value.strip()
    return candidate if is_valid_afm(candidate) else None
