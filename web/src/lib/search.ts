import type { SearchParams } from "@/lib/api/client";

// The search page's query-string fields; the form, the page, pagination, the RSS feed and the
// CSV download all read the same list.
export const FIELDS = [
  "q", "kind", "cpv", "nuts", "minAmount", "maxAmount", "from", "to", "sort", "organisation", "signal",
] as const;

// The API's signal names (ADR 0012).
export const SIGNALS = ["single_offer", "near_direct_award_limit"] as const;

export type SearchFormValues = Partial<Record<(typeof FIELDS)[number], string>>;

function first(value: string | string[] | null | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}

function toNumber(value: string | undefined): number | undefined {
  const number = value ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

export function readSearchValues(read: (name: string) => string | string[] | null | undefined): SearchFormValues {
  return Object.fromEntries(FIELDS.map((name) => [name, first(read(name))])) as SearchFormValues;
}

export function toSearchParams(values: SearchFormValues, page: number, pageSize: number): SearchParams {
  return {
    q: values.q,
    kind: values.kind ? [values.kind] : undefined,
    cpv: values.cpv,
    nuts: values.nuts,
    organisation: values.organisation,
    minAmount: toNumber(values.minAmount),
    maxAmount: toNumber(values.maxAmount),
    from: values.from,
    to: values.to,
    sort: values.sort,
    signal: values.signal,
    page,
    pageSize,
  };
}

// The same search as a query string, without empty fields.
export function searchQueryString(values: SearchFormValues): string {
  return new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
}

// Page numbers to show around the current one: always the first and last, the current page and
// its neighbours, and null for each gap ("…"). A gap of a single page shows that page instead.
export function pageWindow(page: number, pages: number): (number | null)[] {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const n of shown) {
    const previous = result.at(-1);
    if (typeof previous === "number" && n - previous === 2) {
      result.push(previous + 1);
    } else if (typeof previous === "number" && n - previous > 2) {
      result.push(null);
    }
    result.push(n);
  }
  return result;
}
