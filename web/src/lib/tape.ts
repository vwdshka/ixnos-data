// The records a visitor has put on the tape. Kept in this browser only; the tape page takes them
// from its URL, so a tape can be shared as a link. The functions touch the browser only when
// called, so the server can import the limit and the link helper.

export const TAPE_MAX = 6;
const KEY = "tape";
const EVENT = "tape-change";
const EMPTY: readonly string[] = [];
let cached: { raw: string | null; ids: readonly string[] } = { raw: null, ids: EMPTY };

export function readTape(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode, disabled cookies): an empty tape.
  }
  if (raw !== cached.raw) {
    let ids: readonly string[] = EMPTY;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, TAPE_MAX) : EMPTY;
    } catch {
      ids = EMPTY;
    }
    cached = { raw, ids };
  }
  return cached.ids;
}

export function writeTape(ids: readonly string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, TAPE_MAX)));
  } catch {
    // Nothing to do: the tape just won't be remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTape(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => event.key === KEY && onChange();
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const serverTape = () => EMPTY;

export function tapeHref(ids: readonly string[]): { pathname: "/tape"; query: Record<string, string> } {
  return { pathname: "/tape", query: ids.length > 0 ? { ids: ids.join(",") } : {} };
}

/** The record identifiers in a tape link's ?ids=, at most TAPE_MAX. */
export function readTapeIds(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, TAPE_MAX);
}
