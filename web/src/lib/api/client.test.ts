import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  // As Caddy sends it: the visitor first, then any proxies.
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.2" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("API client", () => {
  it("passes the visitor's address on, so rate limits are per visitor", async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        seen.push(request.headers.get("x-forwarded-for"));
        return Response.json({ itemPages: 1 });
      }),
    );
    const { api } = await import("./client");

    await api.GET("/v1/sitemap");

    expect(seen).toEqual(["203.0.113.9"]);
  });
});
