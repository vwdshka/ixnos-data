import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TapeStrip } from "@/components/tape/TapeStrip";
import { getItem, type ItemDetail, type ItemSummary } from "@/lib/api/client";
import { readTapeIds } from "@/lib/tape";

export async function generateMetadata({ params }: PageProps<"/[locale]/tape">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Tape" });
  // Any combination of records is a tape: not worth indexing.
  return { title: t("title"), robots: { index: false } };
}

// The record as a list slip, the same card as in search results.
function toSummary(item: ItemDetail): ItemSummary {
  return { ...item, nutsCode: item.nuts?.code ?? null, cpvCodes: item.cpv.map((cpv) => cpv.code) };
}

export default async function TapePage({ params, searchParams }: PageProps<"/[locale]/tape">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ids = readTapeIds((await searchParams).ids);
  const items = (await Promise.all(ids.map((id) => getItem(id).catch(() => null)))).filter(
    (found): found is ItemDetail => found !== null,
  );

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <TapeStrip items={items.map(toSummary)} />
    </main>
  );
}
