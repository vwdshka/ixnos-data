// Where a record or an authority lives. The full site has a page per record (/items/<id>); the
// static edition (GitHub Pages) can't, so one page reads the identifier from the query string.
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

export function recordHref(sourceId: string) {
  return STATIC_SITE
    ? { pathname: "/record" as const, query: { id: sourceId } }
    : `/items/${encodeURIComponent(sourceId)}`;
}

export function organisationHref(id: string) {
  return STATIC_SITE
    ? { pathname: "/organisation" as const, query: { id } }
    : `/organisations/${encodeURIComponent(id)}`;
}
