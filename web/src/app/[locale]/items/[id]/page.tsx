import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { ItemReceipt } from "@/components/items/ItemReceipt";
import { getPathname } from "@/i18n/navigation";
import { getItem, type ItemDetail, type ItemSummary, searchItems } from "@/lib/api/client";
import { formatEuro } from "@/lib/format";
import { alternates, openGraph, SITE_URL } from "@/lib/site";

// Metadata and the page both need the record; fetch it once per request.
const loadItem = cache((id: string) => getItem(decodeURIComponent(id)));

// The same CPV class (first five digits) and stage, newest first. Nothing when search is slow
// or down: it's an extra, not the page.
async function similarTo(item: ItemDetail): Promise<{ cpv: string; items: ItemSummary[] } | null> {
  const code = item.cpv[0]?.code;
  if (!code) {
    return null;
  }
  const cpv = code.slice(0, 5);
  const outcome = await searchItems({ cpv, kind: [item.kind], sort: "newest", pageSize: 6 }).catch(() => null);
  if (!outcome?.ok) {
    return null;
  }
  const items = outcome.result.items.filter((other) => other.sourceId !== item.sourceId).slice(0, 5);
  return items.length > 0 ? { cpv, items } : null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/items/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const item = await loadItem(id);
  if (!item) {
    return {};
  }
  // What a shared link's preview shows.
  const summary = [item.organisation?.name, formatEuro(item.amountEur, locale), item.description]
    .filter(Boolean)
    .join(" · ");
  const description = summary.length > 200 ? `${summary.slice(0, 199)}…` : summary;
  return {
    title: item.title,
    description,
    alternates: alternates(`/items/${encodeURIComponent(item.sourceId)}`, locale),
    openGraph: { ...openGraph(item.title, description, locale), type: "article" },
  };
}

export default async function ItemPage({ params }: PageProps<"/[locale]/items/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const item = await loadItem(id);
  if (!item) {
    notFound();
  }
  const similar = await similarTo(item);

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <ItemReceipt
        item={item}
        similar={similar}
        qrUrl={SITE_URL + getPathname({ href: `/items/${encodeURIComponent(item.sourceId)}`, locale })}
        calendar
      />
    </main>
  );
}
