import { getPathname } from "@/i18n/navigation";
import { type ItemSummary, searchItems } from "@/lib/api/client";
import { toCsv } from "@/lib/downloads";
import { readSearchValues, toSearchParams } from "@/lib/search";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Limit: the first 1,000 results (10 API pages). Whole datasets are in the daily exports.
const LIMIT = 1000;
const PAGE_SIZE = 100;

const HEADERS = {
  el: ["ΑΔΑΜ/ΑΔΑ", "Πηγή", "Είδος", "Τίτλος", "Φορέας", "Ποσό χωρίς ΦΠΑ (€)", "Ποσό με ΦΠΑ (€)", "Δημοσίευση", "Προθεσμία", "NUTS", "CPV", "Ακυρώθηκε", "Σύνδεσμος"],
  en: ["ΑΔΑΜ/ΑΔΑ", "Source", "Type", "Title", "Organisation", "Amount excl. VAT (€)", "Amount incl. VAT (€)", "Published", "Deadline", "NUTS", "CPV", "Cancelled", "Link"],
};

// /search.csv?{any search}&lang=el: the search's results as a spreadsheet, in the page's order.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get("lang") === "en" ? "en" : "el";
  const values = readSearchValues((name) => url.searchParams.get(name));

  const items: ItemSummary[] = [];
  try {
    for (let page = 1; items.length < LIMIT; page++) {
      const outcome = await searchItems(toSearchParams(values, page, PAGE_SIZE));
      if (!outcome.ok) {
        return new Response("Invalid search.", { status: 400 });
      }
      items.push(...outcome.result.items);
      if (outcome.result.items.length < PAGE_SIZE) {
        break;
      }
    }
  } catch {
    return new Response("Search is unavailable right now.", { status: 503 });
  }

  const csv = toCsv(
    HEADERS[locale],
    items.slice(0, LIMIT).map((item) => [
      item.sourceId,
      item.source,
      item.kind,
      item.title,
      item.organisation?.name,
      item.amountEur,
      item.amountWithVatEur,
      item.publishedAt.slice(0, 10),
      item.deadlineAt,
      item.nutsCode,
      item.cpvCodes.join(" "),
      item.cancelled ? "1" : "",
      SITE_URL + getPathname({ href: `/items/${encodeURIComponent(item.sourceId)}`, locale }),
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ixnos-data-search.csv"',
    },
  });
}
