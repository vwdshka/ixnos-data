// Greek text normalisation and phonetic search keys, for search in the browser (the static
// edition). A port of pipeline/src/ixnos_data_pipeline/common/greek_text.py; all three versions
// (Python, C#, this) run contracts/text-normalisation/cases.json.

const GREEK_LETTER = /[Ͱ-Ͽ]/;
const LATIN_LETTER = /[a-z]/;
const ANY_LETTER = /[\p{L}\p{N}]/u;

// Lowercased Latin letters that look like Greek ones, mostly from uppercase data entry.
const HOMOGLYPHS: Record<string, string> = Object.fromEntries(
  [..."abehikmnoptxyzvu"].map((latin, i) => [latin, "αβεηικμνορτχυζνυ"[i]]),
);

// Phonetic key tables. Two-letter entries are matched before one-letter ones.
const GREEK_KEYS: Record<string, string> = {
  ου: "u", ει: "i", οι: "i", υι: "i", αι: "e", αυ: "ab", ευ: "eb",
  μπ: "b", ντ: "d", γκ: "g", γγ: "g",
  α: "a", β: "b", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th",
  ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "ks", ο: "o", π: "p",
  ρ: "r", σ: "s", τ: "t", υ: "i", φ: "f", χ: "h", ψ: "ps", ω: "o",
};
const LATIN_KEYS: Record<string, string> = {
  ou: "u", ei: "i", oi: "i", yi: "i", ui: "i", ai: "e", au: "ab",
  av: "ab", eu: "eb", ev: "eb", mp: "b", nt: "d", gk: "g", gg: "g",
  th: "th", ch: "h", kh: "h",
  a: "a", b: "b", c: "k", d: "d", e: "e", f: "f", g: "g", i: "i",
  j: "tz", k: "k", l: "l", m: "m", n: "n", o: "o", p: "p", q: "k",
  r: "r", s: "s", t: "t", u: "i", v: "b", w: "o", y: "i", z: "z",
};
// Greeklish letters with more than one reading, most likely first.
const AMBIGUOUS: Record<string, string[]> = { h: ["i", "h"], x: ["h", "ks"] };
// Greeklish digits, only read as letters when next to a vowel ("8elo", "a3ia", not "3d").
const DIGIT_LETTERS: Record<string, string> = { "8": "th", "3": "ks" };
const LATIN_VOWELS = new Set("aeiouyw");
const MAX_EXPANDED = 3;

/** Lowercase, strip accents, fold final sigma, fix Latin look-alikes inside Greek words and
 * collapse whitespace. */
export function normalise(text: string): string {
  const stripped = text.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").normalize("NFC");
  const folded = stripped.replaceAll("ς", "σ").replaceAll("µ", "μ");
  const fixed = folded.replace(/\p{L}+/gu, (word) =>
    GREEK_LETTER.test(word) && LATIN_LETTER.test(word) ? [...word].map((c) => HOMOGLYPHS[c] ?? c).join("") : word,
  );
  return fixed.replace(/\s+/gu, " ").trim();
}

function segments(text: string): string[][] {
  const result: string[][] = [];
  const nextToVowel = (i: number) => LATIN_VOWELS.has(text[i - 1] ?? "") || LATIN_VOWELS.has(text[i + 1] ?? "");
  let i = 0;
  while (i < text.length) {
    const pair = text.slice(i, i + 2);
    const char = text[i];
    if (pair.length === 2 && (pair in GREEK_KEYS || pair in LATIN_KEYS)) {
      result.push([GREEK_KEYS[pair] ?? LATIN_KEYS[pair]]);
      i += 2;
      continue;
    }
    if (char in AMBIGUOUS) {
      result.push(AMBIGUOUS[char]);
    } else if (char in GREEK_KEYS) {
      result.push([GREEK_KEYS[char]]);
    } else if (char in LATIN_KEYS) {
      result.push([LATIN_KEYS[char]]);
    } else if (char in DIGIT_LETTERS && nextToVowel(i)) {
      result.push([DIGIT_LETTERS[char]]);
    } else if (ANY_LETTER.test(char)) {
      result.push([char]);
    } else {
      result.push([" "]);
    }
    i += 1;
  }
  return result;
}

/** The phonetic keys of a text; each ambiguous Greeklish letter (h, x) doubles them, up to
 * MAX_EXPANDED letters. The first key is the one stored text is indexed under. */
export function searchKeys(text: string): string[] {
  const parts = segments(normalise(text));
  const expanded = new Set(parts.flatMap((options, i) => (options.length > 1 ? [i] : [])).slice(0, MAX_EXPANDED));
  const choices = parts.map((options, i) => (expanded.has(i) ? options : options.slice(0, 1)));
  let combinations = [""];
  for (const options of choices) {
    combinations = combinations.flatMap((prefix) => options.map((option) => prefix + option));
  }
  const keys: string[] = [];
  for (const combination of combinations) {
    const key = combination.replace(/\s+/g, " ").trim().replace(/([a-z])\1+/g, "$1");
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}
