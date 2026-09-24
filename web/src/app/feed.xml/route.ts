import { getTranslations } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import { searchItems } from "@/lib/api/client";
import { toRss } from "@/lib/downloads";
import { formatDateTime, formatEuro } from "@/lib/format";
import { readSearchValues, searchQueryString, toSearchParams } from "@/lib/search";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// /feed.xml?{any search}&lang=el: the 50 newest records of a search, for feed readers. Alerts
// without an account.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get("lang") === "en" ? "en" : "el";
  const values = { ...readSearchValues((name) => url.searchParams.get(name)), sort: undefined };

  let outcome;
  try {
    outcome = await searchItems(toSearchParams({ ...values, sort: "newest" }, 1, 50));
  } catch {
    return new Response("Search is unavailable right now.", { status: 503 });
  }
  if (!outcome.ok) {
    return new Response("Invalid search.", { status: 400 });
  }

  const t = await getTranslations({ locale, namespace: "Feed" });
  const query = searchQueryString(values);
  const itemUrl = (id: string) => SITE_URL + getPathname({ href: `/items/${encodeURIComponent(id)}`, locale });
  const rss = toRss(
    {
      title: t("title", { search: values.q ?? t("allRecords") }),
      url: SITE_URL + getPathname({ href: "/search", locale }) + (query ? `?${query}` : ""),
      description: t("description"),
      language: locale,
    },
    outcome.result.items.map((item) => ({
      title: item.title,
      url: itemUrl(item.sourceId),
      description: [
        item.organisation?.name,
        formatEuro(item.amountEur ?? item.amountWithVatEur, locale),
        item.deadlineAt && t("deadline", { date: formatDateTime(item.deadlineAt, locale) ?? "" }),
      ]
        .filter(Boolean)
        .join(" · "),
      publishedAt: new Date(item.publishedAt),
    })),
  );
  return new Response(rss, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" },
  });
}
