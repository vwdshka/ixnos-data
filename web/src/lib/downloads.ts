// Plain-text formats the site hands out: a calendar event, an RSS feed and a CSV table.

// --- iCalendar (RFC 5545) ------------------------------------------------------------------

const icsText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const icsTime = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Lines longer than 75 bytes continue on the next line after a space; Greek letters take two
// bytes each, so the cut is by bytes, never inside a character.
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export type DeadlineEvent = {
  id: string;
  title: string;
  description: string;
  url: string;
  deadline: Date;
  reminder: string;
  now?: Date;
};

// A half-hour event ending at the deadline, with a reminder the day before.
export function toIcs(event: DeadlineEvent): string {
  const start = new Date(event.deadline.getTime() - 30 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ixnos-data//deadlines//EL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@ixnos-data`,
    `DTSTAMP:${icsTime(event.now ?? new Date())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(event.deadline)}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    `URL:${event.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(event.reminder)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// --- RSS 2.0 --------------------------------------------------------------------------------

const xml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type FeedItem = { title: string; url: string; description: string; publishedAt: Date };

export function toRss(channel: { title: string; url: string; description: string; language: string }, items: FeedItem[]): string {
  const entries = items
    .map(
      (item) =>
        `<item><title>${xml(item.title)}</title><link>${xml(item.url)}</link>` +
        `<guid isPermaLink="true">${xml(item.url)}</guid><pubDate>${item.publishedAt.toUTCString()}</pubDate>` +
        `<description>${xml(item.description)}</description></item>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>` +
    `<title>${xml(channel.title)}</title><link>${xml(channel.url)}</link>` +
    `<description>${xml(channel.description)}</description><language>${channel.language}</language>` +
    `${entries}</channel></rss>`
  );
}

// --- CSV --------------------------------------------------------------------------------------

// Quotes every field. A field that starts like a formula (=, +, -, @) gets a leading apostrophe,
// so a spreadsheet shows it as text instead of running it.
function csvField(value: string | number | null | undefined): string {
  if (value == null) {
    return "";
  }
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

// With a byte-order mark, so Excel opens Greek text as UTF-8.
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
