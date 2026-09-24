import { describe, expect, it } from "vitest";
import { envelope, parseDsn } from "./sentry";

describe("sentry", () => {
  it("builds the envelope endpoint and auth header from a DSN", () => {
    const target = parseDsn("https://abc123@o1.ingest.de.sentry.io/4507");
    expect(target?.url).toBe("https://o1.ingest.de.sentry.io/api/4507/envelope/");
    expect(target?.auth).toContain("sentry_key=abc123");
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("not a dsn")).toBeNull();
  });

  it("sends the path without its query string", () => {
    const target = parseDsn("https://abc123@o1.ingest.de.sentry.io/4507")!;
    const [header, type, event] = envelope(target, new Error("boom"), "/search?q=secret", "GET").split("\n");
    expect(JSON.parse(header).event_id).toHaveLength(32);
    expect(JSON.parse(type)).toEqual({ type: "event" });
    expect(event).not.toContain("secret");
    expect(JSON.parse(event).exception.values[0].value).toBe("boom");
  });
});
