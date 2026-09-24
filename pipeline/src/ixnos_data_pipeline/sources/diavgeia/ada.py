"""Parsing ΑΔΑ (Διαύγεια decision numbers) like "ΛΓ2ΣΩΗΥ-Ν4Ψ".

ΚΗΜΔΗΣ references to them are typed by hand: Latin look-alikes, lowercase, several in one
field, dates stuck on the end, or "Δ/Α".
"""

import re

# At least one Greek letter: all-digit placeholders such as "00000-000" are not ΑΔΑ.
_ADA = re.compile(r"^(?=.*[Α-Ω])[0-9Α-Ω]{5,10}-[0-9Α-Ω]{3}$")
# Not preceded by an ΑΔΑ character or hyphen, and not followed by an ΑΔΑ character, so a
# date after a hyphen ("-02/01/2026") does not stop a match but a longer code does.
_ADA_IN_TEXT = re.compile(r"(?<![0-9Α-Ω-])[0-9Α-Ω]{5,10}-[0-9Α-Ω]{3}(?![0-9Α-Ω])")
_LATIN_LOOKALIKES = str.maketrans("ABEHIKMNOPTXYZ", "ΑΒΕΗΙΚΜΝΟΡΤΧΥΖ")
_SPACES_AROUND_HYPHEN = re.compile(r"\s*-\s*")


def _canonical(text: str) -> str:
    return _SPACES_AROUND_HYPHEN.sub("-", text.strip()).upper().translate(_LATIN_LOOKALIKES)


def normalise_ada(text: str | None) -> str | None:
    """The canonical ΑΔΑ when `text` is exactly one, otherwise None."""
    if not text:
        return None
    candidate = _canonical(text).replace(" ", "")
    return candidate if _ADA.match(candidate) else None


def find_adas(text: str | None) -> list[str]:
    """Every ΑΔΑ in free text, canonical and in order of appearance, without repeats."""
    if not text:
        return []
    found = [ada for ada in _ADA_IN_TEXT.findall(_canonical(text)) if _ADA.match(ada)]
    return list(dict.fromkeys(found))
