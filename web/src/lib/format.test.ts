import { describe, expect, it } from "vitest";
import { daysUntil, formatAgo, formatDate, formatDateTime, formatEuro } from "./format";

// Intl output uses narrow no-break spaces; compare with ordinary spaces.
const plain = (text: string | null) => text?.replace(/[  ]/g, " ") ?? null;

describe("formatEuro", () => {
  it("uses Greek grouping and drops cents on large amounts", () => {
    expect(plain(formatEuro(19800))).toBe("19.800 €");
  });

  it("keeps cents on small amounts", () => {
    expect(plain(formatEuro(49.6))).toBe("49,60 €");
  });

  it("returns null for missing amounts", () => {
    expect(formatEuro(null)).toBeNull();
    expect(formatEuro(undefined)).toBeNull();
  });
});

describe("formatDate", () => {
  it("shows instants in Greek time", () => {
    // 22:30 UTC on 14 September is already 15 September in Athens.
    expect(formatDate("2026-09-14T22:30:00Z")).toBe("15 Σεπ 2026");
  });

  it("never shifts date-only values", () => {
    expect(formatDate("2026-12-31")).toBe("31 Δεκ 2026");
  });

  it("returns null for missing dates", () => {
    expect(formatDate(null)).toBeNull();
  });
});

describe("formatDateTime", () => {
  it("includes the Greek local time", () => {
    expect(plain(formatDateTime("2026-09-21T09:00:00Z"))).toContain("12:00");
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-09-23T09:00:00Z");

  it("counts calendar days in Greek time", () => {
    expect(daysUntil("2026-09-30T09:00:00Z", now)).toBe(7);
    expect(daysUntil("2026-09-24T06:00:00Z", now)).toBe(1);
    expect(daysUntil("2026-09-23T20:00:00Z", now)).toBe(0);
    // 22:30 UTC on the 23rd is already the 24th in Athens.
    expect(daysUntil("2026-09-23T22:30:00Z", now)).toBe(1);
  });

  it("returns null for passed or missing deadlines", () => {
    expect(daysUntil("2026-09-22T09:00:00Z", now)).toBeNull();
    expect(daysUntil(null, now)).toBeNull();
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-09-24T10:00:00Z");

  it("says minutes, then hours, then days, in the page's language", () => {
    expect(formatAgo("2026-09-24T09:48:00Z", "en", now)).toBe("12 minutes ago");
    expect(formatAgo("2026-09-24T09:59:50Z", "en", now)).toBe("1 minute ago");
    expect(formatAgo("2026-09-24T07:00:00Z", "en", now)).toBe("3 hours ago");
    expect(formatAgo("2026-09-21T10:00:00Z", "en", now)).toBe("3 days ago");
    expect(formatAgo("2026-09-24T09:48:00Z", "el", now)).toBe("πριν από 12 λεπτά");
  });
});
