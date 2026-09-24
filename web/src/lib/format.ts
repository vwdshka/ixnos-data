// Greek formatting for money and dates. Dates are shown in Greek time whatever the server's zone.

const TIME_ZONE = "Europe/Athens";

export function intlLocale(locale: string): string {
  return locale === "en" ? "en-GB" : "el-GR";
}

// CPV and NUTS labels: English when there is one, else Greek, else the bare code.
export function codeLabel(entry: { code: string; labelEl?: string | null; labelEn?: string | null }, locale: string): string {
  return (locale === "en" ? entry.labelEn : null) ?? entry.labelEl ?? entry.code;
}

export function formatEuro(amount: number | null | undefined, locale = "el"): string | null {
  if (amount == null) {
    return null;
  }
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

export function formatDate(value: string | null | undefined, locale = "el"): string | null {
  if (!value) {
    return null;
  }
  // Date-only values ("2026-09-15") are calendar days, not instants: don't shift them.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : TIME_ZONE,
  }).format(new Date(dateOnly ? `${value}T00:00:00Z` : value));
}

export function formatDateTime(value: string | null | undefined, locale = "el"): string | null {
  if (!value) {
    return null;
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

// "2026-09-23" for an instant, as a calendar day in Greek time.
const athensDay = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/**
 * Calendar days (Greek time) until a deadline: 0 means it closes today, 1 tomorrow. Null for
 * missing or already passed deadlines.
 */
export function daysUntil(value: string | null | undefined, now: Date = new Date()): number | null {
  const deadline = value ? new Date(value) : null;
  if (!deadline || Number.isNaN(deadline.getTime()) || deadline < now) {
    return null;
  }
  const day = (date: Date) => Date.parse(athensDay.format(date));
  return Math.round((day(deadline) - day(now)) / 86_400_000);
}

// "12 minutes ago", "3 hours ago", "2 days ago", in the page's language.
export function formatAgo(value: string, locale = "el", now = Date.now()): string {
  const minutes = Math.max(1, Math.round((now - new Date(value).getTime()) / 60_000));
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "always" });
  if (minutes < 60) {
    return format.format(-minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? format.format(-hours, "hour") : format.format(-Math.round(hours / 24), "day");
}
