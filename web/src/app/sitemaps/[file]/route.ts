import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getSitemapItems, getSitemapOrganisations } from "@/lib/api/client";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// One page in one locale, listing its hreflang alternates.
function url(path: string, locale: string, updatedAt: string): string {
  const href = (l: string) => escape(SITE_URL + getPathname({ href: path, locale: l }));
  const links = routing.locales.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${href(l)}"/>`).join("");
  return `<url><loc>${href(locale)}</loc><lastmod>${updatedAt}</lastmod>${links}</url>`;
}

/** organisations-{locale}.xml, or items-{N}-{locale}.xml for page N of the records. */
export async function GET(_: Request, { params }: RouteContext<"/sitemaps/[file]">) {
  const { file } = await params;
  const match = /^(organisations|items-(\d+))-(\w+)\.xml$/.exec(file);
  const locale = match?.[3];
  if (!match || !locale || !(routing.locales as readonly string[]).includes(locale)) {
    return new Response("Not found", { status: 404 });
  }
  const entries =
    match[2] === undefined
      ? (await getSitemapOrganisations()).map((e) => url(`/organisations/${encodeURIComponent(e.id)}`, locale, e.updatedAt))
      : (await getSitemapItems(Number(match[2]))).map((e) => url(`/items/${encodeURIComponent(e.id)}`, locale, e.updatedAt));
  if (entries.length === 0) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join("")}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
