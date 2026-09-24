import { describe, expect, it } from "vitest";
import { toCsv, toIcs, toRss } from "./downloads";

describe("calendar event", () => {
  const ics = toIcs({
    id: "26PROC019824386",
    title: "Λήξη υποβολής: Προμήθεια νωπών κρεάτων, βοδινό; χοιρινό",
    description: "ΥΠΟΥΡΓΕΙΟ ΕΘΝΙΚΗΣ ΑΜΥΝΑΣ\nhttps://example.org/items/26PROC019824386",
    url: "https://example.org/items/26PROC019824386",
    deadline: new Date("2026-09-29T12:00:00Z"),
    reminder: "Αύριο λήγει",
    now: new Date("2026-09-24T08:00:00Z"),
  });
  const unfolded = ics.replace(/\r\n /g, "");

  it("ends at the deadline, starts half an hour before, and reminds a day earlier", () => {
    expect(unfolded).toContain("DTSTART:20260929T113000Z\r\n");
    expect(unfolded).toContain("DTEND:20260929T120000Z\r\n");
    expect(unfolded).toContain("TRIGGER:-P1D\r\n");
  });

  it("escapes commas, semicolons and line breaks", () => {
    expect(unfolded).toContain("SUMMARY:Λήξη υποβολής: Προμήθεια νωπών κρεάτων\\, βοδινό\\; χοιρινό\r\n");
    expect(unfolded).toContain("DESCRIPTION:ΥΠΟΥΡΓΕΙΟ ΕΘΝΙΚΗΣ ΑΜΥΝΑΣ\\nhttps://example.org/items/26PROC019824386\r\n");
  });

  it("keeps every line within 75 bytes, never splitting a Greek letter", () => {
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
  });
});

describe("RSS feed", () => {
  it("escapes titles and links and dates items in RFC 822", () => {
    const rss = toRss(
      { title: "ixnos-data: «καθαρισμός» & more", url: "https://example.org/search?q=a&nuts=EL54", description: "d", language: "el" },
      [{ title: "A <b>tender</b>", url: "https://example.org/items/1", description: "x", publishedAt: new Date("2026-09-21T09:00:00Z") }],
    );
    expect(rss).toContain("<title>ixnos-data: «καθαρισμός» &amp; more</title>");
    expect(rss).toContain("<link>https://example.org/search?q=a&amp;nuts=EL54</link>");
    expect(rss).toContain("<title>A &lt;b&gt;tender&lt;/b&gt;</title>");
    expect(rss).toContain("<pubDate>Mon, 21 Sep 2026 09:00:00 GMT</pubDate>");
  });
});

describe("CSV", () => {
  it("quotes fields, doubles quotes and defuses formulas", () => {
    const csv = toCsv(["title", "amount"], [["Προμήθεια \"Α\"", 12000], ["=HYPERLINK(\"x\")", null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Προμήθεια ""Α""","12000"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")",`);
  });
});
