import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ItemCard } from "@/components/items/ItemCard";
import { ShareButton } from "@/components/items/ShareButton";
import { TapeClear } from "@/components/tape/TapeClear";
import { getItem, type ItemDetail, type ItemSummary } from "@/lib/api/client";
import { formatEuro, intlLocale } from "@/lib/format";
import { TAPE_MAX } from "@/lib/tape";

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

function readIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, TAPE_MAX);
}

export default async function TapePage({ params, searchParams }: PageProps<"/[locale]/tape">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, item] = await Promise.all([getTranslations("Tape"), getTranslations("Item")]);
  const ids = readIds((await searchParams).ids);
  const items = (await Promise.all(ids.map((id) => getItem(id).catch(() => null)))).filter(
    (found): found is ItemDetail => found !== null,
  );

  // ΚΗΜΔΗΣ amounts exclude VAT and Διαύγεια amounts include it: two totals, never one.
  const counted = items.filter((i) => !i.cancelled && !i.amountImplausible);
  const exVat = counted.filter((i) => i.amountEur != null).reduce((sum, i) => sum + (i.amountEur ?? 0), 0);
  const incVat = counted.filter((i) => i.amountEur == null && i.amountWithVatEur != null).reduce((sum, i) => sum + (i.amountWithVatEur ?? 0), 0);
  const nf = new Intl.NumberFormat(intlLocale(locale));

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="max-w-[68ch] leading-relaxed">{items.length > 0 ? t("intro") : t("empty", { max: TAPE_MAX })}</p>
      </header>

      {items.length > 0 && (
        <>
          <ol className="tape-roll flex flex-col gap-3">
            {items.map((found, index) => (
              <ItemCard key={found.sourceId} item={toSummary(found)} index={index} />
            ))}
          </ol>

          <div className="slip-shadow tape-join">
            <section className="slip flex flex-col gap-2 px-5 pt-5 font-mono text-sm sm:px-8" aria-label={t("total")}>
              <div className="leader">
                <span>{t("records", { count: items.length })}</span>
                <span>{nf.format(items.length)}</span>
              </div>
              <dl className="total-rule flex flex-col gap-1.5 pb-3">
                {exVat > 0 && (
                  <div className="leader text-base font-bold sm:text-lg">
                    <dt>{t("totalEx")}</dt>
                    <dd>{formatEuro(exVat, locale)}</dd>
                  </div>
                )}
                {incVat > 0 && (
                  <div className="leader text-base font-bold sm:text-lg">
                    <dt>{t("totalInc")}</dt>
                    <dd>{formatEuro(incVat, locale)}</dd>
                  </div>
                )}
              </dl>
              {exVat > 0 && incVat > 0 && <p className="font-sans leading-relaxed">{t("totalNote")}</p>}
              <div className="flex flex-wrap gap-2 pt-2 font-sans print:hidden">
                <ShareButton title={t("title")} labels={{ share: item("share"), copied: item("copied") }} />
                <TapeClear label={t("clear")} />
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
