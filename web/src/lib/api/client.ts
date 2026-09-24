import "server-only";
import { headers } from "next/headers";
import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

// Server-side client for the ixnos-data API. Paths, parameters and responses are checked against
// schema.d.ts, which scripts/generate-contracts.sh generates from the API itself.

export type SearchResult = components["schemas"]["SearchItemsResult"];
export type ItemSummary = components["schemas"]["ItemSummary"];
export type ItemDetail = components["schemas"]["ItemDetail"];
export type OrganisationDetail = components["schemas"]["OrganisationDetail"];
export type SearchParams = NonNullable<paths["/v1/search"]["get"]["parameters"]["query"]>;
export type SavedSearchRequest = components["schemas"]["SavedSearchRequest"];
export type AccountView = components["schemas"]["AccountView"];
export type ApiKeyView = components["schemas"]["ApiKeyView"];
export type DataStatus = components["schemas"]["DataStatus"];
export type PublicMetrics = components["schemas"]["PublicMetrics"];

export const api = createClient<paths>({ baseUrl: process.env.IXNOS_DATA_API_URL ?? "http://localhost:8080" });

// Pages call the API from the web server's own address. Passing on the visitor's address (which
// Caddy sets) gives each visitor their own rate limit, instead of one shared by everybody.
api.use({
  async onRequest({ request }) {
    try {
      const visitor = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
      if (visitor) {
        request.headers.set("X-Forwarded-For", visitor);
      }
    } catch {
      // Outside a request (at build time) there is no visitor to pass on.
    }
    return request;
  },
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(`ixnos-data API returned ${status}`);
  }
}

export type SearchOutcome =
  | { ok: true; result: SearchResult }
  | { ok: false; errors: Record<string, string[]> };

// Past this the visitor gets a "narrow your search" message instead of an endless wait.
const SEARCH_TIMEOUT_MS = 20_000;

export async function searchItems(query: SearchParams): Promise<SearchOutcome> {
  const { data, error, response } = await api.GET("/v1/search", {
    params: { query },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (data) {
    return { ok: true, result: data };
  }
  if (response.status === 400 && error && "errors" in error && error.errors) {
    return { ok: false, errors: error.errors as Record<string, string[]> };
  }
  throw new ApiError(response.status, error);
}

export async function getItem(sourceId: string): Promise<ItemDetail | null> {
  const { data, error, response } = await api.GET("/v1/items/{sourceId}", {
    params: { path: { sourceId } },
  });
  if (response.status === 404) {
    return null;
  }
  if (!data) {
    throw new ApiError(response.status, error);
  }
  return data;
}

export async function getOrganisation(id: string): Promise<OrganisationDetail | null> {
  const { data, error, response } = await api.GET("/v1/organisations/{id}", {
    params: { path: { id } },
  });
  if (response.status === 404) {
    return null;
  }
  if (!data) {
    throw new ApiError(response.status, error);
  }
  return data;
}

async function required<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (data === undefined) {
    throw new ApiError(response.status, error);
  }
  return data;
}

export const getSitemapIndex = () => required(api.GET("/v1/sitemap"));

export const getSitemapItems = (page: number) =>
  required(api.GET("/v1/sitemap/items/{page}", { params: { path: { page } } }));

export const getSitemapOrganisations = () => required(api.GET("/v1/sitemap/organisations"));

export const getMetrics = () => required(api.GET("/v1/metrics"));

let status: { at: number; value: DataStatus | null } | null = null;

// Every page's footer shows it, so it's fetched at most once a minute.
export async function getDataStatus(): Promise<DataStatus | null> {
  if (status && Date.now() - status.at < 60_000) {
    return status.value;
  }
  let value: DataStatus | null = null;
  try {
    value = (await api.GET("/v1/status")).data ?? null;
  } catch {
    // Unknown is fine: the footer just leaves the line out.
  }
  status = { at: Date.now(), value };
  return value;
}
