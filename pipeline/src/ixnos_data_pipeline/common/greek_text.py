"""Greek text normalisation for search. Must match GreekText.cs in the API: both run
contracts/text-normalisation/cases.json.

Postgres full-text already ignores accents; this is for trigram matching and Greeklish.
"""

import itertools
import re
import unicodedata

_WHITESPACE = re.compile(r"\s+")
_LETTER_RUN = re.compile(r"[^\W\d_]+")
_GREEK_LETTER = re.compile(r"[Ͱ-Ͽ]")
_LATIN_LETTER = re.compile(r"[a-z]")
_DOUBLED_LETTER = re.compile(r"([a-z])\1+")

# Lowercased Latin letters that look like Greek ones, mostly from uppercase data entry
# (A, B, E, H, I, K, M, N, O, P, T, X, Y, Z) plus lowercase v and u.
_HOMOGLYPHS = str.maketrans("abehikmnoptxyzvu", "αβεηικμνορτχυζνυ")

# Phonetic key tables. Two-letter entries are matched before one-letter ones.
_GREEK_KEYS = {
    "ου": "u", "ει": "i", "οι": "i", "υι": "i", "αι": "e", "αυ": "ab", "ευ": "eb",
    "μπ": "b", "ντ": "d", "γκ": "g", "γγ": "g",
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i", "θ": "th",
    "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "ks", "ο": "o", "π": "p",
    "ρ": "r", "σ": "s", "τ": "t", "υ": "i", "φ": "f", "χ": "h", "ψ": "ps", "ω": "o",
}  # fmt: skip
_LATIN_KEYS = {
    "ou": "u", "ei": "i", "oi": "i", "yi": "i", "ui": "i", "ai": "e", "au": "ab",
    "av": "ab", "eu": "eb", "ev": "eb", "mp": "b", "nt": "d", "gk": "g", "gg": "g",
    "th": "th", "ch": "h", "kh": "h",
    "a": "a", "b": "b", "c": "k", "d": "d", "e": "e", "f": "f", "g": "g", "i": "i",
    "j": "tz", "k": "k", "l": "l", "m": "m", "n": "n", "o": "o", "p": "p", "q": "k",
    "r": "r", "s": "s", "t": "t", "u": "i", "v": "b", "w": "o", "y": "i", "z": "z",
}  # fmt: skip
# Greeklish letters with more than one reading, most likely first.
_AMBIGUOUS = {"h": ("i", "h"), "x": ("h", "ks")}
# Greeklish digits, only read as letters when next to a vowel ("8elo", "a3ia", not "3d").
_DIGIT_LETTERS = {"8": "th", "3": "ks"}
_LATIN_VOWELS = frozenset("aeiouyw")

MAX_EXPANDED = 3

# Case-preserving look-alike fix for display text (labels, names), where lowercasing is wrong.
_DISPLAY_HOMOGLYPHS = str.maketrans(
    "ABEHIKMNOPTXYZabehikmnoptxyzvu", "ΑΒΕΗΙΚΜΝΟΡΤΧΥΖαβεηικμνορτχυζνυ"
)
_ANY_LATIN_LETTER = re.compile(r"[A-Za-z]")


def normalise(text: str) -> str:
    """Lowercase, strip accents, fold final sigma, fix Latin look-alikes inside Greek
    words and collapse whitespace."""
    lowered = text.lower()
    decomposed = unicodedata.normalize("NFD", lowered)
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    folded = unicodedata.normalize("NFC", stripped).replace("ς", "σ").replace("µ", "μ")
    fixed = _LETTER_RUN.sub(_fix_homoglyphs, folded)
    return _WHITESPACE.sub(" ", fixed).strip()


def fix_latin_lookalikes(text: str) -> str:
    """Replaces Latin letters that look like Greek ones inside words that also contain Greek
    letters, keeping case: "Aττική" (Latin A) -> "Αττική". Words with no Greek letters are
    left alone. For display text; `normalise` does the same for search text."""

    def fix(match: re.Match[str]) -> str:
        word = match.group()
        if _GREEK_LETTER.search(word.lower()) and _ANY_LATIN_LETTER.search(word):
            return word.translate(_DISPLAY_HOMOGLYPHS)
        return word

    return _LETTER_RUN.sub(fix, text)


def search_keys(text: str) -> list[str]:
    """Each ambiguous Greeklish letter (h, x) doubles the keys, up to MAX_EXPANDED of them."""
    segments = _key_segments(normalise(text))
    ambiguous = [i for i, options in enumerate(segments) if len(options) > 1]
    expanded = set(ambiguous[:MAX_EXPANDED])
    choices = [options if i in expanded else options[:1] for i, options in enumerate(segments)]

    keys: list[str] = []
    for combination in itertools.product(*choices):
        key = _DOUBLED_LETTER.sub(r"\1", _WHITESPACE.sub(" ", "".join(combination)).strip())
        if key not in keys:
            keys.append(key)
    return keys


def search_key(text: str) -> str:
    """The key stored text is indexed under."""
    return search_keys(text)[0]


def _fix_homoglyphs(match: re.Match[str]) -> str:
    word = match.group()
    if _GREEK_LETTER.search(word) and _LATIN_LETTER.search(word):
        return word.translate(_HOMOGLYPHS)
    return word


def _key_segments(text: str) -> list[tuple[str, ...]]:
    segments: list[tuple[str, ...]] = []
    i = 0
    while i < len(text):
        pair, char = text[i : i + 2], text[i]
        if len(pair) == 2 and (pair in _GREEK_KEYS or pair in _LATIN_KEYS):
            segments.append((_GREEK_KEYS.get(pair) or _LATIN_KEYS[pair],))
            i += 2
            continue
        if char in _AMBIGUOUS:
            segments.append(_AMBIGUOUS[char])
        elif char in _GREEK_KEYS:
            segments.append((_GREEK_KEYS[char],))
        elif char in _LATIN_KEYS:
            segments.append((_LATIN_KEYS[char],))
        elif char in _DIGIT_LETTERS and _next_to_vowel(text, i):
            segments.append((_DIGIT_LETTERS[char],))
        elif char.isalnum():
            segments.append((char,))
        else:
            segments.append((" ",))
        i += 1
    return segments


def _next_to_vowel(text: str, i: int) -> bool:
    before = text[i - 1] if i > 0 else ""
    after = text[i + 1] if i + 1 < len(text) else ""
    return before in _LATIN_VOWELS or after in _LATIN_VOWELS
