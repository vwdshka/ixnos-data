import { routing } from "@/i18n/routing";
import { getSitemapIndex } from "@/lib/api/client";
import { SITE_URL } from "@/lib/site";

// Rendered on request: the number of record pages grows with every ingestion run.
export const dynamic = "force-dynamic";

/** Sitemap index: per locale, organisations, then records in pages of 50,000. */
export async function GET() {
  const { itemPages } = await getSitemapIndex();
  const files = routing.locales.flatMap((locale) => [
    `organisations-${locale}.xml`,
    ...Array.from({ length: itemPages }, (_, i) => `items-${i}-${locale}.xml`),
  ]);
  const body = files.map((file) => `<sitemap><loc>${SITE_URL}/sitemaps/${file}</loc></sitemap>`).join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
